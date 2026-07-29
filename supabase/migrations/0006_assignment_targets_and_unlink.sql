-- Segunda pasada del hardening: cierra lo que encontró la re-auditoría de 0005
-- (docs/IMPLEMENTATION-F1.md §4). Va antes de F2 porque los tres puntos son
-- exactamente lo que la gestión de plantel y de assignments va a pisar.

-- ---------------------------------------------------------------------------
-- M-1 (re-auditoría) — la desvinculación por el coach era código muerto.
--
-- 0005 documenta como camino válido que un coach saque a un jugador de su
-- plantel (coach_id → null), y el trigger lo permite. Pero nunca llegaba al
-- trigger: el WITH CHECK de profiles_update se evalúa sobre la fila NUEVA, y
-- ahí `coach_id = auth.uid()` ya es null → "new row violates row-level
-- security policy".
--
-- Falla cerrada (nadie pudo hacer nada indebido), pero la operación legítima
-- era imposible. Se agrega `coach_id is null` al WITH CHECK.
--
-- Sigue siendo seguro porque el USING no cambia: solo alcanzo mi propia fila,
-- las de mis jugadores, o todas si soy ADMIN. Y qué COLUMNAS se pueden tocar lo
-- decide el trigger, no la política: un jugador que intente auto-desvincularse
-- pasa el WITH CHECK y muere en guard_profile_changes, porque su old.coach_id
-- es el id de su coach y no el suyo.
-- ---------------------------------------------------------------------------

drop policy profiles_update on public.profiles;

create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or coach_id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or coach_id = auth.uid() or coach_id is null or public.is_admin());

-- ---------------------------------------------------------------------------
-- L-1 (re-auditoría) — los destinos de un assignment no tenían scoping.
--
-- program_assignments solo validaba can_write_program(program_id): un coach
-- podía apuntar un assignment de SU programa al player_id de un jugador ajeno,
-- o al position_group_id de un grupo ajeno. Los FK se validan como owner de la
-- tabla, así que RLS no los mira.
--
-- Después de 0005 eso es inerte para la lectura (el join de program_reaches_me
-- lo neutraliza), pero es un invariante de integridad que F2 va a asumir que
-- existe cuando arme la UI de assignments — y si algún día program_reaches_me
-- se refactorea, vuelve a ser el H-1 cross-tenant.
--
-- Va como trigger y no como CHECK porque necesita consultar otras tablas.
-- Aplica también al service_role a propósito: es un invariante del dominio, no
-- una regla de autorización.
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

  if v_coach is null then
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

create trigger program_assignments_guard_targets
  before insert or update on public.program_assignments
  for each row execute function public.guard_assignment_targets();

-- ---------------------------------------------------------------------------
-- L-2 (re-auditoría) — redeem_invite_code no tiene por qué existir para anon.
--
-- Corta en `auth.uid() is null` antes de mirar el código, así que no era un
-- oráculo. Pero una función que solo sirve autenticada no debería estar
-- expuesta en /rest/v1/rpc para anon.
--
-- Sobre el oráculo que SÍ queda: un usuario autenticado puede distinguir un
-- código existente de uno inexistente por el mensaje de error. Es deliberado
-- y del mismo poder que coach_name_for_invite (0004), que a un anónimo le
-- devuelve directamente el nombre del coach: 31^6 ≈ 887M combinaciones y lo
-- único que se gana es saber que un código existe. El mensaje distinto vale
-- más como UX que lo que cuesta como filtración.
-- ---------------------------------------------------------------------------

revoke execute on function public.redeem_invite_code(text) from anon;
