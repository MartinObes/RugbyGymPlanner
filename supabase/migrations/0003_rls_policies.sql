-- Row Level Security — capa 1 de CLAUDE.md §4.
--
-- Es la única capa que un bug en el código de la app no puede saltear: aunque
-- una ruta se olvide del guard y arme un select sin filtrar, la base no devuelve
-- filas ajenas.
--
-- Regla que hace que todo esto sirva: NINGUNA operación de usuario usa la
-- service_role key, porque saltea RLS por diseño. Solo migraciones, seed y
-- scripts de administración.

-- ---------------------------------------------------------------------------
-- Helpers
--
-- Todos SECURITY DEFINER a propósito: una política sobre profiles que consulte
-- profiles se llamaría a sí misma para siempre. Al correr como definer, estas
-- funciones leen sin pasar por RLS y cortan la recursión.
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.role = 'ADMIN' from public.profiles p where p.id = auth.uid()), false)
$$;

create or replace function public.my_coach_id()
returns uuid language sql stable security definer set search_path = public as $$
  select p.coach_id from public.profiles p where p.id = auth.uid()
$$;

create or replace function public.my_position_id()
returns public.position_slug language sql stable security definer set search_path = public as $$
  select p.position_id from public.profiles p where p.id = auth.uid()
$$;

-- OJO: este mapeo puesto → grupo system está duplicado en
-- packages/core/src/domain/positions.ts. Son 8 valores que por decisión de
-- CLAUDE.md §2 nunca cambian; si algún día cambian, hay que tocar los dos lados.
create or replace function public.my_system_group_id()
returns public.system_group_slug language sql stable security definer set search_path = public as $$
  select (case
    when public.my_position_id() in ('primera-linea', 'segunda-linea', 'tercera-linea', 'medio-scrum') then 'forwards'
    when public.my_position_id() in ('apertura', 'centro', 'wing', 'fullback') then 'backs'
  end)::public.system_group_slug
$$;

create or replace function public.is_my_player(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = target and p.coach_id = auth.uid())
$$;

create or replace function public.owns_program(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.programs pr where pr.id = target and pr.coach_id = auth.uid())
$$;

-- ¿Hay algún assignment de este programa que me alcance? Es la versión SQL de
-- los 4 niveles de resolveProgram, sin la parte de prioridades: acá solo importa
-- si el programa me toca o no, no cuál gana.
create or replace function public.program_reaches_me(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.program_assignments a
    where a.program_id = target
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

create or replace function public.can_read_program(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.owns_program(target) or public.program_reaches_me(target)
$$;

create or replace function public.can_write_program(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.owns_program(target)
$$;

-- ---------------------------------------------------------------------------
-- Habilitar RLS en TODAS las tablas.
-- Sin política explícita, nadie ve nada. Ese es el default correcto.
-- ---------------------------------------------------------------------------

alter table public.profiles                 enable row level security;
alter table public.exercises                enable row level security;
alter table public.one_rms                  enable row level security;
alter table public.evaluations              enable row level security;
alter table public.programs                 enable row level security;
alter table public.weeks                    enable row level security;
alter table public.days                     enable row level security;
alter table public.blocks                   enable row level security;
alter table public.block_exercises          enable row level security;
alter table public.position_groups          enable row level security;
alter table public.position_group_positions enable row level security;
alter table public.program_assignments      enable row level security;
alter table public.session_logs             enable row level security;
alter table public.exercise_entries         enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

-- Me veo a mí, a mis jugadores si soy coach, y a mi coach si soy jugador.
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or coach_id = auth.uid()
    or id = public.my_coach_id()
    or public.is_admin()
  );

-- Qué columnas se pueden tocar lo decide el trigger guard_profile_changes.
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or coach_id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or coach_id = auth.uid() or public.is_admin());

-- Sin política de INSERT: los perfiles nacen solo por el trigger on_auth_user_created.
-- Sin política de DELETE: se borran por cascada al borrar el usuario de auth.

-- ---------------------------------------------------------------------------
-- exercises — catálogo global, lectura para todos, escritura solo ADMIN
-- ---------------------------------------------------------------------------

create policy exercises_select on public.exercises for select to authenticated using (true);
create policy exercises_write  on public.exercises for all    to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- one_rms y evaluations — del jugador, visibles para su coach
-- ---------------------------------------------------------------------------

create policy one_rms_select on public.one_rms for select to authenticated
  using (player_id = auth.uid() or public.is_my_player(player_id) or public.is_admin());

create policy one_rms_write on public.one_rms for all to authenticated
  using (player_id = auth.uid() or public.is_admin())
  with check (player_id = auth.uid() or public.is_admin());

create policy evaluations_select on public.evaluations for select to authenticated
  using (player_id = auth.uid() or public.is_my_player(player_id) or public.is_admin());

create policy evaluations_write on public.evaluations for all to authenticated
  using (player_id = auth.uid() or public.is_my_player(player_id) or public.is_admin())
  with check (player_id = auth.uid() or public.is_my_player(player_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- programs y su árbol
-- ---------------------------------------------------------------------------

create policy programs_select on public.programs for select to authenticated
  using (public.can_read_program(id));

create policy programs_write on public.programs for all to authenticated
  using (coach_id = auth.uid() or public.is_admin())
  with check (coach_id = auth.uid() or public.is_admin());

create policy weeks_select on public.weeks for select to authenticated
  using (public.can_read_program(program_id));
create policy weeks_write on public.weeks for all to authenticated
  using (public.can_write_program(program_id))
  with check (public.can_write_program(program_id));

create policy days_select on public.days for select to authenticated
  using (exists (select 1 from public.weeks w where w.id = week_id and public.can_read_program(w.program_id)));
create policy days_write on public.days for all to authenticated
  using (exists (select 1 from public.weeks w where w.id = week_id and public.can_write_program(w.program_id)))
  with check (exists (select 1 from public.weeks w where w.id = week_id and public.can_write_program(w.program_id)));

create policy blocks_select on public.blocks for select to authenticated
  using (exists (
    select 1 from public.days d join public.weeks w on w.id = d.week_id
    where d.id = day_id and public.can_read_program(w.program_id)));
create policy blocks_write on public.blocks for all to authenticated
  using (exists (
    select 1 from public.days d join public.weeks w on w.id = d.week_id
    where d.id = day_id and public.can_write_program(w.program_id)))
  with check (exists (
    select 1 from public.days d join public.weeks w on w.id = d.week_id
    where d.id = day_id and public.can_write_program(w.program_id)));

create policy block_exercises_select on public.block_exercises for select to authenticated
  using (exists (
    select 1 from public.blocks b join public.days d on d.id = b.day_id join public.weeks w on w.id = d.week_id
    where b.id = block_id and public.can_read_program(w.program_id)));
create policy block_exercises_write on public.block_exercises for all to authenticated
  using (exists (
    select 1 from public.blocks b join public.days d on d.id = b.day_id join public.weeks w on w.id = d.week_id
    where b.id = block_id and public.can_write_program(w.program_id)))
  with check (exists (
    select 1 from public.blocks b join public.days d on d.id = b.day_id join public.weeks w on w.id = d.week_id
    where b.id = block_id and public.can_write_program(w.program_id)));

-- ---------------------------------------------------------------------------
-- Grupos custom y assignments
-- ---------------------------------------------------------------------------

-- Un jugador necesita leer los grupos para saber si un programa le llega.
create policy position_groups_select on public.position_groups for select to authenticated
  using (coach_id = auth.uid() or coach_id = public.my_coach_id() or public.is_admin());
create policy position_groups_write on public.position_groups for all to authenticated
  using (coach_id = auth.uid() or public.is_admin())
  with check (coach_id = auth.uid() or public.is_admin());

create policy pgp_select on public.position_group_positions for select to authenticated
  using (exists (
    select 1 from public.position_groups g
    where g.id = group_id and (g.coach_id = auth.uid() or g.coach_id = public.my_coach_id() or public.is_admin())));
create policy pgp_write on public.position_group_positions for all to authenticated
  using (exists (select 1 from public.position_groups g where g.id = group_id and (g.coach_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.position_groups g where g.id = group_id and (g.coach_id = auth.uid() or public.is_admin())));

create policy program_assignments_select on public.program_assignments for select to authenticated
  using (public.can_read_program(program_id));
create policy program_assignments_write on public.program_assignments for all to authenticated
  using (public.can_write_program(program_id))
  with check (public.can_write_program(program_id));

-- ---------------------------------------------------------------------------
-- Lo que registró el jugador
--
-- El coach LEE pero no escribe: el log es del jugador. Que el coach pudiera
-- editar lo que un jugador dijo que levantó rompería el dato del producto.
-- ---------------------------------------------------------------------------

create policy session_logs_select on public.session_logs for select to authenticated
  using (player_id = auth.uid() or public.is_my_player(player_id) or public.is_admin());

create policy session_logs_write on public.session_logs for all to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid());

create policy exercise_entries_select on public.exercise_entries for select to authenticated
  using (exists (
    select 1 from public.session_logs s
    where s.id = session_log_id
      and (s.player_id = auth.uid() or public.is_my_player(s.player_id) or public.is_admin())));

create policy exercise_entries_write on public.exercise_entries for all to authenticated
  using (exists (select 1 from public.session_logs s where s.id = session_log_id and s.player_id = auth.uid()))
  with check (exists (select 1 from public.session_logs s where s.id = session_log_id and s.player_id = auth.uid()));
