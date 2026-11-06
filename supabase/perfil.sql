-- Si se reaplica este archivo, vuelve a aplicar después perfil_vidas.sql (redefine pp_state con saldo y vidas compradas).
-- Minijuego "¡Encuentra el misterio!" (game = 'perfil'). Aplicar después de crucero_terminar.sql (que define la última set_minigame).
-- Puzle de deducción para toda la clase: el profesor genera un caso (en el navegador) y lo lanza; cada alumno lo
-- resuelve por su cuenta y cada colocación se comprueba aquí. Tiene 2 vidas; el alumnado nunca pierde puntos.
-- Igual que los otros minijuegos: las tablas no se leen directamente (RLS sin políticas) y la solución
-- no sale del servidor hasta que el profesor cierra el caso.
-- Puntos: base del caso (1-5) + podio (1.º +3, 2.º +2, 3.º +1) + 1 si no se ha fallado. Debe coincidir con PODIUM en perfil.js.

-- ---------------------------------------------------------------- minijuegos disponibles
alter table public.class_minigames drop constraint if exists class_minigames_game_check;
alter table public.class_minigames add constraint class_minigames_game_check check (game in ('horses','crucero','perfil'));

-- ---------------------------------------------------------------- tablas
create table if not exists public.pp_rounds (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes(id) on delete cascade,
  round_no   integer not null,
  status     text not null default 'open' check (status in ('open','closed','cancelled')),
  theme      text not null check (char_length(theme) between 1 and 60),
  title      text not null check (char_length(title) between 1 and 80),
  emoji      text not null default '🕵️' check (char_length(emoji) <= 16),
  level      text not null check (level in ('facil','medio','dificil','experto')),
  n          integer not null check (n between 3 and 5),
  k          integer not null check (k between 3 and 4),
  value      integer not null default 2 check (value between 1 and 5),
  puzzle     jsonb not null,                       -- categorías, elementos y pistas (público)
  solution   jsonb not null,                       -- solution[categoría][posición] = elemento (secreto hasta cerrar)
  created_at timestamptz not null default now(),
  closed_at  timestamptz,
  unique (class_id, round_no)
);

create table if not exists public.pp_players (
  round_id    uuid not null references public.pp_rounds(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  class_id    uuid not null references public.classes(id) on delete cascade,
  lives       integer not null default 2 check (lives between 0 and 2),
  cells       jsonb not null default '{}'::jsonb,  -- {"categoría-posición": elemento} solo de las casillas acertadas
  mistakes    integer not null default 0,
  status      text not null default 'playing' check (status in ('playing','done','out')),
  rank        integer,
  points      integer not null default 0,
  finished_at timestamptz,
  created_at  timestamptz not null default now(),
  primary key (round_id, student_id)
);

alter table public.pp_rounds  enable row level security;
alter table public.pp_players enable row level security;
-- Sin políticas: el alumnado y el profesorado solo acceden mediante las funciones de abajo.

-- ---------------------------------------------------------------- profesor
-- Activar / desactivar. Se reescribe set_minigame (versión de crucero_terminar.sql) añadiendo 'perfil'.
create or replace function public.set_minigame(p_class uuid, p_game text, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_round uuid; v_was boolean;
begin
  if not is_teacher_of(p_class) then
    raise exception 'Solo el profesor de la clase puede activar minijuegos';
  end if;
  if p_game not in ('horses','crucero','perfil') then raise exception 'Minijuego desconocido'; end if;
  select enabled into v_was from class_minigames where class_id = p_class and game = p_game;
  insert into class_minigames (class_id, game, enabled) values (p_class, p_game, p_enabled)
    on conflict (class_id, game) do update set enabled = excluded.enabled, updated_at = now();
  if p_game = 'horses' then
    if not p_enabled then
      for v_round in select id from horse_rounds where class_id = p_class and status = 'open' loop
        perform _horse_cancel(v_round);
      end loop;
    end if;
  elsif p_game = 'perfil' then
    if not p_enabled then                                  -- los puntos ya ganados se conservan
      update pp_rounds set status = 'closed', closed_at = now() where class_id = p_class and status = 'open';
    end if;
  elsif not p_enabled then
    perform _cr_end_game(p_class);                         -- nadie pierde lo ganado
  elsif not coalesce(v_was, false) then
    perform _cr_end_game(p_class);                         -- por si quedara algo: juego nuevo desde cero
    update cr_games set last_result = null where class_id = p_class;
  end if;
end; $$;

create or replace function public.pp_open_round(
  p_class uuid, p_theme text, p_title text, p_emoji text, p_level text, p_value integer, p_puzzle jsonb, p_solution jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_no integer; v_n integer; v_k integer; v_cat integer;
begin
  if not is_teacher_of(p_class) then raise exception 'Solo el profesor de la clase puede lanzar casos'; end if;
  if not coalesce((select enabled from class_minigames where class_id = p_class and game = 'perfil'), false) then
    raise exception 'El juego «¡Encuentra el misterio!» no está activado en esta aula';
  end if;
  if exists (select 1 from pp_rounds where class_id = p_class and status = 'open') then
    raise exception 'Ya hay un caso abierto: ciérralo o cancélalo antes de lanzar otro';
  end if;
  if p_level not in ('facil','medio','dificil','experto') then raise exception 'Dificultad no válida'; end if;
  if p_value < 1 or p_value > 5 then raise exception 'Puntos base no válidos'; end if;
  if jsonb_typeof(p_puzzle) <> 'object' or jsonb_typeof(p_solution) <> 'array' then raise exception 'Caso no válido'; end if;
  v_n := (p_puzzle->>'n')::int; v_k := (p_puzzle->>'k')::int;
  if v_n not between 3 and 5 or v_k not between 3 and 4 then raise exception 'Tamaño de caso no válido'; end if;
  if jsonb_array_length(p_solution) <> v_k
     or jsonb_array_length(p_puzzle->'cats') <> v_k
     or jsonb_typeof(p_puzzle->'clues') <> 'array'
     or jsonb_array_length(p_puzzle->'clues') not between 1 and 60 then
    raise exception 'Caso no válido';
  end if;
  -- Cada categoría de la solución tiene que ser una permutación de 0..n-1
  for v_cat in 0 .. v_k - 1 loop
    if jsonb_array_length(p_solution->v_cat) <> v_n
       or (select count(distinct x::int) from jsonb_array_elements_text(p_solution->v_cat) x where x::int between 0 and v_n - 1) <> v_n then
      raise exception 'Solución no válida';
    end if;
  end loop;
  select coalesce(max(round_no), 0) + 1 into v_no from pp_rounds where class_id = p_class;
  insert into pp_rounds (class_id, round_no, theme, title, emoji, level, n, k, value, puzzle, solution)
    values (p_class, v_no, left(p_theme, 60), left(p_title, 80), left(coalesce(p_emoji, '🕵️'), 16), p_level, v_n, v_k, p_value, p_puzzle, p_solution)
    returning id into v_id;
  return v_id;
end; $$;

create or replace function public.pp_close_round(p_round uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r pp_rounds%rowtype;
begin
  select * into r from pp_rounds where id = p_round for update;
  if not found or not is_teacher_of(r.class_id) then raise exception 'Solo el profesor de la clase'; end if;
  if r.status <> 'open' then raise exception 'El caso no está abierto'; end if;
  update pp_rounds set status = 'closed', closed_at = now() where id = p_round;
end; $$;

-- Cancelar solo si nadie ha terminado (los puntos ganados no se quitan): si ya hay ganadores, se cierra.
create or replace function public.pp_cancel_round(p_round uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r pp_rounds%rowtype;
begin
  select * into r from pp_rounds where id = p_round for update;
  if not found or not is_teacher_of(r.class_id) then raise exception 'Solo el profesor de la clase'; end if;
  if r.status <> 'open' then raise exception 'El caso no está abierto'; end if;
  if exists (select 1 from pp_players where round_id = p_round and status = 'done') then
    raise exception 'Ya hay alumnos que han terminado: cierra el caso en lugar de cancelarlo';
  end if;
  update pp_rounds set status = 'cancelled', closed_at = now() where id = p_round;
end; $$;

-- ---------------------------------------------------------------- alumno
-- Coloca un elemento en una casilla. Devuelve {correct, lives, done, points, rank}.
create or replace function public.pp_place(p_round uuid, p_cat integer, p_slot integer, p_item integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  r pp_rounds%rowtype; me pp_players%rowtype;
  v_key text := p_cat || '-' || p_slot;
  v_ok boolean; v_rank integer; v_pts integer; v_cells jsonb;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  perform pg_advisory_xact_lock(hashtext(p_round::text));          -- los puestos del podio no se pisan entre alumnos
  select * into r from pp_rounds where id = p_round;
  if not found then raise exception 'Caso no encontrado'; end if;
  if not is_member_of(r.class_id) then raise exception 'No perteneces a esta aula'; end if;
  if r.status <> 'open' then raise exception 'El caso ya está cerrado'; end if;
  if p_cat not between 0 and r.k - 1 or p_slot not between 0 and r.n - 1 or p_item not between 0 and r.n - 1 then
    raise exception 'Casilla no válida';
  end if;
  insert into pp_players (round_id, student_id, class_id) values (p_round, v_uid, r.class_id)
    on conflict (round_id, student_id) do nothing;
  select * into me from pp_players where round_id = p_round and student_id = v_uid for update;
  if me.status = 'out' then raise exception 'Te has quedado sin vidas en este caso'; end if;
  if me.status = 'done' then raise exception 'Ya has resuelto este caso'; end if;
  if me.cells ? v_key then
    return jsonb_build_object('correct', true, 'lives', me.lives, 'done', false);   -- ya estaba puesta
  end if;
  v_ok := (r.solution -> p_cat ->> p_slot)::int = p_item;
  if not v_ok then
    update pp_players set lives = lives - 1, mistakes = mistakes + 1,
        status = case when lives - 1 <= 0 then 'out' else status end,
        finished_at = case when lives - 1 <= 0 then now() else finished_at end
      where round_id = p_round and student_id = v_uid
      returning lives into me.lives;
    return jsonb_build_object('correct', false, 'lives', me.lives, 'done', false);
  end if;
  v_cells := me.cells || jsonb_build_object(v_key, p_item);
  if (select count(*) from jsonb_object_keys(v_cells)) < r.n * r.k then
    update pp_players set cells = v_cells where round_id = p_round and student_id = v_uid;
    return jsonb_build_object('correct', true, 'lives', me.lives, 'done', false);
  end if;
  -- Caso resuelto: puntos = base + podio + 1 sin fallos
  select count(*) + 1 into v_rank from pp_players where round_id = p_round and status = 'done';
  v_pts := r.value + case v_rank when 1 then 3 when 2 then 2 when 3 then 1 else 0 end + case when me.mistakes = 0 then 1 else 0 end;
  update pp_players set cells = v_cells, status = 'done', rank = v_rank, points = v_pts, finished_at = now()
    where round_id = p_round and student_id = v_uid;
  update class_members set points = points + v_pts where student_id = v_uid and class_id = r.class_id;
  insert into points_log (class_id, student_id, delta, reason, type)
    values (r.class_id, v_uid, v_pts, '¡Encuentra el misterio!: ' || r.title, 'minijuego');
  return jsonb_build_object('correct', true, 'lives', me.lives, 'done', true, 'points', v_pts, 'rank', v_rank);
end; $$;

-- ---------------------------------------------------------------- estado (profesor y alumnado)
create or replace function public.pp_state(p_class uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_teacher boolean := is_teacher_of(p_class);
  v_en boolean; r pp_rounds%rowtype; me pp_players%rowtype;
  v_round jsonb := null; v_mine jsonb := null; v_players jsonb := '[]'::jsonb; v_fin jsonb := '[]'::jsonb; v_members integer;
begin
  if v_uid is null or not (v_teacher or is_member_of(p_class)) then raise exception 'No perteneces a esta aula'; end if;
  v_en := coalesce((select enabled from class_minigames where class_id = p_class and game = 'perfil'), false);
  select count(*) into v_members from class_members where class_id = p_class;
  select * into r from pp_rounds where class_id = p_class order by round_no desc limit 1;
  if found then
    v_round := jsonb_build_object('id', r.id, 'status', r.status, 'title', r.title, 'theme', r.theme, 'emoji', r.emoji,
      'level', r.level, 'n', r.n, 'k', r.k, 'value', r.value, 'puzzle', r.puzzle,
      'solution', case when r.status = 'closed' then r.solution else null end);
    select * into me from pp_players where round_id = r.id and student_id = v_uid;
    if found then
      v_mine := jsonb_build_object('lives', me.lives, 'cells', me.cells, 'mistakes', me.mistakes, 'status', me.status,
        'rank', me.rank, 'points', me.points);
    elsif not v_teacher then
      v_mine := jsonb_build_object('lives', 2, 'cells', '{}'::jsonb, 'mistakes', 0, 'status', 'playing', 'rank', null, 'points', 0);
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('name', pr.name, 'rank', p.rank, 'points', p.points) order by p.rank), '[]'::jsonb)
      into v_fin from pp_players p join profiles pr on pr.id = p.student_id where p.round_id = r.id and p.status = 'done';
    if v_teacher then
      select coalesce(jsonb_agg(jsonb_build_object('id', p.student_id, 'name', pr.name, 'cells', (select count(*) from jsonb_object_keys(p.cells)),
          'lives', p.lives, 'status', p.status, 'rank', p.rank, 'points', p.points) order by pr.name), '[]'::jsonb)
        into v_players from pp_players p join profiles pr on pr.id = p.student_id where p.round_id = r.id;
    end if;
  end if;
  return jsonb_build_object('now', (extract(epoch from now()) * 1000)::bigint, 'enabled', v_en, 'members', v_members,
    'round', v_round, 'mine', v_mine, 'players', v_players, 'finished', v_fin);
end; $$;

-- ---------------------------------------------------------------- permisos
revoke execute on function public.set_minigame(uuid, text, boolean) from public, anon;
revoke execute on function public.pp_open_round(uuid, text, text, text, text, integer, jsonb, jsonb) from public, anon;
revoke execute on function public.pp_close_round(uuid) from public, anon;
revoke execute on function public.pp_cancel_round(uuid) from public, anon;
revoke execute on function public.pp_place(uuid, integer, integer, integer) from public, anon;
revoke execute on function public.pp_state(uuid) from public, anon;
grant execute on function public.set_minigame(uuid, text, boolean) to authenticated;
grant execute on function public.pp_open_round(uuid, text, text, text, text, integer, jsonb, jsonb) to authenticated;
grant execute on function public.pp_close_round(uuid) to authenticated;
grant execute on function public.pp_cancel_round(uuid) to authenticated;
grant execute on function public.pp_place(uuid, integer, integer, integer) to authenticated;
grant execute on function public.pp_state(uuid) to authenticated;
