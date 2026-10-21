-- Una misma skin del catálogo no puede estar dos veces en la tienda de un aula.
create unique index if not exists avatar_items_unica_por_aula
  on public.avatar_items (class_id, slot, asset_value)
  where asset_value is not null;
