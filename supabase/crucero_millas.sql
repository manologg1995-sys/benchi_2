-- "Crucero al límite" con millas (aplicar después de crucero.sql).
-- En el juego se ganan MILLAS (puntos propios del crucero). Cada 5 millas se convierten
-- automáticamente en 1 punto de Benchi; lo que sobra se guarda para la próxima ronda.
-- Desaparece la opción «con puntos / solo marcador»: siempre se juega con millas.

-- Millas pendientes de convertir de cada alumno en cada aula
create table if not exists public.cr_wallet (
  class_id   uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  millas     integer not null default 0 check (millas >= 0),   -- pendientes (siempre menos de 5 tras convertir)
  total      integer not null default 0 check (total >= 0),    -- millas ganadas en total
  updated_at timestamptz not null default now(),
  primary key (class_id, student_id)
);
alter table public.cr_wallet enable row level security;   -- solo se toca desde las funciones

-- Puntos de Benchi que se convirtieron en cada ronda
alter table public.cr_players add column if not exists points integer;

-- Siempre en modo millas (se mantiene p_mode en la firma para no romper llamadas antiguas, pero se ignora)
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
    raise exception 'Ya hay una ronda en marcha';
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

  select coalesce(max(round_no), 0) + 1, coalesce(max(match_no), 0) into v_no, v_match
    from cr_rounds where class_id = p_class;
  if v_match = 0 or p_new_match then v_match := v_match + 1; end if;

  insert into cr_rounds (class_id, match_no, round_no, mode, value, question_id, q_text, q_unit, answer,
                         turn_secs, boarding_closes_at)
    values (p_class, v_match, v_no, 'puntos', p_value, q.id, q.text, q.unit, q.answer,
            p_turn_secs, now() + make_interval(secs => p_board_secs))
    returning id into v_id;
  return v_id;
end; $$;

-- Revela la respuesta, reparte MILLAS y convierte cada 5 millas en 1 punto de Benchi.
--                       la cifra final NO se pasa      la cifra final SE PASA     (× valor de la ronda)
--   Capitán             +4 millas (+6 si es exacta)    0
--   Siguen a bordo      +2 millas                      0
--   ¡Por aquí no paso!   0                             +2 millas
create or replace function public.cr_reveal(p_round uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r cr_rounds%rowtype; p record; v_ok boolean; v_exact boolean; v_d integer; v_bal integer; v_conv integer;
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
    v_conv := 0;

    if v_d > 0 and exists (select 1 from class_members where student_id = p.student_id and class_id = r.class_id) then
      insert into cr_wallet (class_id, student_id, millas, total) values (r.class_id, p.student_id, v_d, v_d)
        on conflict (class_id, student_id) do update
          set millas = cr_wallet.millas + excluded.millas, total = cr_wallet.total + excluded.total, updated_at = now()
        returning millas into v_bal;
      v_conv := v_bal / 5;                                              -- tasa: 5 millas = 1 punto
      if v_conv > 0 then
        update cr_wallet set millas = millas - v_conv * 5 where class_id = r.class_id and student_id = p.student_id;
        update class_members set points = points + v_conv where student_id = p.student_id and class_id = r.class_id;
        insert into points_log (class_id, student_id, delta, reason, type)
          values (r.class_id, p.student_id, v_conv,
                  'Crucero al límite: ' || (v_conv * 5) || ' millas → ' || v_conv || case when v_conv = 1 then ' punto' else ' puntos' end,
                  'minijuego');
      end if;
    end if;
    update cr_players set delta = v_d, points = v_conv where round_id = p_round and student_id = p.student_id;
  end loop;

  update cr_rounds set status = 'revealed', revealed_at = now() where id = p_round;
  insert into cr_events (round_id, kind, value) values (p_round, 'reveal', r.answer);
end; $$;

-- Estado: añade las millas pendientes del alumno, la tasa y los puntos convertidos por jugador
create or replace function public.cr_state(p_class uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); r cr_rounds%rowtype; v_teacher boolean := is_teacher_of(p_class);
  v_enabled boolean; v_pts integer; v_players jsonb; v_events jsonb; v_board jsonb; v_my_score integer; v_rounds integer;
  v_current uuid; v_millas integer;
begin
  if not v_teacher and not is_member_of(p_class) then raise exception 'No perteneces a esta aula'; end if;
  v_enabled := coalesce((select enabled from class_minigames where class_id = p_class and game = 'crucero'), false);
  select points into v_pts from class_members where class_id = p_class and student_id = v_uid;
  select coalesce((select millas from cr_wallet where class_id = p_class and student_id = v_uid), 0) into v_millas;
  select * into r from cr_rounds where class_id = p_class order by round_no desc limit 1;

  if r.id is null then
    return jsonb_build_object('enabled', v_enabled, 'round', null, 'me', v_uid, 'teacher', v_teacher,
      'now', (extract(epoch from clock_timestamp()) * 1000)::bigint, 'my_points', v_pts,
      'my_millas', v_millas, 'rate', 5,
      'members', (select count(*) from class_members where class_id = p_class), 'board', '[]'::jsonb, 'my_score', 0);
  end if;

  if r.status in ('boarding','playing') then
    perform _cr_advance(r.id);
    select * into r from cr_rounds where id = r.id;
  end if;
  v_current := case when r.status = 'playing' then r.seats[r.turn] end;

  select coalesce(jsonb_agg(jsonb_build_object('id', p.student_id, 'name', pr.name, 'seat', p.seat, 'status', p.status,
           'auto', p.auto, 'captain', p.student_id = r.captain,
           'delta', case when r.status = 'revealed' then p.delta end,
           'points', case when r.status = 'revealed' then coalesce(p.points, 0) end)
           order by p.seat nulls last, p.created_at), '[]'::jsonb)
    into v_players
    from cr_players p join profiles pr on pr.id = p.student_id where p.round_id = r.id;

  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'name', pr.name, 'who', e.student_id,
           'value', case when e.kind = 'reveal' and r.status <> 'revealed' then null else e.value end) order by e.id desc), '[]'::jsonb)
    into v_events
    from (select * from cr_events where round_id = r.id order by id desc limit 14) e
    left join profiles pr on pr.id = e.student_id;

  -- Marcador de la partida: millas ganadas en las rondas ya reveladas
  select coalesce(jsonb_agg(jsonb_build_object('id', t.student_id, 'name', t.name, 'score', t.s) order by t.s desc, t.name), '[]'::jsonb)
    into v_board
    from (select p.student_id, pr.name, sum(p.delta)::int s
            from cr_players p join cr_rounds rr on rr.id = p.round_id join profiles pr on pr.id = p.student_id
            where rr.class_id = p_class and rr.match_no = r.match_no and rr.status = 'revealed'
            group by p.student_id, pr.name order by s desc, pr.name limit 10) t;
  select coalesce(sum(p.delta), 0)::int into v_my_score
    from cr_players p join cr_rounds rr on rr.id = p.round_id
    where rr.class_id = p_class and rr.match_no = r.match_no and rr.status = 'revealed' and p.student_id = v_uid;
  select count(*) into v_rounds from cr_rounds where class_id = p_class and match_no = r.match_no and status = 'revealed';

  return jsonb_build_object(
    'enabled', v_enabled, 'me', v_uid, 'teacher', v_teacher,
    'now', (extract(epoch from clock_timestamp()) * 1000)::bigint,
    'my_points', v_pts, 'my_millas', v_millas, 'rate', 5,
    'members', (select count(*) from class_members where class_id = p_class),
    'board', v_board, 'my_score', v_my_score, 'match_rounds', v_rounds,
    'round', jsonb_build_object(
      'id', r.id, 'no', r.round_no, 'match', r.match_no, 'status', r.status, 'value', r.value,
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
      'events', v_events));
end; $$;
