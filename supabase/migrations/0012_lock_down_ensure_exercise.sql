-- Cierra el HIGH de la auditoría de F2: ensure_exercise dejaba a CUALQUIER
-- usuario autenticado escribir el catálogo global.
--
-- La función es security definer (saltea exercises_write, que es ADMIN-only) y
-- tiene grant a `authenticated`, y su único control era `auth.uid() is null`.
-- Un PLAYER —y registrarse es público— pegaba directo en
-- POST /rest/v1/rpc/ensure_exercise con la anon key y su JWT, SIN pasar por
-- Hono, y agregaba filas arbitrarias. Verificado en vivo antes de escribir esto:
--
--   rol del atacante: PLAYER
--   ESCRIBIÓ EL CATÁLOGO -> name="ATAQUE Catalogo Global" normalized_name="ba"
--
-- La lección: el borde de seguridad de una RPC es la RPC, no la ruta que la
-- llama. El guard de /coach/* en app.ts no protege nada que se pueda invocar por
-- PostgREST.
--
-- Agravantes que hacían que no fuera solo ruido: no hay camino de borrado
-- (exercises_write es ADMIN y block_exercises.exercise_id es ON DELETE RESTRICT),
-- así que la contaminación era permanente; aparecía en el typeahead de todos los
-- coaches; y come el free tier, que es la restricción de costo de CLAUDE.md §1.
--
-- Segundo problema, del mismo tamaño de fix: p_normalized venía del llamador y
-- no se contrastaba con nada. Como rmFor matchea por inclusión en cualquier
-- dirección ganando la más larga, un normalized_name de dos letras secuestra el
-- cálculo de kg de todo ejercicio que las contenga.

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

  -- p_normalized tiene que ser plausiblemente la salida de normName()
  -- (packages/core/src/domain/normName.ts): minúsculas, sin acentos salvo la ñ,
  -- espacios simples. No se puede recalcular en SQL sin duplicar el algoritmo
  -- —sería una segunda fuente de verdad del matching de 1RM— pero sí se puede
  -- rechazar lo que claramente no lo es.
  if length(v_norm) < 2
     or length(v_norm) > 120
     or v_norm <> lower(v_norm)
     or v_norm ~ '[^a-z0-9ñ ]'
     or v_norm ~ '\s\s' then
    raise exception 'Nombre normalizado inválido';
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

-- ---------------------------------------------------------------------------
-- LOW de la misma auditoría: guard_profile_changes no fijaba `id`.
--
-- Clavaba role, invite_code, coach_id y email, pero no el id. En la práctica lo
-- frenan la PK y la FK a auth.users, pero una rama de seguridad no debería
-- depender de eso.
-- ---------------------------------------------------------------------------

create or replace function public.guard_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- El id no se mueve nunca, ni para un ADMIN: es la FK a auth.users.
  if new.id is distinct from old.id then
    raise exception 'No se puede cambiar el id del perfil';
  end if;

  -- auth.uid() es null cuando corre el seed o una migración con service_role.
  if auth.uid() is null then
    return new;
  end if;

  if coalesce((select p.role = 'ADMIN' from public.profiles p where p.id = auth.uid()), false) then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'No se puede cambiar el rol del perfil';
  end if;

  if new.invite_code is distinct from old.invite_code then
    raise exception 'No se puede cambiar el código de invitación';
  end if;

  if new.coach_id is distinct from old.coach_id then
    if coalesce(current_setting('coachlab.redeem_invite', true), '') = 'on' then
      null; -- canje validado por redeem_invite_code()
    elsif old.coach_id = auth.uid() and new.coach_id is null then
      null; -- el coach saca a un jugador de SU plantel (vía release_player)
    else
      raise exception 'El vínculo con el coach solo se cambia canjeando un código de invitación';
    end if;
  end if;

  if new.email is distinct from old.email then
    raise exception 'El email no se cambia desde el perfil';
  end if;

  return new;
end;
$$;
