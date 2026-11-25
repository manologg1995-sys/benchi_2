-- Escaparate de skins (opción C): el profesor activa o desactiva cada skin con un interruptor.
-- Desactivar NO borra la skin: deja de venderse, pero quien ya la tiene la conserva.

alter table public.avatar_items
  add column if not exists en_tienda boolean not null default true;

-- La compra solo se permite si la skin está a la venta
create or replace function public.buy_avatar_item(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_item avatar_items%rowtype; v_student uuid := auth.uid(); v_pts integer;
begin
  if v_student is null then raise exception 'No autenticado'; end if;
  select * into v_item from avatar_items where id = p_item;
  if not found then raise exception 'Skin no encontrada'; end if;
  if not v_item.en_tienda then
    raise exception 'Esta skin ya no está a la venta';
  end if;
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

revoke execute on function public.buy_avatar_item(uuid) from public, anon;
grant execute on function public.buy_avatar_item(uuid) to authenticated;
