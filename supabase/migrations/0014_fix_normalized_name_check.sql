-- La validación de p_normalized que agregó 0012 era demasiado estricta y rompía
-- el import de las planillas reales:
--
--   "Sub. lat al cajon c/pie arriba m.bosu"
--     -> normName -> "sub. lat al cajon c/pie arriba m.bosu"
--     -> 0012: `v_norm ~ '[^a-z0-9ñ ]'` -> "Nombre normalizado inválido"
--
-- El error de fondo: la whitelist `[a-z0-9ñ ]` asumía que normName saca la
-- puntuación, y no lo hace. normName (packages/core/src/domain/normName.ts) solo
-- pasa a minúsculas, saca acentos (preservando la ñ) y colapsa espacios. Los
-- puntos, barras, paréntesis, comas, comillas y signos + siguen ahí, y los
-- nombres reales de los ejercicios los usan todo el tiempo:
--
--   "acostado: pecho - pull overs - triceps alternado"
--   "c/w: biceps - press frances"
--   "prensa 1p - pantorrilla (2'')"
--
-- La validación correcta no pregunta "¿es alfanumérico?" sino "¿está
-- normalizado?": tiene que ser igual a su propio lower(), no tener espacios
-- dobles, y no traer ninguna vocal acentuada que normName habría sacado. Eso
-- sigue cerrando el vector de MEDIUM-1 —un normalized inventado que secuestre el
-- matching de rmFor— sin rechazar nombres legítimos.

create or replace function public.ensure_exercise(p_name text, p_normalized text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_name text := trim(p_name);
  v_norm text := trim(p_normalized);
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  -- Agregar al catálogo es una operación de coach: el caso de uso es el import
  -- de un programa. Un jugador no tiene por qué tocar el catálogo global.
  if not coalesce(
    (select p.role in ('COACH', 'ADMIN') from public.profiles p where p.id = auth.uid()),
    false
  ) then
    raise exception 'No autorizado';
  end if;

  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'Nombre de ejercicio inválido';
  end if;

  if length(v_norm) < 2 or length(v_norm) > 120 then
    raise exception 'Nombre normalizado inválido: largo fuera de rango';
  end if;

  -- normName pasa todo a minúsculas.
  if v_norm <> lower(v_norm) then
    raise exception 'Nombre normalizado inválido: tiene mayúsculas';
  end if;

  -- normName colapsa los espacios.
  if v_norm ~ '\s\s' then
    raise exception 'Nombre normalizado inválido: tiene espacios dobles';
  end if;

  -- normName saca los acentos, pero PRESERVA la ñ a propósito.
  if v_norm ~ '[áéíóúàèìòùäëïöüâêîôûãõåæøçÿ]' then
    raise exception 'Nombre normalizado inválido: tiene acentos';
  end if;

  select e.id into v_id from public.exercises e where e.normalized_name = v_norm;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.exercises (name, normalized_name)
  values (v_name, v_norm)
  on conflict (normalized_name) do nothing
  returning id into v_id;

  if v_id is null then
    select e.id into v_id from public.exercises e where e.normalized_name = v_norm;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.ensure_exercise(text, text) from public, anon;
grant  execute on function public.ensure_exercise(text, text) to authenticated;
