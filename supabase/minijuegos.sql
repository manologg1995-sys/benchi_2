-- Minijuegos por aula (de momento: Carrera de caballos, game = 'horses').
-- Solo tablas y funciones nuevas. Los puntos siguen modificándose únicamente
-- desde funciones SECURITY DEFINER (igual que apply_points / buy_market_item).

create table if not exists public.class_minigames (
  class_id   uuid not null references public.classes(id) on delete cascade,
  game       text not null check (game in ('horses')),
  enabled    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (class_id, game)
);

create table if not exists public.horse_rounds (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes(id) on delete cascade,
  round_no    integer not null,
  status      text not null default 'open' check (status in ('open','racing','cancelled')),
  cap         numeric not null default 0.2 check (cap > 0 and cap <= 1),
  horses      jsonb not null,
  closes_at   timestamptz not null,
  seed        bigint,
  race_order  jsonb,
  winner      integer,
  started_at  timestamptz,
  total       integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (class_id, round_no)
);

create table if not exists public.horse_bets (
  round_id   uuid not null references public.horse_rounds(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  class_id   uuid not null references public.classes(id) on delete cascade,
  horse      integer not null check (horse between 0 and 4),
  amount     integer not null check (amount >= 1),
  payout     integer,
  created_at timestamptz not null default now(),
  primary key (round_id, student_id)
);

alter table public.class_minigames enable row level security;
alter table public.horse_rounds    enable row level security;
alter table public.horse_bets      enable row level security;

-- Lectura directa solo de qué minijuegos hay; rondas y apuestas solo vía funciones.
drop policy if exists "ver minijuegos de mi aula" on public.class_minigames;
create policy "ver minijuegos de mi aula" on public.class_minigames
  for select using (is_teacher_of(class_id) or is_member_of(class_id));

-- ---------------------------------------------------------------- helpers
create or replace function public._horse_cancel(p_round uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b record; r horse_rounds%rowtype;
begin
  select * into r from horse_rounds where id = p_round for update;
  if not found or r.status <> 'open' then return; end if;
  for b in select * from horse_bets where round_id = p_round loop
    update class_members set points = points + b.amount
      where student_id = b.student_id and class_id = r.class_id;
    insert into points_log (class_id, student_id, delta, reason, type)
      values (r.class_id, b.student_id, b.amount, 'Carrera de caballos: ronda cancelada, apuesta devuelta', 'minijuego');
  end loop;
  update horse_bets set payout = amount where round_id = p_round;
  update horse_rounds set status = 'cancelled' where id = p_round;
end; $$;

-- ---------------------------------------------------------------- profesor
create or replace function public.set_minigame(p_class uuid, p_game text, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_round uuid;
begin
  if not is_teacher_of(p_class) then
    raise exception 'Solo el profesor de la clase puede activar minijuegos';
  end if;
  if p_game <> 'horses' then raise exception 'Minijuego desconocido'; end if;
  insert into class_minigames (class_id, game, enabled) values (p_class, p_game, p_enabled)
    on conflict (class_id, game) do update set enabled = excluded.enabled, updated_at = now();
  if not p_enabled then
    for v_round in select id from horse_rounds where class_id = p_class and status = 'open' loop
      perform _horse_cancel(v_round);
    end loop;
  end if;
end; $$;

create or replace function public.horse_open_round(p_class uuid, p_seconds integer, p_cap numeric, p_horses jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_no integer;
begin
  if not is_teacher_of(p_class) then raise exception 'Solo el profesor de la clase puede abrir rondas'; end if;
  if not coalesce((select enabled from class_minigames where class_id = p_class and game = 'horses'), false) then
    raise exception 'La carrera de caballos no está activada en esta aula';
  end if;
  if exists (select 1 from horse_rounds where class_id = p_class and status = 'open') then
    raise exception 'Ya hay una ronda abierta';
  end if;
  if p_seconds < 10 or p_seconds > 300 then raise exception 'Tiempo no válido'; end if;
  if p_cap <= 0 or p_cap > 1 then raise exception 'Límite no válido'; end if;
  if jsonb_typeof(p_horses) <> 'array' or jsonb_array_length(p_horses) <> 5 then
    raise exception 'Se necesitan 5 caballos';
  end if;
  select coalesce(max(round_no), 0) + 1 into v_no from horse_rounds where class_id = p_class;
  insert into horse_rounds (class_id, round_no, cap, horses, closes_at)
    values (p_class, v_no, p_cap, p_horses, now() + make_interval(secs => p_seconds))
    returning id into v_id;
  return v_id;
end; $$;

create or replace function public.horse_extend_round(p_round uuid, p_seconds integer)
returns void language plpgsql security definer set search_path = public as $$
declare r horse_rounds%rowtype;
begin
  select * into r from horse_rounds where id = p_round for update;
  if not found or not is_teacher_of(r.class_id) then raise exception 'Solo el profesor de la clase'; end if;
  if r.status <> 'open' then raise exception 'La ronda no está abierta'; end if;
  if p_seconds < 1 or p_seconds > 120 then raise exception 'Tiempo no válido'; end if;
  update horse_rounds set closes_at = greatest(closes_at, now()) + make_interval(secs => p_seconds) where id = p_round;
end; $$;

create or replace function public.horse_cancel_round(p_round uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_class uuid;
begin
  select class_id into v_class from horse_rounds where id = p_round;
  if v_class is null or not is_teacher_of(v_class) then raise exception 'Solo el profesor de la clase'; end if;
  perform _horse_cancel(p_round);
end; $$;

-- Cierra apuestas, fija el resultado y reparte el bote (todo en una transacción).
create or replace function public.horse_start_race(p_round uuid, p_seed bigint, p_order jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  r horse_rounds%rowtype; b record;
  v_winner integer; v_total integer; v_w integer; v_paid integer := 0; v_best_student uuid; v_pay integer;
begin
  select * into r from horse_rounds where id = p_round for update;
  if not found or not is_teacher_of(r.class_id) then raise exception 'Solo el profesor de la clase'; end if;
  if r.status <> 'open' then raise exception 'La ronda no está abierta'; end if;
  if jsonb_typeof(p_order) <> 'array' or jsonb_array_length(p_order) <> 5
     or (select count(distinct x::int) from jsonb_array_elements_text(p_order) x where x::int between 0 and 4) <> 5 then
    raise exception 'Orden de llegada no válido';
  end if;
  v_winner := (p_order ->> 0)::int;
  select coalesce(sum(amount), 0) into v_total from horse_bets where round_id = p_round;
  select coalesce(sum(amount), 0) into v_w from horse_bets where round_id = p_round and horse = v_winner;

  if v_total > 0 then
    if v_w = 0 then
      -- Nadie acertó: se devuelve todo.
      update horse_bets set payout = amount where round_id = p_round;
    else
      update horse_bets set payout = case when horse = v_winner then floor(amount::numeric * v_total / v_w)::int else 0 end
        where round_id = p_round;
      select coalesce(sum(payout), 0) into v_paid from horse_bets where round_id = p_round;
      if v_total - v_paid > 0 then
        -- El resto del redondeo va al ganador que más puso.
        select student_id into v_best_student from horse_bets
          where round_id = p_round and horse = v_winner order by amount desc, created_at limit 1;
        update horse_bets set payout = payout + (v_total - v_paid)
          where round_id = p_round and student_id = v_best_student;
      end if;
    end if;
    for b in select * from horse_bets where round_id = p_round and payout > 0 loop
      update class_members set points = points + b.payout
        where student_id = b.student_id and class_id = r.class_id;
      insert into points_log (class_id, student_id, delta, reason, type)
        values (r.class_id, b.student_id, b.payout,
          case when v_w = 0 then 'Carrera de caballos: nadie acertó, apuesta devuelta' else 'Carrera de caballos: premio' end,
          'minijuego');
    end loop;
  end if;

  update horse_rounds set status = 'racing', seed = p_seed, race_order = p_order, winner = v_winner,
    started_at = now(), total = v_total where id = p_round;
end; $$;

-- ---------------------------------------------------------------- alumno
create or replace function public.horse_place_bet(p_round uuid, p_horse integer, p_amount integer)
returns void language plpgsql security definer set search_path = public as $$
declare r horse_rounds%rowtype; v_uid uuid := auth.uid(); v_points integer; v_max integer;
begin
  select * into r from horse_rounds where id = p_round;
  if not found or not is_member_of(r.class_id) then raise exception 'No perteneces a esta aula'; end if;
  if r.status <> 'open' or now() >= r.closes_at then raise exception 'La ronda ya está cerrada'; end if;
  if p_horse < 0 or p_horse > 4 then raise exception 'Caballo no válido'; end if;
  select points into v_points from class_members
    where student_id = v_uid and class_id = r.class_id for update;
  v_max := greatest(1, floor(v_points * r.cap)::int);
  if p_amount < 1 or p_amount > v_max then raise exception 'Cantidad no permitida (máximo %)', v_max; end if;
  if v_points < p_amount then raise exception 'No tienes puntos suficientes'; end if;
  begin
    insert into horse_bets (round_id, student_id, class_id, horse, amount)
      values (p_round, v_uid, r.class_id, p_horse, p_amount);
  exception when unique_violation then
    raise exception 'Ya has hecho tu predicción en esta ronda';
  end;
  update class_members set points = points - p_amount where student_id = v_uid and class_id = r.class_id;
  insert into points_log (class_id, student_id, delta, reason, type)
    values (r.class_id, v_uid, -p_amount, 'Carrera de caballos: apuesta', 'minijuego');
end; $$;

-- ---------------------------------------------------------------- estado (profesor y alumnos)
create or replace function public.horse_state(p_class uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); r horse_rounds%rowtype; v_teacher boolean := is_teacher_of(p_class);
  v_enabled boolean; v_pools jsonb; v_counts jsonb; v_mine jsonb; v_rows jsonb := '[]'::jsonb; v_pts integer;
begin
  if not v_teacher and not is_member_of(p_class) then raise exception 'No perteneces a esta aula'; end if;
  v_enabled := coalesce((select enabled from class_minigames where class_id = p_class and game = 'horses'), false);
  select * into r from horse_rounds where class_id = p_class order by round_no desc limit 1;
  select points into v_pts from class_members where class_id = p_class and student_id = v_uid;

  if r.id is null then
    return jsonb_build_object('enabled', v_enabled, 'round', null, 'now', (extract(epoch from clock_timestamp()) * 1000)::bigint,
      'my_points', v_pts, 'members', (select count(*) from class_members where class_id = p_class));
  end if;

  select coalesce(jsonb_agg(coalesce(s.amt, 0) order by h.i), '[]'::jsonb),
         coalesce(jsonb_agg(coalesce(s.n, 0) order by h.i), '[]'::jsonb)
    into v_pools, v_counts
    from generate_series(0, 4) h(i)
    left join (select horse, sum(amount)::int amt, count(*)::int n from horse_bets where round_id = r.id group by horse) s on s.horse = h.i;

  select to_jsonb(x) into v_mine from (select horse, amount, payout from horse_bets where round_id = r.id and student_id = v_uid) x;

  if r.status = 'racing' then
    select coalesce(jsonb_agg(jsonb_build_object('student_id', b.student_id, 'name', p.name, 'horse', b.horse,
             'amount', b.amount, 'payout', b.payout) order by b.payout desc, b.amount desc), '[]'::jsonb)
      into v_rows
      from horse_bets b join profiles p on p.id = b.student_id where b.round_id = r.id;
  end if;

  return jsonb_build_object(
    'enabled', v_enabled,
    'now', (extract(epoch from clock_timestamp()) * 1000)::bigint,
    'my_points', v_pts,
    'members', (select count(*) from class_members where class_id = p_class),
    'round', jsonb_build_object(
      'id', r.id, 'no', r.round_no, 'status', r.status, 'cap', r.cap, 'horses', r.horses,
      'closes_at', (extract(epoch from r.closes_at) * 1000)::bigint,
      'pools', v_pools, 'counts', v_counts,
      'bets', (select count(*) from horse_bets where round_id = r.id),
      'mine', v_mine,
      'seed', case when r.status = 'racing' then r.seed end,
      'order', case when r.status = 'racing' then r.race_order end,
      'winner', case when r.status = 'racing' then r.winner end,
      'started_at', case when r.status = 'racing' then (extract(epoch from r.started_at) * 1000)::bigint end,
      'total', r.total,
      'rows', v_rows));
end; $$;

-- Permisos: solo usuarios autenticados; el helper interno no se expone.
revoke execute on function public._horse_cancel(uuid) from public, anon, authenticated;
revoke execute on function public.set_minigame(uuid, text, boolean) from public, anon;
revoke execute on function public.horse_open_round(uuid, integer, numeric, jsonb) from public, anon;
revoke execute on function public.horse_extend_round(uuid, integer) from public, anon;
revoke execute on function public.horse_cancel_round(uuid) from public, anon;
revoke execute on function public.horse_start_race(uuid, bigint, jsonb) from public, anon;
revoke execute on function public.horse_place_bet(uuid, integer, integer) from public, anon;
revoke execute on function public.horse_state(uuid) from public, anon;
grant execute on function public.set_minigame(uuid, text, boolean) to authenticated;
grant execute on function public.horse_open_round(uuid, integer, numeric, jsonb) to authenticated;
grant execute on function public.horse_extend_round(uuid, integer) to authenticated;
grant execute on function public.horse_cancel_round(uuid) to authenticated;
grant execute on function public.horse_start_race(uuid, bigint, jsonb) to authenticated;
grant execute on function public.horse_place_bet(uuid, integer, integer) to authenticated;
grant execute on function public.horse_state(uuid) to authenticated;
