-- La desvinculación de un jugador NO puede hacerse con un PATCH a profiles.
-- Motivo (comprobado en vivo contra el proyecto real):
--
--   Postgres exige que la fila RESULTANTE de un UPDATE siga siendo visible bajo
--   las políticas de SELECT. Al poner coach_id = null, el jugador deja de ser
--   "mi jugador" para profiles_select y la fila se vuelve invisible para el
--   coach que la está editando → 42501 "new row violates row-level security
--   policy", incluso sin RETURNING y aunque el WITH CHECK de profiles_update
--   pase.
--
-- Ampliar profiles_select con `coach_id is null` haría pasar el update, pero a
-- costa de exponer el perfil de CUALQUIER jugador sin coach a CUALQUIER usuario
-- autenticado. Inaceptable: es justo el scoping que la capa 1 tiene que dar.
--
-- Entonces la operación va por una RPC security definer, igual que
-- redeem_invite_code (0005): corre como owner, así que no la frena RLS, y
-- valida ella misma la autorización.

-- ---------------------------------------------------------------------------
-- Revertir el WITH CHECK de 0006.
--
-- Ese `coach_id is null` quedó probadamente inútil (la política de SELECT
-- bloquea ese camino igual), y una rama muerta en una política de seguridad es
-- peor que ruido: el próximo que la lea va a creer que el PATCH funciona.
-- ---------------------------------------------------------------------------

drop policy profiles_update on public.profiles;

create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or coach_id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or coach_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- release_player: el coach saca a un jugador de SU plantel.
--
-- Doble validación a propósito: el WHERE exige coach_id = auth.uid(), y el
-- trigger guard_profile_changes vuelve a verificarlo en su rama de
-- desvinculación (old.coach_id = auth.uid() and new.coach_id is null). Si algún
-- día esta función se toca de más, el trigger sigue siendo el piso.
--
-- El jugador queda sin coach, no borrado: su historial de logs y 1RM es suyo, y
-- puede volver a vincularse con redeem_invite_code.
-- ---------------------------------------------------------------------------

create or replace function public.release_player(player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  update public.profiles
     set coach_id = null
   where id = player_id
     and role = 'PLAYER'
     and coach_id = auth.uid();

  if not found then
    raise exception 'Ese jugador no está en tu plantel';
  end if;
end;
$$;

revoke execute on function public.release_player(uuid) from anon;
