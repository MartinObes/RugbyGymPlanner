-- ---------------------------------------------------------------------------
-- F4-B — Simplificar la asignación de rutinas.
-- docs/superpowers/specs/2026-07-31-f4b-assignment-model-design.md
--
--   1. Convierte los assignments por puesto en grupos custom de una posición.
--   2. Reescribe program_reaches_me() SIN position_id   <-- ANTES del drop.
--   3. Recién ahí dropea position_id y priority, y baja el CHECK a 3 destinos.
--   4. Agrega profiles.selected_program_id y el trigger que la resetea.
--
-- El orden 1 → 2 → 3 es OBLIGATORIO. program_reaches_me() es security definer y
-- la usan las políticas de RLS; está redefinida en 0005, no en 0003. Dropear la
-- columna antes de reescribirla deja la función apuntando a una columna
-- inexistente y rompe la capa 1 de CLAUDE.md §4: toda lectura del programa del
-- jugador falla. No lo agarran ni typecheck ni los tests de dominio.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Conversión: un grupo custom por cada puesto usado como destino
--
-- Se convierte y NO se borra: borrar deja jugadores sin programa EN SILENCIO, y
-- el coach se entera cuando alguien le avisa que no le aparece la rutina. Es
-- no-op si ningún assignment apunta a un puesto, que es el caso esperado hoy.
--
-- El nombre lleva el prefijo "Puesto: " por la unique (coach_id, name) de
-- position_groups: sin prefijo, un coach que ya tuviera un grupo llamado "Wing"
-- haría fallar la migración entera. Con el prefijo la colisión es improbable, y
-- si igual ocurriera, el on conflict reusa el grupo existente en vez de abortar.
-- ---------------------------------------------------------------------------

insert into public.position_groups (coach_id, name)
select distinct pr.coach_id, 'Puesto: ' || initcap(replace(a.position_id::text, '-', ' '))
from public.program_assignments a
join public.programs pr on pr.id = a.program_id
where a.position_id is not null
on conflict (coach_id, name) do nothing;

insert into public.position_group_positions (group_id, position_id)
select distinct g.id, a.position_id
from public.program_assignments a
join public.programs pr on pr.id = a.program_id
join public.position_groups g
  on g.coach_id = pr.coach_id
 and g.name = 'Puesto: ' || initcap(replace(a.position_id::text, '-', ' '))
where a.position_id is not null
on conflict (group_id, position_id) do nothing;

update public.program_assignments a
set position_group_id = g.id,
    position_id       = null
from public.programs pr, public.position_groups g
where a.program_id = pr.id
  and a.position_id is not null
  and g.coach_id = pr.coach_id
  and g.name = 'Puesto: ' || initcap(replace(a.position_id::text, '-', ' '));

-- ---------------------------------------------------------------------------
-- 2. program_reaches_me() sin position_id
--
-- Misma semántica que la versión de 0005 (H-1: sólo alcanzan los programas de
-- MI coach), menos la rama del puesto. El puesto sigue llegando por dos
-- caminos: el grupo system que le corresponde y los grupos custom que lo
-- contienen — incluido el que acaba de crear el bloque 1.
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
        or a.system_group_id = public.my_system_group_id()
        or a.position_group_id in (
             select gp.group_id from public.position_group_positions gp
             where gp.position_id = public.my_position_id()
           )
      )
  )
$$;

-- ---------------------------------------------------------------------------
-- 3. Recién ahora se puede dropear
--
-- El CHECK va primero: Postgres se niega a dropear una columna de la que
-- depende una constraint.
-- ---------------------------------------------------------------------------

alter table public.program_assignments
  drop constraint program_assignments_one_target;

alter table public.program_assignments
  drop column position_id,
  drop column priority;

alter table public.program_assignments
  add constraint program_assignments_one_target check (
    num_nonnulls(player_id, position_group_id, system_group_id) = 1
  );

-- Gana la última asignada: la resolución ordena por created_at dentro de los
-- assignments de un programa, así que el índice acompaña a la nueva regla.
create index program_assignments_program_created_idx
  on public.program_assignments (program_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. La elección del jugador
--
-- null = "la última asignada", NO "ninguna" (F4-B §3).
--
-- on delete set null: borrar un programa devuelve al jugador al default en vez
-- de dejarlo apuntando a un fantasma.
--
-- No hace falta tocar guard_profile_changes: ese trigger es una DENY-LIST —
-- clava id, role, invite_code, coach_id y email — y esta columna no está en la
-- lista, así que el jugador la puede escribir. profiles_update ya le permite
-- tocar su propia fila, y cambiar esta columna no la saca del alcance de
-- profiles_select, así que no aplica la trampa del 42501 de CLAUDE.md §3.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column selected_program_id uuid references public.programs (id) on delete set null;

comment on column public.profiles.selected_program_id is
  'Rutina que el jugador eligió mirar. null = la última asignada. Se resetea sola cuando el coach asigna algo nuevo que lo alcanza (F4-B §2.3). Sólo vale mientras ese programa siga alcanzándolo: la validación es al leer, en resolveProgram.';

-- El mapeo puesto → grupo system para OTRO jugador.
--
-- my_system_group_id() no sirve acá: resuelve el grupo del usuario de la sesión
-- (auth.uid()), y el trigger de abajo necesita el de cada jugador del plantel.
--
-- OJO: este mapeo está duplicado en packages/core/src/domain/positions.ts y en
-- my_system_group_id(). Son 8 valores que por decisión de CLAUDE.md §2 nunca
-- cambian; si algún día cambian, hay que tocar los tres lados.
create or replace function public.system_group_of(target public.position_slug)
returns public.system_group_slug language sql immutable set search_path = public as $$
  select (case
    when target in ('primera-linea', 'segunda-linea', 'tercera-linea', 'medio-scrum') then 'forwards'
    when target in ('apertura', 'centro', 'wing', 'fullback') then 'backs'
  end)::public.system_group_slug
$$;

revoke execute on function public.system_group_of(public.position_slug) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- El reset de la elección (F4-B §2.3)
--
-- Va como trigger y no como sentencia en la ruta de alta, por tres razones:
--   * es atómico con el insert, así que ningún camino futuro que inserte un
--     assignment (el import, el seed, un fix a mano) se lo puede saltear;
--   * un assignment a un grupo toca muchas filas, y eso es una sentencia y no
--     un loop en la API;
--   * security definer evita que el coach necesite permiso de update sobre las
--     filas de sus jugadores a través del cliente de la app.
--
-- La misma regla vive como función pura en domain/assignmentReaches.ts, que es
-- donde se testea. Acá está la garantía.
-- ---------------------------------------------------------------------------

create or replace function public.reset_selected_program()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles p
  set selected_program_id = null
  where p.selected_program_id is not null
    and p.role = 'PLAYER'
    -- El assignment sólo alcanza a jugadores del coach dueño del programa.
    and p.coach_id = (select pr.coach_id from public.programs pr where pr.id = new.program_id)
    and (
      p.id = new.player_id
      or (new.system_group_id is not null
          and public.system_group_of(p.position_id) = new.system_group_id)
      or (new.position_group_id is not null
          and exists (
            select 1 from public.position_group_positions gp
            where gp.group_id = new.position_group_id
              and gp.position_id = p.position_id
          ))
    );
  return new;
end;
$$;

create trigger program_assignments_reset_selection
  after insert on public.program_assignments
  for each row execute function public.reset_selected_program();
