-- ---------------------------------------------------------------------------
-- El import necesita agregar ejercicios al catálogo, y no puede.
--
-- exercises_write (0003) es solo ADMIN, a propósito: el catálogo es global y no
-- queremos que cualquiera lo edite. Pero el import de un programa trae nombres
-- que pueden no existir ("Remo Pendlay"), y abortar el import por eso sería
-- inusable.
--
-- Salida: una RPC security definer que SOLO inserta si falta y devuelve el id.
-- No actualiza ni borra nada, así que el catálogo puede crecer pero no se puede
-- pisar ni vaciar desde la app.
--
-- El normalized_name lo calcula el llamador con normName() de
-- packages/core/src/domain/normName.ts: replicar ese algoritmo en SQL sería
-- tener dos fuentes de verdad del matching de 1RM (que es lo que decide si un
-- jugador ve sus kg o el aviso de "falta tu 1RM").
-- ---------------------------------------------------------------------------

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

  if length(v_name) < 2 or length(v_name) > 120 or length(v_norm) < 2 then
    raise exception 'Nombre de ejercicio inválido';
  end if;

  select e.id into v_id from public.exercises e where e.normalized_name = v_norm;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.exercises (name, normalized_name)
  values (v_name, v_norm)
  -- Dos coaches importando el mismo ejercicio a la vez: gana el primero y el
  -- segundo recibe su id, no un error.
  on conflict (normalized_name) do nothing
  returning id into v_id;

  if v_id is null then
    select e.id into v_id from public.exercises e where e.normalized_name = v_norm;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.ensure_exercise(text, text) from anon;

-- ---------------------------------------------------------------------------
-- Coherencia de la forma del bloque, al mismo nivel que la de LoadType.
--
-- blocks.type era text libre y nullable: la regla "un circuito tiene vueltas,
-- un bloque simple no" vivía solo en la UI. CLAUDE.md §5: si se puede expresar
-- como CHECK, va como CHECK además de en Zod.
--
-- La tabla está vacía (F2 es la fase que crea programas), así que el NOT NULL
-- con default no necesita backfill real; el update va por si quedó alguna fila
-- de prueba.
-- ---------------------------------------------------------------------------

update public.blocks set type = 'SINGLE' where type is null;

alter table public.blocks
  alter column type set default 'SINGLE',
  alter column type set not null;

alter table public.blocks
  add constraint blocks_type_shape check (
    (type = 'SINGLE'  and rounds is null) or
    (type = 'CIRCUIT' and rounds is not null)
  );
