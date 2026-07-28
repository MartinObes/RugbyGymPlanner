-- El formulario de registro necesita validar el código de invitación ANTES del
-- signUp, y un usuario anónimo no puede leer profiles (RLS). Esta función corre
-- como SECURITY DEFINER y revela lo mínimo: el nombre del coach dueño del
-- código, que además sirve para la UX ("Te vas a unir al plantel de X").
--
-- El trigger handle_new_user (0002) NO falla con un código inválido: crea el
-- jugador sin vincular. Esta función es lo que evita llegar a ese estado desde
-- la UI; el estado "jugador sin coach" sigue siendo válido y el guard de 0002
-- permite canjear un código después (pantalla de perfil, F3).
--
-- Adivinar códigos por fuerza bruta no paga: 31^6 ≈ 887M combinaciones y lo
-- único que devuelve es un nombre.
--
-- No hace falta grant: Postgres da EXECUTE a public por defecto y PostgREST la
-- expone como /rest/v1/rpc/coach_name_for_invite para anon y authenticated.
create or replace function public.coach_name_for_invite(code text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.name
  from public.profiles p
  where p.invite_code = upper(trim(code))
    and p.role = 'COACH'
$$;
