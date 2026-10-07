-- Eliminar a un alumno de un aula (solo el profesor de esa aula).
-- Saca al alumno de la clase y borra sus datos en ella: puntos, historial,
-- compras del mercado, objetos de avatar de esa aula y predicciones del minijuego.
-- Su cuenta de Benchi no se toca (puede estar en otras aulas).

create or replace function public.remove_student(p_class uuid, p_student uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_teacher_of(p_class) then
    raise exception 'Solo el profesor de la clase puede eliminar alumnos';
  end if;
  if not exists (select 1 from class_members where class_id = p_class and student_id = p_student) then
    raise exception 'Ese alumno no está en esta aula';
  end if;

  delete from horse_bets where class_id = p_class and student_id = p_student;
  delete from student_market_inventory smi using market_items mi
    where mi.id = smi.item_id and mi.class_id = p_class and smi.student_id = p_student;
  delete from student_avatar_inventory sai using avatar_items ai
    where ai.id = sai.item_id and ai.class_id = p_class and sai.student_id = p_student;
  delete from points_log where class_id = p_class and student_id = p_student;
  delete from class_members where class_id = p_class and student_id = p_student;
end; $$;

revoke execute on function public.remove_student(uuid, uuid) from public, anon;
grant execute on function public.remove_student(uuid, uuid) to authenticated;
