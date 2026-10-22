-- "Crucero al límite": vueltas. Cada vez que alguien sube la cifra, a todos los que siguen a bordo
-- les vuelve a tocar decidir (subir, seguir a bordo o «¡Por aquí no paso!»). La pregunta termina cuando
-- todos los que quedan a bordo han decidido después de la última subida.
-- Aplicar después de crucero_terminar.sql. Se puede ejecutar varias veces.

-- ¿Ha decidido este jugador desde la última subida?
alter table public.cr_players add column if not exists acted boolean not null default false;

-- Arranque: orden al azar; empieza el primero (tiene que decir cifra)
create or replace function public._cr_start(p_round uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_seats uuid[];
begin
  select array_agg(student_id order by random()) into v_seats
    from cr_players where round_id = p_round;
  if v_seats is null then
    update cr_rounds set status = 'cancelled' where id = p_round;
    return;
  end if;
  update cr_players p set seat = s.n, acted = false
    from unnest(v_seats) with ordinality s(uid, n)
    where p.round_id = p_round and p.student_id = s.uid;
  update cr_rounds set status = 'playing', seats = v_seats, turn = 1,
    turn_deadline = now() + make_interval(secs => turn_secs)
    where id = p_round;
  insert into cr_events (round_id, kind, value) values (p_round, 'start', array_length(v_seats, 1));
end; $$;

-- Siguiente turno: el siguiente asiento (dando la vuelta) que siga a bordo, no sea el capitán
-- y no haya decidido desde la última subida. Si no queda nadie, la pregunta se cierra.
create or replace function public._cr_next(p_round uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r cr_rounds%rowtype; n integer; i integer; idx integer;
begin
  select * into r from cr_rounds where id = p_round;
  n := coalesce(array_length(r.seats, 1), 0);
  for i in 1..n loop
    idx := ((r.turn - 1 + i) % n) + 1;
    if exists (select 1 from cr_players p where p.round_id = p_round and p.student_id = r.seats[idx]
                 and p.status in ('waiting','crew') and not p.acted
                 and p.student_id is distinct from r.captain) then
      update cr_rounds set turn = idx, turn_deadline = now() + make_interval(secs => turn_secs) where id = p_round;
      return;
    end if;
  end loop;
  update cr_rounds set status = 'closed', turn_deadline = null where id = p_round;
end; $$;

-- Tiempo agotado: sin cifra todavía → se queda fuera; con cifra → sigue a bordo (cuenta como decidido)
create or replace function public._cr_advance(p_round uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r cr_rounds%rowtype; v_uid uuid; v_guard integer := 0;
begin
  select * into r from cr_rounds where id = p_round;
  if not found then return; end if;
  if not ((r.status = 'boarding' and now() >= r.boarding_closes_at)
          or (r.status = 'playing' and now() > r.turn_deadline)) then
    return;
  end if;
  select * into r from cr_rounds where id = p_round for update;
  if r.status = 'boarding' and now() >= r.boarding_closes_at then
    perform _cr_start(p_round);
    select * into r from cr_rounds where id = p_round;
  end if;
  while r.status = 'playing' and now() > r.turn_deadline and v_guard < 200 loop
    v_guard := v_guard + 1;
    v_uid := r.seats[r.turn];
    update cr_players set status = case when r.bid is null then 'out' else 'crew' end, auto = true, acted = true
      where round_id = p_round and student_id = v_uid;
    insert into cr_events (round_id, student_id, kind) values (p_round, v_uid, 'timeout');
    perform _cr_next(p_round);
    select * into r from cr_rounds where id = p_round;
  end loop;
end; $$;

create or replace function public.cr_act(p_round uuid, p_action text, p_value numeric default null)
returns void language plpgsql security definer set search_path = public as $$
declare r cr_rounds%rowtype; v_uid uuid := auth.uid();
begin
  select * into r from cr_rounds where id = p_round;
  if not found or not is_member_of(r.class_id) then raise exception 'No perteneces a esta aula'; end if;
  perform _cr_advance(p_round);
  select * into r from cr_rounds where id = p_round for update;
  if r.status <> 'playing' then raise exception 'La pregunta no está en juego'; end if;
  if r.seats[r.turn] is distinct from v_uid then raise exception 'No es tu turno'; end if;

  if p_action = 'raise' then
    if p_value is null or p_value < 0 or p_value > 1e12 then raise exception 'Escribe un número entre 0 y un billón'; end if;
    p_value := round(p_value, 2);
    if r.bid is not null and p_value <= r.bid then
      raise exception 'Tienes que decir una cifra mayor que %', replace(trim_scale(r.bid)::text, '.', ',');
    end if;
    update cr_rounds set bid = p_value, captain = v_uid where id = p_round;
    update cr_players set status = 'crew', acted = true where round_id = p_round and student_id = v_uid;
    -- Nueva cifra: todos los demás que siguen a bordo vuelven a decidir
    update cr_players set acted = false
      where round_id = p_round and student_id <> v_uid and status in ('waiting','crew');
    insert into cr_events (round_id, student_id, kind, value) values (p_round, v_uid, 'raise', p_value);
  elsif p_action in ('stay','stop') then
    if r.bid is null then raise exception 'Eres el primero: tienes que decir una cifra'; end if;
    update cr_players set status = case when p_action = 'stay' then 'crew' else 'stopped' end, acted = true
      where round_id = p_round and student_id = v_uid;
    insert into cr_events (round_id, student_id, kind) values (p_round, v_uid, p_action);
  else
    raise exception 'Acción no válida';
  end if;
  perform _cr_next(p_round);
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
             'auto', p.auto, 'captain', p.student_id = r.captain, 'acted', p.acted,
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
      'pending', (select count(*) from cr_players p where p.round_id = r.id and p.status in ('waiting','crew')
                    and not p.acted and p.student_id is distinct from r.captain),
      'turn_deadline', case when r.status = 'playing' then (extract(epoch from r.turn_deadline) * 1000)::bigint end,
      'current', v_current,
      'current_name', (select name from profiles where id = v_current),
      'captain', r.captain, 'captain_name', (select name from profiles where id = r.captain),
      'bid', r.bid,
      'players', v_players,
      'events', v_events) end);
end; $$;

