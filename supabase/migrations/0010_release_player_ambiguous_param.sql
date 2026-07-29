-- release_player tiraba `column reference "player_id" is ambiguous`.
--
-- El parámetro se llama player_id y program_assignments TAMBIÉN tiene una
-- columna player_id, así que el DELETE que 0009 agregó no podía resolver el
-- nombre. (El UPDATE sobre profiles nunca fue ambiguo porque esa tabla no tiene
-- esa columna, y por eso el bug apareció recién al agregar la limpieza.)
--
-- Se copia el parámetro a una variable local en vez de renombrarlo: el nombre
-- del parámetro es parte del contrato de la RPC (PostgREST lo recibe por nombre
-- en el body), y renombrarlo obligaría a un DROP + CREATE y a cambiar todos los
-- llamadores.
--
-- Regla para las próximas funciones: si el parámetro se llama igual que una
-- columna de cualquier tabla que la función toca, va a variable local.

create or replace function public.release_player(player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid := player_id;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  update public.profiles
     set coach_id = null
   where id = v_player
     and role = 'PLAYER'
     -- El ADMIN también puede desvincular (CLAUDE.md §4: "ADMIN todo"). Su
     -- coach_id nunca coincide con auth.uid() porque ningún jugador lo tiene
     -- como coach, así que sin esto la RPC no le servía.
     and (coach_id = auth.uid() or public.is_admin());

  if not found then
    raise exception 'Ese jugador no está en tu plantel';
  end if;

  -- Los assignments directos a este jugador dejan de tener sentido: ya no es del
  -- plantel. Si no se borran, sobreviven apuntando a un jugador que en cuanto
  -- canjee otro código pasa a ser de otro coach.
  delete from public.program_assignments a
   using public.programs pr
   where a.program_id = pr.id
     and a.player_id  = v_player
     and (pr.coach_id = auth.uid() or public.is_admin());
end;
$$;

revoke execute on function public.release_player(uuid) from public, anon;
grant  execute on function public.release_player(uuid) to authenticated;
