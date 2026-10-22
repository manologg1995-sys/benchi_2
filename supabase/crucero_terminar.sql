-- "Crucero al límite": las millas se acumulan durante el JUEGO y se reparten al pulsar «Terminar juego».
-- Aplicar después de crucero_millas.sql. Se puede ejecutar varias veces.
--   · Cada ronda solo suma millas (no convierte).
--   · cr_end_game reparte: 5 millas = 1 punto de Benchi (las que no llegan a 5 no se convierten)
--     y deja el juego a cero.
--   · Desactivar el minijuego termina el juego (repartiendo lo ganado); al activarlo se empieza de cero.

-- Juego en curso de cada aula
create table if not exists public.cr_games (
  class_id    uuid primary key references public.classes(id) on delete cascade,
  match_no    integer not null default 1,           -- nº interno del juego en curso (no se muestra)
  started_at  timestamptz not null default now(),
  last_result jsonb,                                -- resumen del último juego terminado
  last_ended_at timestamptz
);
alter table public.cr_games enable row level security;

-- Las aulas que ya tenían rondas empiezan un juego nuevo, sin arrastrar nada
insert into public.cr_games (class_id, match_no)
  select class_id, max(match_no) + 1 from public.cr_rounds group by class_id
  on conflict (class_id) do nothing;

-- Juego en curso (lo crea si no existe)
create or replace function public._cr_game(p_class uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  insert into cr_games (class_id) values (p_class) on conflict (class_id) do nothing;
  select match_no into v from cr_games where class_id = p_class;
  return v;
end; $$;

-- Reparte las millas del juego en curso y empieza uno nuevo. Devuelve el resumen.
create or replace function public._cr_end_game(p_class uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare w record; v_pts integer; v_rows jsonb := '[]'::jsonb; v_total integer := 0;
begin
  perform _cr_game(p_class);
  perform 1 from cr_games where class_id = p_class for update;
  update cr_rounds set status = 'cancelled' where class_id = p_class and status in ('boarding','playing','closed');
  for w in select cw.student_id, cw.millas, pr.name from cr_wallet cw join profiles pr on pr.id = cw.student_id
           where cw.class_id = p_class and cw.millas > 0 order by cw.millas desc, pr.name loop
    v_pts := w.millas / 5;
    if v_pts > 0 and exists (select 1 from class_members where class_id = p_class and student_id = w.student_id) then
      update class_members set points = points + v_pts where class_id = p_class and student_id = w.student_id;
      insert into points_log (class_id, student_id, delta, reason, type)
        values (p_class, w.student_id, v_pts,
                'Crucero al límite: ' || w.millas || ' millas → ' || v_pts || case when v_pts = 1 then ' punto' else ' puntos' end,
                'minijuego');
    else
      v_pts := 0;
    end if;
    v_total := v_total + v_pts;
    v_rows := v_rows || jsonb_build_object('id', w.student_id, 'name', w.name, 'millas', w.millas, 'points', v_pts);
  end loop;
  delete from cr_wallet where class_id = p_class;
  update cr_games set match_no = match_no + 1, started_at = now(),
    last_result = case when jsonb_array_length(v_rows) > 0 then jsonb_build_object('rows', v_rows, 'total', v_total) end,
    last_ended_at = now()
    where class_id = p_class;
  return jsonb_build_object('rows', v_rows, 'total', v_total);
end; $$;

create or replace function public.cr_end_game(p_class uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not is_teacher_of(p_class) then raise exception 'Solo el profesor de la clase puede terminar el juego'; end if;
  if exists (select 1 from cr_rounds where class_id = p_class and status in ('boarding','playing','closed')) then
    raise exception 'Hay una pregunta en marcha: revélala o cancélala antes de terminar el juego';
  end if;
  return _cr_end_game(p_class);
end; $$;

-- Activar / desactivar: desactivar termina el juego (repartiendo lo ganado); activar empieza de cero
create or replace function public.set_minigame(p_class uuid, p_game text, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_round uuid; v_was boolean;
begin
  if not is_teacher_of(p_class) then
    raise exception 'Solo el profesor de la clase puede activar minijuegos';
  end if;
  if p_game not in ('horses','crucero') then raise exception 'Minijuego desconocido'; end if;
  select enabled into v_was from class_minigames where class_id = p_class and game = p_game;
  insert into class_minigames (class_id, game, enabled) values (p_class, p_game, p_enabled)
    on conflict (class_id, game) do update set enabled = excluded.enabled, updated_at = now();
  if p_game = 'horses' then
    if not p_enabled then
      for v_round in select id from horse_rounds where class_id = p_class and status = 'open' loop
        perform _horse_cancel(v_round);
      end loop;
    end if;
  elsif not p_enabled then
    perform _cr_end_game(p_class);                       -- nadie pierde lo ganado
  elsif not coalesce(v_was, false) then
    perform _cr_end_game(p_class);                       -- por si quedara algo: juego nuevo desde cero
    update cr_games set last_result = null where class_id = p_class;
  end if;
end; $$;

-- Abrir ronda: siempre dentro del juego en curso
create or replace function public.cr_open_round(p_class uuid, p_question uuid, p_mode text, p_value integer,
  p_board_secs integer, p_turn_secs integer, p_new_match boolean default false,
  p_source text default 'todas', p_level text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare q cr_questions%rowtype; v_id uuid; v_no integer; v_match integer;
begin
  if not is_teacher_of(p_class) then raise exception 'Solo el profesor de la clase puede abrir rondas'; end if;
  if not coalesce((select enabled from class_minigames where class_id = p_class and game = 'crucero'), false) then
    raise exception 'Este minijuego no está activado en esta aula';
  end if;
  if exists (select 1 from cr_rounds where class_id = p_class and status in ('boarding','playing','closed')) then
    raise exception 'Ya hay una pregunta en marcha';
  end if;
  if p_value < 1 or p_value > 10 then raise exception 'Valor no válido'; end if;
  if p_board_secs < 5 or p_board_secs > 180 then raise exception 'Tiempo de embarque no válido'; end if;
  if p_turn_secs < 5 or p_turn_secs > 120 then raise exception 'Tiempo por turno no válido'; end if;
  if coalesce(p_source, '') not in ('benchi','mias','todas') then raise exception 'Banco no válido'; end if;
  if p_level is not null and p_level not in ('principiante','intermedio','avanzado') then raise exception 'Nivel no válido'; end if;

  if p_question is not null then
    select * into q from cr_questions where id = p_question and (teacher_id is null or teacher_id = auth.uid());
    if not found then raise exception 'Pregunta no encontrada'; end if;
  else
    select c.* into q from cr_questions c
      where (case p_source when 'benchi' then c.teacher_id is null
                           when 'mias'   then c.teacher_id = auth.uid()
                           else c.teacher_id is null or c.teacher_id = auth.uid() end)
        and (p_level is null or c.level = p_level)
      order by c.id in (select question_id from cr_rounds
                         where class_id = p_class and question_id is not null
                         order by round_no desc limit 40), random()
      limit 1;
    if not found then
      raise exception '%', case when p_source = 'mias' then 'Todavía no tienes preguntas propias' || coalesce(' de nivel ' || p_level, '')
                                else 'No hay preguntas con ese filtro' end;
    end if;
  end if;

  v_match := _cr_game(p_class);
  select coalesce(max(round_no), 0) + 1 into v_no from cr_rounds where class_id = p_class;

  insert into cr_rounds (class_id, match_no, round_no, mode, value, question_id, q_text, q_unit, answer,
                         turn_secs, boarding_closes_at)
    values (p_class, v_match, v_no, 'puntos', p_value, q.id, q.text, q.unit, q.answer,
            p_turn_secs, now() + make_interval(secs => p_board_secs))
    returning id into v_id;
  return v_id;
end; $$;

-- Revelar: solo suma millas al juego en curso (se convierten al terminar el juego)
create or replace function public.cr_reveal(p_round uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r cr_rounds%rowtype; p record; v_ok boolean; v_exact boolean; v_d integer;
begin
  select * into r from cr_rounds where id = p_round for update;
  if not found or not is_teacher_of(r.class_id) then raise exception 'Solo el profesor de la clase'; end if;
  perform _cr_advance(p_round);
  select * into r from cr_rounds where id = p_round;
  if r.status <> 'closed' then raise exception 'Todavía quedan turnos por jugar'; end if;

  v_ok := r.bid is not null and r.bid <= r.answer;
  v_exact := r.bid is not null and r.bid = r.answer;

  for p in select * from cr_players where round_id = p_round for update loop
    if r.bid is null or p.status in ('out','waiting') then v_d := 0;
    elsif p.student_id = r.captain then v_d := case when v_exact then 6 when v_ok then 4 else 0 end;
    elsif p.status = 'crew' then v_d := case when v_ok then 2 else 0 end;
    else v_d := case when v_ok then 0 else 2 end;
    end if;
    v_d := v_d * r.value;
    if v_d > 0 then
      insert into cr_wallet (class_id, student_id, millas, total) values (r.class_id, p.student_id, v_d, v_d)
        on conflict (class_id, student_id) do update
          set millas = cr_wallet.millas + excluded.millas, total = cr_wallet.total + excluded.total, updated_at = now();
    end if;
    update cr_players set delta = v_d, points = 0 where round_id = p_round and student_id = p.student_id;
  end loop;

  update cr_rounds set status = 'revealed', revealed_at = now() where id = p_round;
  insert into cr_events (round_id, kind, value) values (p_round, 'reveal', r.answer);
end; $$;

-- Estado: solo el juego en curso; marcador = millas del juego; resumen del último juego terminado
create or replace function public.cr_state(p_class uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); r cr_rounds%rowtype; v_teacher boolean := is_teacher_of(p_class);
  v_enabled boolean; v_pts integer; v_players jsonb := '[]'::jsonb; v_events jsonb := '[]'::jsonb; v_board jsonb;
  v_current uuid; v_millas integer; g cr_games%rowtype; v_last jsonb; v_rounds integer;
begin
  if not v_teacher and not is_member_of(p_class) then raise exception 'No perteneces a esta aula'; end if;
  v_enabled := coalesce((select enabled from class_minigames where class_id = p_class and game = 'crucero'), false);
  perform _cr_game(p_class);
  select * into g from cr_games where class_id = p_class;
  select points into v_pts from class_members where class_id = p_class and student_id = v_uid;
  select coalesce((select millas from cr_wallet where class_id = p_class and student_id = v_uid), 0) into v_millas;
  select * into r from cr_rounds where class_id = p_class and match_no = g.match_no order by round_no desc limit 1;
  select count(*) into v_rounds from cr_rounds where class_id = p_class and match_no = g.match_no and status = 'revealed';

  select coalesce(jsonb_agg(jsonb_build_object('id', t.student_id, 'name', t.name, 'score', t.millas) order by t.millas desc, t.name), '[]'::jsonb)
    into v_board
    from (select cw.student_id, pr.name, cw.millas from cr_wallet cw join profiles pr on pr.id = cw.student_id
           where cw.class_id = p_class and cw.millas > 0 order by cw.millas desc, pr.name limit 10) t;

  -- Resumen del último juego: el profesor lo ve entero; el alumno solo su línea
  if g.last_result is not null then
    v_last := jsonb_build_object('ended_at', (extract(epoch from g.last_ended_at) * 1000)::bigint,
      'total', g.last_result->'total',
      'rows', case when v_teacher then g.last_result->'rows'
                   else coalesce((select jsonb_agg(x) from jsonb_array_elements(g.last_result->'rows') x where x->>'id' = v_uid::text), '[]'::jsonb) end);
  end if;

  if r.id is not null then
    if r.status in ('boarding','playing') then
      perform _cr_advance(r.id);
      select * into r from cr_rounds where id = r.id;
    end if;
    v_current := case when r.status = 'playing' then r.seats[r.turn] end;

    select coalesce(jsonb_agg(jsonb_build_object('id', p.student_id, 'name', pr.name, 'seat', p.seat, 'status', p.status,
             'auto', p.auto, 'captain', p.student_id = r.captain,
             'delta', case when r.status = 'revealed' then p.delta end)
             order by p.seat nulls last, p.created_at), '[]'::jsonb)
      into v_players
      from cr_players p join profiles pr on pr.id = p.student_id where p.round_id = r.id;

    select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'name', pr.name, 'who', e.student_id,
             'value', case when e.kind = 'reveal' and r.status <> 'revealed' then null else e.value end) order by e.id desc), '[]'::jsonb)
      into v_events
      from (select * from cr_events where round_id = r.id order by id desc limit 14) e
      left join profiles pr on pr.id = e.student_id;
  end if;

  return jsonb_build_object(
    'enabled', v_enabled, 'me', v_uid, 'teacher', v_teacher,
    'now', (extract(epoch from clock_timestamp()) * 1000)::bigint,
    'my_points', v_pts, 'my_millas', v_millas, 'rate', 5,
    'members', (select count(*) from class_members where class_id = p_class),
    'board', v_board, 'my_score', v_millas, 'played', v_rounds,
    'game_millas', (select coalesce(sum(millas), 0) from cr_wallet where class_id = p_class),
    'last', v_last,
    'round', case when r.id is null then null else jsonb_build_object(
      'id', r.id, 'status', r.status, 'value', r.value,
      'question', r.q_text, 'unit', r.q_unit,
      'answer', case when r.status = 'revealed' then r.answer end,
      'boarding_closes_at', (extract(epoch from r.boarding_closes_at) * 1000)::bigint,
      'turn_secs', r.turn_secs,
      'turn', r.turn, 'seats_total', coalesce(array_length(r.seats, 1), 0),
      'turn_deadline', case when r.status = 'playing' then (extract(epoch from r.turn_deadline) * 1000)::bigint end,
      'current', v_current,
      'current_name', (select name from profiles where id = v_current),
      'captain', r.captain, 'captain_name', (select name from profiles where id = r.captain),
      'bid', r.bid,
      'players', v_players,
      'events', v_events) end);
end; $$;

revoke execute on function public._cr_game(uuid) from public, anon, authenticated;
revoke execute on function public._cr_end_game(uuid) from public, anon, authenticated;
revoke execute on function public.cr_end_game(uuid) from public, anon;
grant execute on function public.cr_end_game(uuid) to authenticated;
