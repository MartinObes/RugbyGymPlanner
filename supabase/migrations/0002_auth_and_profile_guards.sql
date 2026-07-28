-- Creación del perfil al registrarse, y las reglas que ni el dueño de la cuenta
-- puede saltear. Ver CLAUDE.md §4.

-- ---------------------------------------------------------------------------
-- Código de invitación del coach
-- ---------------------------------------------------------------------------

-- 6 caracteres de un alfabeto sin 0/O ni 1/I/L: se dicta en voz alta en un
-- vestuario sin que nadie pregunte "¿cero o o?".
create or replace function public.generate_invite_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
  attempt   integer := 0;
begin
  loop
    candidate := '';
    for _ in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    exit when not exists (select 1 from public.profiles where invite_code = candidate);

    attempt := attempt + 1;
    if attempt > 20 then
      raise exception 'No se pudo generar un código de invitación único';
    end if;
  end loop;

  return candidate;
end;
$$;

-- ---------------------------------------------------------------------------
-- Alta de perfil al registrarse
-- ---------------------------------------------------------------------------

-- Corre como SECURITY DEFINER: es el único camino por el que nace una fila de
-- profiles, y por eso no necesita política de INSERT.
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
    v_invite := nullif(new.raw_user_meta_data ->> 'invite_code', '');
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Qué NO puede cambiar de su propio perfil un usuario
-- ---------------------------------------------------------------------------

-- RLS decide si podés escribir una FILA, no qué COLUMNAS. Sin esto, un jugador
-- con permiso de editar su perfil podría hacer role='ADMIN' con un PATCH.
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

  -- Un jugador sin coach puede vincularse una vez canjeando un invite code.
  -- Cambiar de coach después es decisión del coach o del admin, no del jugador.
  if new.coach_id is distinct from old.coach_id and old.coach_id is not null then
    raise exception 'No se puede cambiar de coach';
  end if;

  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_changes();
