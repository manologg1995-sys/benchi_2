-- Minijuego "Cohete al límite" (game = 'cohete'). Aplicar después de minijuegos.sql y minijuegos_votos.sql.
-- Juego de estimación por turnos: cada alumno sube la cifra, se queda a bordo o salta del cohete.
-- Igual que la carrera de caballos: el alumnado no lee las tablas directamente; todo pasa por funciones
-- SECURITY DEFINER, y la respuesta correcta nunca sale del servidor antes de revelarse.

-- ---------------------------------------------------------------- minijuegos disponibles
alter table public.class_minigames drop constraint if exists class_minigames_game_check;
alter table public.class_minigames add constraint class_minigames_game_check check (game in ('horses','cohete'));

-- ---------------------------------------------------------------- tablas
create table if not exists public.cg_questions (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.profiles(id) on delete cascade,      -- null = banco común de Benchi
  text       text not null check (char_length(text) between 5 and 200),
  answer     numeric not null,
  unit       text not null default '' check (char_length(unit) <= 30),
  category   text not null default 'General' check (char_length(category) <= 30),
  created_at timestamptz not null default now()
);

create table if not exists public.cg_rounds (
  id                 uuid primary key default gen_random_uuid(),
  class_id           uuid not null references public.classes(id) on delete cascade,
  match_no           integer not null,
  round_no           integer not null,
  status             text not null default 'boarding' check (status in ('boarding','playing','closed','revealed','cancelled')),
  mode               text not null default 'puntos' check (mode in ('puntos','marcador')),
  value              integer not null default 1 check (value between 1 and 10),
  question_id        uuid references public.cg_questions(id) on delete set null,
  q_text             text not null,
  q_unit             text not null default '',
  answer             numeric not null,
  turn_secs          integer not null check (turn_secs between 5 and 120),
  boarding_closes_at timestamptz not null,
  seats              uuid[],
  turn               integer not null default 0,
  turn_deadline      timestamptz,
  captain            uuid references public.profiles(id) on delete set null,
  bid                numeric,
  revealed_at        timestamptz,
  created_at         timestamptz not null default now(),
  unique (class_id, round_no)
);

create table if not exists public.cg_players (
  round_id   uuid not null references public.cg_rounds(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  class_id   uuid not null references public.classes(id) on delete cascade,
  seat       integer,
  status     text not null default 'waiting' check (status in ('waiting','crew','jumped','out')),
  auto       boolean not null default false,          -- true si actuó el reloj (o el profesor) en su lugar
  delta      integer,
  created_at timestamptz not null default now(),
  primary key (round_id, student_id)
);

create table if not exists public.cg_events (
  id         bigint generated always as identity primary key,
  round_id   uuid not null references public.cg_rounds(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('start','raise','stay','jump','timeout','skip','reveal')),
  value      numeric,
  created_at timestamptz not null default now()
);

create index if not exists cg_rounds_class_idx on public.cg_rounds (class_id, round_no desc);
create index if not exists cg_players_class_idx on public.cg_players (class_id, student_id);
create index if not exists cg_events_round_idx on public.cg_events (round_id, id desc);
create index if not exists cg_questions_teacher_idx on public.cg_questions (teacher_id);

alter table public.cg_questions enable row level security;
alter table public.cg_rounds    enable row level security;
alter table public.cg_players   enable row level security;
alter table public.cg_events    enable row level security;
-- Sin políticas: nadie lee ni escribe estas tablas directamente, solo a través de las funciones.

-- ---------------------------------------------------------------- activar / desactivar (ambos minijuegos)
create or replace function public.set_minigame(p_class uuid, p_game text, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_round uuid;
begin
  if not is_teacher_of(p_class) then
    raise exception 'Solo el profesor de la clase puede activar minijuegos';
  end if;
  if p_game not in ('horses','cohete') then raise exception 'Minijuego desconocido'; end if;
  insert into class_minigames (class_id, game, enabled) values (p_class, p_game, p_enabled)
    on conflict (class_id, game) do update set enabled = excluded.enabled, updated_at = now();
  if not p_enabled then
    if p_game = 'horses' then
      for v_round in select id from horse_rounds where class_id = p_class and status = 'open' loop
        perform _horse_cancel(v_round);
      end loop;
    else
      -- En el cohete los puntos solo se mueven al revelar: cancelar no tiene nada que devolver.
      update cg_rounds set status = 'cancelled'
        where class_id = p_class and status in ('boarding','playing','closed');
    end if;
  end if;
end; $$;

-- ---------------------------------------------------------------- motor interno
-- Arranca la partida: reparte los asientos al azar entre quienes subieron a bordo.
create or replace function public._cg_start(p_round uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_seats uuid[];
begin
  select array_agg(student_id order by random()) into v_seats
    from cg_players where round_id = p_round;
  if v_seats is null then
    update cg_rounds set status = 'cancelled' where id = p_round;
    return;
  end if;
  update cg_players p set seat = s.n
    from unnest(v_seats) with ordinality s(uid, n)
    where p.round_id = p_round and p.student_id = s.uid;
  update cg_rounds set status = 'playing', seats = v_seats, turn = 1,
    turn_deadline = now() + make_interval(secs => turn_secs)
    where id = p_round;
  insert into cg_events (round_id, kind, value) values (p_round, 'start', array_length(v_seats, 1));
end; $$;

-- Pasa el turno al siguiente asiento (o cierra la ronda si ya han jugado todos).
create or replace function public._cg_next(p_round uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update cg_rounds set
    turn = turn + 1,
    status = case when turn + 1 > coalesce(array_length(seats, 1), 0) then 'closed' else status end,
    turn_deadline = case when turn + 1 > coalesce(array_length(seats, 1), 0) then null
                         else now() + make_interval(secs => turn_secs) end
    where id = p_round;
end; $$;

-- Aplica lo que toque por tiempo: cierre del embarque y turnos agotados.
-- Si se agota tu turno: si aún no hay cifra, te quedas fuera de la ronda; si ya la hay, sigues a bordo.
create or replace function public._cg_advance(p_round uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r cg_rounds%rowtype; v_uid uuid; v_guard integer := 0;
begin
  select * into r from cg_rounds where id = p_round;
  if not found then return; end if;
  -- Comprobación barata sin bloquear: la mayoría de las llamadas no tienen nada que hacer
  if not ((r.status = 'boarding' and now() >= r.boarding_closes_at)
          or (r.status = 'playing' and now() > r.turn_deadline)) then
    return;
  end if;
  select * into r from cg_rounds where id = p_round for update;
  if r.status = 'boarding' and now() >= r.boarding_closes_at then
    perform _cg_start(p_round);
    select * into r from cg_rounds where id = p_round;
  end if;
  while r.status = 'playing' and now() > r.turn_deadline and v_guard < 100 loop
    v_guard := v_guard + 1;
    v_uid := r.seats[r.turn];
    update cg_players set status = case when r.bid is null then 'out' else 'crew' end, auto = true
      where round_id = p_round and student_id = v_uid;
    insert into cg_events (round_id, student_id, kind) values (p_round, v_uid, 'timeout');
    perform _cg_next(p_round);
    select * into r from cg_rounds where id = p_round;
  end loop;
end; $$;

-- ---------------------------------------------------------------- banco de preguntas (profesorado)
create or replace function public.cg_list_questions()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(my_role(), '') <> 'profesor' then raise exception 'Solo el profesorado puede ver el banco de preguntas'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'text', text, 'answer', answer, 'unit', unit,
            'category', category, 'mine', teacher_id is not null) order by teacher_id nulls last, category, text)
    from cg_questions where teacher_id is null or teacher_id = auth.uid()), '[]'::jsonb);
end; $$;

create or replace function public.cg_add_question(p_text text, p_answer numeric, p_unit text default '', p_category text default 'Mis preguntas')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(my_role(), '') <> 'profesor' then raise exception 'Solo el profesorado puede crear preguntas'; end if;
  p_text := btrim(coalesce(p_text, ''));
  if char_length(p_text) < 5 or char_length(p_text) > 200 then raise exception 'La pregunta debe tener entre 5 y 200 caracteres'; end if;
  if p_answer is null or p_answer < 0 or p_answer > 1e12 then raise exception 'La respuesta debe ser un número entre 0 y un billón'; end if;
  insert into cg_questions (teacher_id, text, answer, unit, category)
    values (auth.uid(), p_text, round(p_answer, 2), left(btrim(coalesce(p_unit, '')), 30),
            coalesce(nullif(left(btrim(coalesce(p_category, '')), 30), ''), 'Mis preguntas'))
    returning id into v_id;
  return v_id;
end; $$;

create or replace function public.cg_delete_question(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from cg_questions where id = p_id and teacher_id = auth.uid();
  if not found then raise exception 'Solo puedes borrar tus propias preguntas'; end if;
end; $$;

-- ---------------------------------------------------------------- profesor: rondas
create or replace function public.cg_open_round(p_class uuid, p_question uuid, p_mode text, p_value integer,
  p_board_secs integer, p_turn_secs integer, p_new_match boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare q cg_questions%rowtype; v_id uuid; v_no integer; v_match integer;
begin
  if not is_teacher_of(p_class) then raise exception 'Solo el profesor de la clase puede abrir rondas'; end if;
  if not coalesce((select enabled from class_minigames where class_id = p_class and game = 'cohete'), false) then
    raise exception 'Este minijuego no está activado en esta aula';
  end if;
  if exists (select 1 from cg_rounds where class_id = p_class and status in ('boarding','playing','closed')) then
    raise exception 'Ya hay una ronda en marcha';
  end if;
  if p_mode not in ('puntos','marcador') then raise exception 'Modo no válido'; end if;
  if p_value < 1 or p_value > 10 then raise exception 'Valor no válido'; end if;
  if p_board_secs < 5 or p_board_secs > 180 then raise exception 'Tiempo de embarque no válido'; end if;
  if p_turn_secs < 5 or p_turn_secs > 120 then raise exception 'Tiempo por turno no válido'; end if;

  if p_question is not null then
    select * into q from cg_questions where id = p_question and (teacher_id is null or teacher_id = auth.uid());
    if not found then raise exception 'Pregunta no encontrada'; end if;
  else
    -- Al azar, evitando las que ya han salido en las últimas 40 rondas del aula
    select * into q from cg_questions c
      where (c.teacher_id is null or c.teacher_id = auth.uid())
        and c.id not in (select question_id from cg_rounds
                          where class_id = p_class and question_id is not null
                          order by round_no desc limit 40)
      order by random() limit 1;
    if not found then
      select * into q from cg_questions c where c.teacher_id is null or c.teacher_id = auth.uid() order by random() limit 1;
    end if;
    if not found then raise exception 'No hay preguntas en el banco'; end if;
  end if;

  select coalesce(max(round_no), 0) + 1, coalesce(max(match_no), 0) into v_no, v_match
    from cg_rounds where class_id = p_class;
  if v_match = 0 or p_new_match then v_match := v_match + 1; end if;

  insert into cg_rounds (class_id, match_no, round_no, mode, value, question_id, q_text, q_unit, answer,
                         turn_secs, boarding_closes_at)
    values (p_class, v_match, v_no, p_mode, p_value, q.id, q.text, q.unit, q.answer,
            p_turn_secs, now() + make_interval(secs => p_board_secs))
    returning id into v_id;
  return v_id;
end; $$;

create or replace function public.cg_start_now(p_round uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r cg_rounds%rowtype;
begin
  select * into r from cg_rounds where id = p_round for update;
  if not found or not is_teacher_of(r.class_id) then raise exception 'Solo el profesor de la clase'; end if;
  if r.status <> 'boarding' then raise exception 'El embarque ya está cerrado'; end if;
  update cg_rounds set boarding_closes_at = now() where id = p_round;
  perform _cg_advance(p_round);
end; $$;

-- Salta el turno de quien no responde (cuenta como si se le hubiera acabado el tiempo).
create or replace function public.cg_skip_turn(p_round uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r cg_rounds%rowtype;
begin
  select * into r from cg_rounds where id = p_round for update;
  if not found or not is_teacher_of(r.class_id) then raise exception 'Solo el profesor de la clase'; end if;
  if r.status <> 'playing' then raise exception 'No hay ningún turno en juego'; end if;
  update cg_rounds set turn_deadline = now() - interval '1 second' where id = p_round;
  perform _cg_advance(p_round);
end; $$;

create or replace function public.cg_cancel_round(p_round uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r cg_rounds%rowtype;
begin
  select * into r from cg_rounds where id = p_round for update;
  if not found or not is_teacher_of(r.class_id) then raise exception 'Solo el profesor de la clase'; end if;
  if r.status not in ('boarding','playing','closed') then raise exception 'La ronda ya ha terminado'; end if;
  update cg_rounds set status = 'cancelled' where id = p_round;
end; $$;

-- Revela la respuesta y reparte (todo en una transacción). Tabla de puntos (× valor de la ronda):
--                 la cifra final NO se pasa      la cifra final SE PASA
--   Capitán       +4  (+6 si es exacta)          −2
--   A bordo       +2                             −1
--   Saltaron       0                             +2
--   Sin jugar      0                              0
create or replace function public.cg_reveal(p_round uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r cg_rounds%rowtype; p record; v_ok boolean; v_exact boolean; v_d integer; v_pts integer; v_reason text;
begin
  select * into r from cg_rounds where id = p_round for update;
  if not found or not is_teacher_of(r.class_id) then raise exception 'Solo el profesor de la clase'; end if;
  perform _cg_advance(p_round);
  select * into r from cg_rounds where id = p_round;
  if r.status <> 'closed' then raise exception 'Todavía quedan turnos por jugar'; end if;

  v_ok := r.bid is not null and r.bid <= r.answer;
  v_exact := r.bid is not null and r.bid = r.answer;

  for p in select * from cg_players where round_id = p_round for update loop
    if r.bid is null or p.status in ('out','waiting') then v_d := 0;
    elsif p.student_id = r.captain then v_d := case when v_exact then 6 when v_ok then 4 else -2 end;
    elsif p.status = 'crew' then v_d := case when v_ok then 2 else -1 end;
    else v_d := case when v_ok then 0 else 2 end;                      -- saltó
    end if;
    v_d := v_d * r.value;

    if r.mode = 'puntos' and v_d <> 0 then
      select points into v_pts from class_members
        where student_id = p.student_id and class_id = r.class_id for update;
      if v_pts is null then
        v_d := 0;                                                        -- ya no está en el aula
      else
        v_d := greatest(v_d, -v_pts);                                    -- nunca por debajo de 0
        if v_d <> 0 then
          update class_members set points = points + v_d where student_id = p.student_id and class_id = r.class_id;
          v_reason := 'Cohete al límite: ' || case
            when p.student_id = r.captain then case when v_ok then 'capitán sin pasarse' else 'capitán, la cifra se pasó' end
            when p.status = 'crew' then case when v_ok then 'a bordo sin pasarse' else 'a bordo, la cifra se pasó' end
            else 'saltó a tiempo' end;
          insert into points_log (class_id, student_id, delta, reason, type)
            values (r.class_id, p.student_id, v_d, v_reason, 'minijuego');
        end if;
      end if;
    end if;
    update cg_players set delta = v_d where round_id = p_round and student_id = p.student_id;
  end loop;

  update cg_rounds set status = 'revealed', revealed_at = now() where id = p_round;
  insert into cg_events (round_id, kind, value) values (p_round, 'reveal', r.answer);
end; $$;

-- ---------------------------------------------------------------- alumno
create or replace function public.cg_board(p_round uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r cg_rounds%rowtype;
begin
  select * into r from cg_rounds where id = p_round for update;
  if not found or not is_member_of(r.class_id) then raise exception 'No perteneces a esta aula'; end if;
  if r.status <> 'boarding' or now() >= r.boarding_closes_at then raise exception 'El embarque ya está cerrado'; end if;
  begin
    insert into cg_players (round_id, student_id, class_id) values (p_round, auth.uid(), r.class_id);
  exception when unique_violation then
    raise exception 'Ya estás a bordo';
  end;
  -- Si ya ha subido toda la clase, no hace falta esperar al reloj
  if (select count(*) from cg_players where round_id = p_round)
     >= (select count(*) from class_members where class_id = r.class_id) then
    perform _cg_start(p_round);
  end if;
end; $$;

create or replace function public.cg_act(p_round uuid, p_action text, p_value numeric default null)
returns void language plpgsql security definer set search_path = public as $$
declare r cg_rounds%rowtype; v_uid uuid := auth.uid();
begin
  select * into r from cg_rounds where id = p_round;
  if not found or not is_member_of(r.class_id) then raise exception 'No perteneces a esta aula'; end if;
  perform _cg_advance(p_round);                                          -- aplica antes los turnos agotados
  select * into r from cg_rounds where id = p_round for update;
  if r.status <> 'playing' then raise exception 'La ronda no está en juego'; end if;
  if r.seats[r.turn] is distinct from v_uid then raise exception 'No es tu turno'; end if;

  if p_action = 'raise' then
    if p_value is null or p_value < 0 or p_value > 1e12 then raise exception 'Escribe un número entre 0 y un billón'; end if;
    p_value := round(p_value, 2);
    if r.bid is not null and p_value <= r.bid then
      raise exception 'Tienes que decir una cifra mayor que %', replace(trim_scale(r.bid)::text, '.', ',');
    end if;
    update cg_rounds set bid = p_value, captain = v_uid where id = p_round;
    update cg_players set status = 'crew' where round_id = p_round and student_id = v_uid;
    insert into cg_events (round_id, student_id, kind, value) values (p_round, v_uid, 'raise', p_value);
  elsif p_action in ('stay','jump') then
    if r.bid is null then raise exception 'Eres el primero: tienes que decir una cifra'; end if;
    update cg_players set status = case when p_action = 'stay' then 'crew' else 'jumped' end
      where round_id = p_round and student_id = v_uid;
    insert into cg_events (round_id, student_id, kind) values (p_round, v_uid, p_action);
  else
    raise exception 'Acción no válida';
  end if;
  perform _cg_next(p_round);
end; $$;

-- ---------------------------------------------------------------- estado (profesor y alumnos)
-- No es STABLE a propósito: de paso aplica los turnos agotados, así el juego avanza aunque nadie pulse nada.
create or replace function public.cg_state(p_class uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); r cg_rounds%rowtype; v_teacher boolean := is_teacher_of(p_class);
  v_enabled boolean; v_pts integer; v_players jsonb; v_events jsonb; v_board jsonb; v_my_score integer; v_rounds integer;
  v_current uuid;
begin
  if not v_teacher and not is_member_of(p_class) then raise exception 'No perteneces a esta aula'; end if;
  v_enabled := coalesce((select enabled from class_minigames where class_id = p_class and game = 'cohete'), false);
  select points into v_pts from class_members where class_id = p_class and student_id = v_uid;
  select * into r from cg_rounds where class_id = p_class order by round_no desc limit 1;

  if r.id is null then
    return jsonb_build_object('enabled', v_enabled, 'round', null, 'me', v_uid, 'teacher', v_teacher,
      'now', (extract(epoch from clock_timestamp()) * 1000)::bigint, 'my_points', v_pts,
      'members', (select count(*) from class_members where class_id = p_class), 'board', '[]'::jsonb, 'my_score', 0);
  end if;

  if r.status in ('boarding','playing') then
    perform _cg_advance(r.id);
    select * into r from cg_rounds where id = r.id;
  end if;
  v_current := case when r.status = 'playing' then r.seats[r.turn] end;

  select coalesce(jsonb_agg(jsonb_build_object('id', p.student_id, 'name', pr.name, 'seat', p.seat, 'status', p.status,
           'auto', p.auto, 'captain', p.student_id = r.captain,
           'delta', case when r.status = 'revealed' then p.delta end)
           order by p.seat nulls last, p.created_at), '[]'::jsonb)
    into v_players
    from cg_players p join profiles pr on pr.id = p.student_id where p.round_id = r.id;

  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'name', pr.name, 'who', e.student_id,
           'value', case when e.kind = 'reveal' and r.status <> 'revealed' then null else e.value end) order by e.id desc), '[]'::jsonb)
    into v_events
    from (select * from cg_events where round_id = r.id order by id desc limit 14) e
    left join profiles pr on pr.id = e.student_id;

  -- Marcador de la partida actual (suma de lo ganado o perdido en las rondas ya reveladas)
  select coalesce(jsonb_agg(jsonb_build_object('id', t.student_id, 'name', t.name, 'score', t.s) order by t.s desc, t.name), '[]'::jsonb)
    into v_board
    from (select p.student_id, pr.name, sum(p.delta)::int s
            from cg_players p join cg_rounds rr on rr.id = p.round_id join profiles pr on pr.id = p.student_id
            where rr.class_id = p_class and rr.match_no = r.match_no and rr.status = 'revealed'
            group by p.student_id, pr.name order by s desc, pr.name limit 10) t;
  select coalesce(sum(p.delta), 0)::int into v_my_score
    from cg_players p join cg_rounds rr on rr.id = p.round_id
    where rr.class_id = p_class and rr.match_no = r.match_no and rr.status = 'revealed' and p.student_id = v_uid;
  select count(*) into v_rounds from cg_rounds where class_id = p_class and match_no = r.match_no and status = 'revealed';

  return jsonb_build_object(
    'enabled', v_enabled, 'me', v_uid, 'teacher', v_teacher,
    'now', (extract(epoch from clock_timestamp()) * 1000)::bigint,
    'my_points', v_pts,
    'members', (select count(*) from class_members where class_id = p_class),
    'board', v_board, 'my_score', v_my_score, 'match_rounds', v_rounds,
    'round', jsonb_build_object(
      'id', r.id, 'no', r.round_no, 'match', r.match_no, 'status', r.status, 'mode', r.mode, 'value', r.value,
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

-- ---------------------------------------------------------------- permisos
revoke execute on function public._cg_start(uuid) from public, anon, authenticated;
revoke execute on function public._cg_next(uuid) from public, anon, authenticated;
revoke execute on function public._cg_advance(uuid) from public, anon, authenticated;
revoke execute on function public.set_minigame(uuid, text, boolean) from public, anon;
revoke execute on function public.cg_list_questions() from public, anon;
revoke execute on function public.cg_add_question(text, numeric, text, text) from public, anon;
revoke execute on function public.cg_delete_question(uuid) from public, anon;
revoke execute on function public.cg_open_round(uuid, uuid, text, integer, integer, integer, boolean) from public, anon;
revoke execute on function public.cg_start_now(uuid) from public, anon;
revoke execute on function public.cg_skip_turn(uuid) from public, anon;
revoke execute on function public.cg_cancel_round(uuid) from public, anon;
revoke execute on function public.cg_reveal(uuid) from public, anon;
revoke execute on function public.cg_board(uuid) from public, anon;
revoke execute on function public.cg_act(uuid, text, numeric) from public, anon;
revoke execute on function public.cg_state(uuid) from public, anon;
grant execute on function public.set_minigame(uuid, text, boolean) to authenticated;
grant execute on function public.cg_list_questions() to authenticated;
grant execute on function public.cg_add_question(text, numeric, text, text) to authenticated;
grant execute on function public.cg_delete_question(uuid) to authenticated;
grant execute on function public.cg_open_round(uuid, uuid, text, integer, integer, integer, boolean) to authenticated;
grant execute on function public.cg_start_now(uuid) to authenticated;
grant execute on function public.cg_skip_turn(uuid) to authenticated;
grant execute on function public.cg_cancel_round(uuid) to authenticated;
grant execute on function public.cg_reveal(uuid) to authenticated;
grant execute on function public.cg_board(uuid) to authenticated;
grant execute on function public.cg_act(uuid, text, numeric) to authenticated;
grant execute on function public.cg_state(uuid) to authenticated;
