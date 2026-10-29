-- Marca NEAE por alumno y aula.
-- El alumnado NEAE ve en «Minijuegos» los juegos adaptados (El Súper de Clase);
-- el resto ve los minijuegos comunes. Solo el profesor del aula puede cambiarla.

alter table public.class_members
  add column if not exists neae boolean not null default false;

create or replace function public.set_student_neae(p_class uuid, p_student uuid, p_neae boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_teacher_of(p_class) then
    raise exception 'Solo el profesor de la clase puede cambiar la marca NEAE';
  end if;
  update class_members set neae = p_neae
    where class_id = p_class and student_id = p_student;
  if not found then raise exception 'El alumno no está en esta aula'; end if;
end; $$;

revoke all on function public.set_student_neae(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_student_neae(uuid, uuid, boolean) to authenticated;
