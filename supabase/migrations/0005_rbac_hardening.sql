-- Hardening RBAC: cierra los hallazgos de la auditoría de F1
-- (docs/IMPLEMENTATION-F1.md §4). Todos nacieron en 0002/0003 y eran latentes;
-- F2 (assignments) y F3 (posiciones, canje de código) los volvían explotables.

-- ---------------------------------------------------------------------------
-- H-1 — program_reaches_me no acotaba los assignments al coach del jugador.
--
-- Antes: un PLAYER del coach A con posición wing matcheaba el assignment
-- system_group_id='backs' de CUALQUIER programa de CUALQUIER coach, y
-- can_read_program le abría el árbol entero por PostgREST.
--
-- Ahora: solo alcanzan los programas de MI coach. Un assignment directo
-- (player_id) de un programa ajeno tampoco se honra: el dominio dice que un
-- jugador recibe programas de su coach, punto.
-- ---------------------------------------------------------------------------

create or replace function public.program_reaches_me(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.program_assignments a
    join public.programs pr on pr.id = a.program_id
    where a.program_id = target
      and pr.coach_id = public.my_coach_id()
      and (
        a.player_id = auth.uid()
        or a.position_id = public.my_position_id()
        or a.system_group_id = public.my_system_group_id()
        or a.position_group_id in (
             select gp.group_id from public.position_group_positions gp
             where gp.position_id = public.my_position_id()
           )
      )
  )
$$;

-- ---------------------------------------------------------------------------
-- M-1 + L-2 — guard_profile_changes endurecido.
--
-- coach_id NUNCA llega del cliente. Solo dos caminos válidos:
--   1. redeem_invite_code(): valida el código y marca la transacción con un
--      flag local que este guard reconoce.
--   2. El coach del jugador lo DESVINCULA de su propio plantel (nunca lo
--      asigna a otro coach): old.coach_id = auth.uid() y new.coach_id null.
--
-- email tampoco se toca: profiles.email es un espejo de auth.users.email y
-- cambiarlo acá lo haría divergir de la identidad real. (Si algún día se
-- agrega cambio de email vía Supabase Auth, el sync usa el mismo patrón del
-- flag.)
-- ---------------------------------------------------------------------------

create or replace function public.guard_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() es null cuando corre el seed o una migración con service_role.
  -- Ese camino es de confianza por definición y no pasa por acá con un usuario.
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
      null; -- el coach saca a un jugador de SU plantel
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

-- ---------------------------------------------------------------------------
-- M-1 — redeem_invite_code: el único camino para vincularse a un coach.
--
-- SECURITY DEFINER: valida el código sin abrir profiles a la lectura, y setea
-- el flag transaction-local (set_config con is_local=true muere al terminar la
-- transacción) que guard_profile_changes exige para aceptar el cambio.
--
-- F3 la consume desde la pantalla de perfil del jugador sin vincular.
-- ---------------------------------------------------------------------------

create or replace function public.redeem_invite_code(code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select p.id into v_coach
  from public.profiles p
  where p.invite_code = upper(trim(code))
    and p.role = 'COACH';

  if v_coach is null then
    raise exception 'El código de invitación no existe';
  end if;

  perform set_config('coachlab.redeem_invite', 'on', true);

  update public.profiles
     set coach_id = v_coach
   where id = auth.uid()
     and role = 'PLAYER'
     and coach_id is null;

  if not found then
    raise exception 'Solo un jugador sin coach puede canjear un código';
  end if;

  perform set_config('coachlab.redeem_invite', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- L-1 — revocar los EXECUTE que el default de Postgres regala.
--
-- generate_invite_code: solo la usa handle_new_user, que es SECURITY DEFINER —
-- corre como el owner de la función, así que estos revokes no la afectan.
-- ---------------------------------------------------------------------------

revoke execute on function public.generate_invite_code() from public, anon, authenticated;

-- Helpers de RLS: ninguna política corre como anon (todas son "to authenticated").
revoke execute on function public.is_admin()               from public, anon;
revoke execute on function public.my_coach_id()            from public, anon;
revoke execute on function public.my_position_id()         from public, anon;
revoke execute on function public.my_system_group_id()     from public, anon;
revoke execute on function public.is_my_player(uuid)       from public, anon;
revoke execute on function public.owns_program(uuid)       from public, anon;
revoke execute on function public.program_reaches_me(uuid) from public, anon;
revoke execute on function public.can_read_program(uuid)   from public, anon;
revoke execute on function public.can_write_program(uuid)  from public, anon;

-- Los que NINGUNA política llama directo (solo se usan dentro de funciones
-- security definer, que corren como su owner) tampoco tienen por qué ser
-- oráculos de authenticated vía /rest/v1/rpc. Los que las políticas SÍ llaman
-- directo (is_admin, my_coach_id, is_my_player, can_read_program,
-- can_write_program) conservan EXECUTE de authenticated: se evalúan con los
-- privilegios del que consulta.
revoke execute on function public.my_position_id()         from authenticated;
revoke execute on function public.my_system_group_id()     from authenticated;
revoke execute on function public.owns_program(uuid)       from authenticated;
revoke execute on function public.program_reaches_me(uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- Cosmético de la auditoría: handle_new_user comparaba upper(v_invite) sin
-- trim, mientras coach_name_for_invite (0004) hace upper(trim(code)). Se
-- alinean. (La función se reemplaza entera; el único cambio es el trim.)
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role    public.user_role;
  v_name    text;
  v_invite  text;
  v_coach   uuid;
begin
  v_name := coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1));
  v_role := coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'PLAYER');

  -- CLAUDE.md §4: ADMIN no se autoregistra. Si alguien manda role=ADMIN en el
  -- signup, entra como jugador. Los admins se crean por seed o por consola.
  if v_role = 'ADMIN' then
    v_role := 'PLAYER';
  end if;

  if v_role = 'PLAYER' then
    v_invite := nullif(trim(new.raw_user_meta_data ->> 'invite_code'), '');
    if v_invite is not null then
      select p.id into v_coach
      from public.profiles p
      where p.invite_code = upper(v_invite) and p.role = 'COACH';
    end if;
  end if;

  insert into public.profiles (id, email, name, role, coach_id, invite_code)
  values (
    new.id,
    new.email,
    v_name,
    v_role,
    case when v_role = 'PLAYER' then v_coach else null end,
    case when v_role = 'COACH' then public.generate_invite_code() else null end
  );

  return new;
end;
$$;
