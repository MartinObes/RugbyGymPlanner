-- Cierra los dos hallazgos de la tercera pasada de auditoría RBAC.

-- ---------------------------------------------------------------------------
-- MEDIUM-1 — `revoke ... from anon` no revocaba NADA.
--
-- Postgres otorga EXECUTE a PUBLIC al crear una función. Revocar solo a `anon`
-- quita el grant directo pero deja el de PUBLIC, y el chequeo de privilegios
-- cae en PUBLIC: la anon key seguía llegando a la función. Se comprobó en vivo
-- contra el proyecto real:
--
--   redeem_invite_code  -> P0001 "No autenticado"        (la función CORRIÓ)
--   generate_invite_code (0005, con `from public, anon`)
--                       -> 42501 "permission denied"     (revocada de verdad)
--
-- 0005 lo había hecho bien; 0006, 0007 y 0008 copiaron la forma incompleta.
-- No hubo exposición de datos (las tres cortan solas en `auth.uid() is null`),
-- pero un endpoint que el registro de auditoría daba por cerrado estaba abierto.
--
-- El `grant ... to authenticated` es explícito y no redundante: dejar la
-- ejecución colgando del grant implícito de PUBLIC es justo el problema que se
-- está arreglando.
-- ---------------------------------------------------------------------------

revoke execute on function public.redeem_invite_code(text)         from public, anon;
revoke execute on function public.release_player(uuid)             from public, anon;
revoke execute on function public.ensure_exercise(text, text)      from public, anon;

grant execute on function public.redeem_invite_code(text)          to authenticated;
grant execute on function public.release_player(uuid)              to authenticated;
grant execute on function public.ensure_exercise(text, text)       to authenticated;

-- coach_name_for_invite (0004) SÍ tiene que seguir alcanzable por anon: la usa
-- el formulario de registro antes de que exista la sesión. Queda documentado acá
-- para que la próxima pasada no la "arregle" y rompa el registro de jugadores.

-- ---------------------------------------------------------------------------
-- MEDIUM-2 — un assignment podía quedar apuntando al jugador de otro coach.
--
-- guard_assignment_targets (0006) valida los destinos en el momento de la
-- escritura, pero nada revalidaba cuando cambiaba el plantel:
--
--   coach A asigna su programa al jugador P  →  release_player(P)
--   →  P canjea el código del coach B  →  queda un assignment del programa de A
--      apuntando a un jugador de B.
--
-- No habilita lectura cross-tenant (el join de program_reaches_me lo
-- neutraliza), pero rompe el invariante que CLAUDE.md §3 afirma y sobre el que
-- F2 construye la UI de assignments. Peor: como el trigger corre también en
-- UPDATE, esa fila quedaba INMODIFICABLE — cambiar solo `priority` disparaba la
-- excepción del destino.
--
-- Se arregla por los dos lados: la desvinculación limpia los assignments
-- directos, y el trigger deja de bloquear updates que no tocan los destinos.
-- ---------------------------------------------------------------------------

create or replace function public.release_player(player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_released boolean := false;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  update public.profiles
     set coach_id = null
   where id = player_id
     and role = 'PLAYER'
     -- El ADMIN también puede desvincular (CLAUDE.md §4: "ADMIN todo"). Su
     -- coach_id nunca coincide con auth.uid() porque ningún jugador lo tiene
     -- como coach, así que sin esto la RPC no le servía.
     and (coach_id = auth.uid() or public.is_admin());

  v_released := found;

  if not v_released then
    raise exception 'Ese jugador no está en tu plantel';
  end if;

  -- Los assignments directos a este jugador dejan de tener sentido: el jugador
  -- ya no es del plantel. Si no se borran, sobreviven como filas que apuntan a
  -- un jugador ajeno en cuanto se vincule a otro coach.
  --
  -- Solo los del coach que desvincula: si otro coach le asignó algo alguna vez,
  -- no es asunto de esta operación.
  delete from public.program_assignments a
   using public.programs pr
   where a.program_id = pr.id
     and a.player_id  = player_id
     and (pr.coach_id = auth.uid() or public.is_admin());
end;
$$;

revoke execute on function public.release_player(uuid) from public, anon;
grant  execute on function public.release_player(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- El trigger de destinos, acotado.
--
-- 1. `update of program_id, player_id, position_group_id`: editar la prioridad
--    de un assignment heredado ya no queda bloqueado por un destino que era
--    válido cuando se creó.
-- 2. Autorización primero, con UN solo mensaje: el trigger es BEFORE ROW y lee
--    programs como definer, así que corría antes del WITH CHECK y distinguía
--    "el programa no existe" de "el programa es de otro" — un oráculo de
--    existencia de programas ajenos (LOW-1 de la auditoría).
-- ---------------------------------------------------------------------------

create or replace function public.guard_assignment_targets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach uuid;
begin
  select pr.coach_id into v_coach from public.programs pr where pr.id = new.program_id;

  -- Mismo mensaje para "no existe" y "no es tuyo" (CLAUDE.md §4: no revelar
  -- existencia). El seed y los scripts a mano corren con service_role, donde
  -- auth.uid() es null y is_admin() false: para ellos alcanza con que el
  -- programa exista.
  if v_coach is null or (auth.uid() is not null and not (v_coach = auth.uid() or public.is_admin())) then
    raise exception 'El programa del assignment no existe';
  end if;

  if new.player_id is not null
     and not exists (
       select 1 from public.profiles p
       where p.id = new.player_id and p.role = 'PLAYER' and p.coach_id = v_coach
     ) then
    raise exception 'El jugador del assignment no está en el plantel del coach del programa';
  end if;

  if new.position_group_id is not null
     and not exists (
       select 1 from public.position_groups g
       where g.id = new.position_group_id and g.coach_id = v_coach
     ) then
    raise exception 'El grupo del assignment no es del coach del programa';
  end if;

  return new;
end;
$$;

drop trigger program_assignments_guard_targets on public.program_assignments;

create trigger program_assignments_guard_targets
  before insert or update of program_id, player_id, position_group_id
  on public.program_assignments
  for each row execute function public.guard_assignment_targets();
