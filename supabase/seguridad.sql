-- Endurecimiento de seguridad (octubre 2026). Se puede ejecutar varias veces.

-- 1) Tienda: comprobar que el artículo existe y que el alumno es del aula, bloquear el saldo durante la compra
--    (evita saldos negativos por doble clic) y no cobrar dos veces una skin que ya se tiene.
create or replace function public.buy_market_item(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_item market_items%rowtype; v_student uuid := auth.uid(); v_pts integer;
begin
  if v_student is null then raise exception 'No autenticado'; end if;
  select * into v_item from market_items where id = p_item;
  if not found then raise exception 'Recompensa no encontrada'; end if;
  select points into v_pts from class_members
    where student_id = v_student and class_id = v_item.class_id for update;
  if not found then raise exception 'No perteneces a esta aula'; end if;
  if v_pts < v_item.cost then raise exception 'No tienes puntos suficientes'; end if;
  update class_members set points = points - v_item.cost where student_id = v_student and class_id = v_item.class_id;
  insert into student_market_inventory (student_id, item_id) values (v_student, p_item);
  insert into points_log (class_id, student_id, delta, reason, type)
    values (v_item.class_id, v_student, -v_item.cost, 'Canje de recompensa', 'compra');
end; $$;

create or replace function public.buy_avatar_item(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_item avatar_items%rowtype; v_student uuid := auth.uid(); v_pts integer;
begin
  if v_student is null then raise exception 'No autenticado'; end if;
  select * into v_item from avatar_items where id = p_item;
  if not found then raise exception 'Skin no encontrada'; end if;
  if v_item.unlock_type = 'logro' then
    raise exception 'Esta skin se desbloquea por logro, no se puede comprar';
  end if;
  select points into v_pts from class_members
    where student_id = v_student and class_id = v_item.class_id for update;
  if not found then raise exception 'No perteneces a esta aula'; end if;
  if exists (select 1 from student_avatar_inventory where student_id = v_student and item_id = p_item) then
    raise exception 'Ya tienes esta skin';
  end if;
  if v_pts < v_item.cost then raise exception 'No tienes puntos suficientes'; end if;
  if v_item.cost > 0 then
    update class_members set points = points - v_item.cost where student_id = v_student and class_id = v_item.class_id;
    insert into points_log (class_id, student_id, delta, reason, type)
      values (v_item.class_id, v_student, -v_item.cost, 'Compra de skin', 'compra');
  end if;
  insert into student_avatar_inventory (student_id, item_id) values (v_student, p_item);
end; $$;

-- 2) Funciones que solo tienen sentido con la sesión iniciada: fuera del alcance de anónimos.
--    (is_member_of, is_teacher_of y my_role se dejan: las usan las políticas RLS y sin sesión devuelven false/null.)
revoke execute on function public.apply_points(uuid, uuid, integer, text, text) from public, anon;
revoke execute on function public.buy_avatar_item(uuid) from public, anon;
revoke execute on function public.buy_market_item(uuid) from public, anon;
revoke execute on function public.delete_class(uuid) from public, anon;
revoke execute on function public.join_class(text) from public, anon;
revoke execute on function public.remove_student(uuid, uuid) from public, anon;
grant execute on function public.apply_points(uuid, uuid, integer, text, text) to authenticated;
grant execute on function public.buy_avatar_item(uuid) to authenticated;
grant execute on function public.buy_market_item(uuid) to authenticated;
grant execute on function public.delete_class(uuid) to authenticated;
grant execute on function public.join_class(text) to authenticated;
grant execute on function public.remove_student(uuid, uuid) to authenticated;

-- 3) Perfiles: cada usuario solo puede cambiar sus datos visibles, nunca su rol ni su id.
revoke update on public.profiles from anon, authenticated;
grant update (name, alias, centro, avatar_emoji, equipped) on public.profiles to authenticated;
revoke insert on public.profiles from anon;

-- 4) Aulas: solo las cuentas de profesor pueden crearlas.
drop policy if exists "crear mi aula" on public.classes;
create policy "crear mi aula" on public.classes
  for insert with check (teacher_id = auth.uid() and my_role() = 'profesor');
