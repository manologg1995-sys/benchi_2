-- «¡Encuentra el misterio!»: comprar vidas con puntos. Aplicar después de perfil.sql.
-- Cuando un alumno se queda sin vidas (status 'out') puede comprar 1 o 2 vidas a 10 puntos cada una
-- y seguir jugando el mismo caso, mientras esté abierto. Debe coincidir con LIFE_PRICE en perfil.js.

alter table public.pp_players add column if not exists lives_bought integer not null default 0;

create or replace function public.pp_buy_lives(p_round uuid, p_count integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  c_price constant integer := 10;
  r pp_rounds%rowtype; me pp_players%rowtype;
  v_cost integer; v_points integer;
begin
  if v_uid is null then raise exception 'No autenticado'; end if;
  if p_count is null or p_count not between 1 and 2 then raise exception 'Solo puedes comprar 1 o 2 vidas'; end if;
  select * into r from pp_rounds where id = p_round;
  if not found then raise exception 'Caso no encontrado'; end if;
  if not is_member_of(r.class_id) then raise exception 'No perteneces a esta aula'; end if;
  if r.status <> 'open' then raise exception 'El caso ya está cerrado'; end if;
  select * into me from pp_players where round_id = p_round and student_id = v_uid for update;
  if not found or me.status <> 'out' then raise exception 'Solo puedes comprar vidas cuando te has quedado sin ninguna'; end if;
  v_cost := c_price * p_count;
  select points into v_points from class_members where student_id = v_uid and class_id = r.class_id for update;
  if coalesce(v_points, 0) < v_cost then
    raise exception 'No tienes puntos suficientes (necesitas %, tienes %)', v_cost, coalesce(v_points, 0);
  end if;
  update class_members set points = points - v_cost where student_id = v_uid and class_id = r.class_id;
  insert into points_log (class_id, student_id, delta, reason, type)
    values (r.class_id, v_uid, -v_cost,
            '¡Encuentra el misterio!: ' || p_count || case when p_count = 1 then ' vida comprada' else ' vidas compradas' end,
            'minijuego');
  update pp_players set lives = p_count, status = 'playing', finished_at = null, lives_bought = lives_bought + p_count
    where round_id = p_round and student_id = v_uid;
  return jsonb_build_object('lives', p_count, 'spent', v_cost, 'balance', v_points - v_cost);
end; $$;

-- pp_state: igual que en perfil.sql, añadiendo el saldo del alumno ('balance') y las vidas compradas ('bought').
create or replace function public.pp_state(p_class uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_teacher boolean := is_teacher_of(p_class);
  v_en boolean; r pp_rounds%rowtype; me pp_players%rowtype;
  v_round jsonb := null; v_mine jsonb := null; v_players jsonb := '[]'::jsonb; v_fin jsonb := '[]'::jsonb; v_members integer;
  v_balance integer;
begin
  if v_uid is null or not (v_teacher or is_member_of(p_class)) then raise exception 'No perteneces a esta aula'; end if;
  v_en := coalesce((select enabled from class_minigames where class_id = p_class and game = 'perfil'), false);
  select count(*) into v_members from class_members where class_id = p_class;
  select points into v_balance from class_members where class_id = p_class and student_id = v_uid;
  select * into r from pp_rounds where class_id = p_class order by round_no desc limit 1;
  if found then
    v_round := jsonb_build_object('id', r.id, 'status', r.status, 'title', r.title, 'theme', r.theme, 'emoji', r.emoji,
      'level', r.level, 'n', r.n, 'k', r.k, 'value', r.value, 'puzzle', r.puzzle,
      'solution', case when r.status = 'closed' then r.solution else null end);
    select * into me from pp_players where round_id = r.id and student_id = v_uid;
    if found then
      v_mine := jsonb_build_object('lives', me.lives, 'cells', me.cells, 'mistakes', me.mistakes, 'status', me.status,
        'rank', me.rank, 'points', me.points, 'bought', me.lives_bought, 'balance', coalesce(v_balance, 0));
    elsif not v_teacher then
      v_mine := jsonb_build_object('lives', 2, 'cells', '{}'::jsonb, 'mistakes', 0, 'status', 'playing', 'rank', null,
        'points', 0, 'bought', 0, 'balance', coalesce(v_balance, 0));
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('name', pr.name, 'rank', p.rank, 'points', p.points) order by p.rank), '[]'::jsonb)
      into v_fin from pp_players p join profiles pr on pr.id = p.student_id where p.round_id = r.id and p.status = 'done';
    if v_teacher then
      select coalesce(jsonb_agg(jsonb_build_object('id', p.student_id, 'name', pr.name, 'cells', (select count(*) from jsonb_object_keys(p.cells)),
          'lives', p.lives, 'status', p.status, 'rank', p.rank, 'points', p.points, 'bought', p.lives_bought) order by pr.name), '[]'::jsonb)
        into v_players from pp_players p join profiles pr on pr.id = p.student_id where p.round_id = r.id;
    end if;
  end if;
  return jsonb_build_object('now', (extract(epoch from now()) * 1000)::bigint, 'enabled', v_en, 'members', v_members,
    'round', v_round, 'mine', v_mine, 'players', v_players, 'finished', v_fin);
end; $$;

revoke execute on function public.pp_buy_lives(uuid, integer) from public, anon;
grant execute on function public.pp_buy_lives(uuid, integer) to authenticated;
