-- CoachLab — schema inicial
--
-- Ver CLAUDE.md §3. Dos cosas que este schema hace y el diseño anterior en
-- DynamoDB no podía: la coherencia de load_type y el "exactamente un destino"
-- de los assignments son CHECK constraints, no comentarios de buena voluntad.
--
-- Las 8 posiciones y los 2 grupos system son constantes de código
-- (packages/core/src/domain/positions.ts). Acá viven como dominios de texto:
-- son inmutables, así que una tabla de 8 filas sería un join de más.

-- ---------------------------------------------------------------------------
-- Dominios
-- ---------------------------------------------------------------------------

create domain public.position_slug as text
  check (value in (
    'primera-linea', 'segunda-linea', 'tercera-linea', 'medio-scrum',
    'apertura', 'centro', 'wing', 'fullback'
  ));

create domain public.system_group_slug as text
  check (value in ('forwards', 'backs'));

create domain public.load_type as text
  check (value in ('WEIGHT', 'PERCENTAGE', 'NONE'));

create domain public.user_role as text
  check (value in ('PLAYER', 'COACH', 'ADMIN'));

-- ---------------------------------------------------------------------------
-- Personas
-- ---------------------------------------------------------------------------

-- Un perfil por usuario de Supabase Auth. La identidad (email, contraseña,
-- confirmación) vive en auth.users; acá va solo lo del dominio.
-- El email se duplica para poder listarlo sin permisos sobre el schema auth.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text             not null,
  name         text             not null,
  role         public.user_role not null,

  -- Solo COACH. UNIQUE reemplaza al item de unicidad que hacía falta en DynamoDB.
  invite_code  text unique,

  -- Solo PLAYER.
  coach_id     uuid references public.profiles (id) on delete set null,
  position_id  public.position_slug,
  height_cm    smallint check (height_cm between 100 and 250),
  weight_kg    numeric(5, 1) check (weight_kg between 30 and 250),

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Un coach no tiene coach. Un jugador no reparte códigos de invitación.
  constraint profiles_role_shape check (
    (role = 'PLAYER' and invite_code is null) or
    (role in ('COACH', 'ADMIN') and coach_id is null)
  ),
  -- Nadie es su propio coach.
  constraint profiles_no_self_coach check (coach_id is distinct from id)
);

-- "Jugadores de un coach": el access pattern más frecuente del panel.
create index profiles_coach_id_idx on public.profiles (coach_id) where coach_id is not null;

-- ---------------------------------------------------------------------------
-- Catálogo y fuerza máxima
-- ---------------------------------------------------------------------------

create table public.exercises (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  -- Clave del matching tolerante de 1RM (ver rmFor y normName en core/domain).
  normalized_name text not null unique,
  category        text,
  created_at      timestamptz not null default now()
);

create table public.one_rms (
  player_id   uuid not null references public.profiles (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  kg          numeric(5, 1) not null check (kg > 0),
  updated_at  timestamptz not null default now(),
  primary key (player_id, exercise_id)
);

-- Historial de tests. Sin UI en el MVP, pero el modelo se define ahora para no
-- migrar datos después.
create table public.evaluations (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.profiles (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  kg          numeric(5, 1) not null check (kg > 0),
  tested_on   date not null default current_date,
  created_at  timestamptz not null default now()
);

create index evaluations_player_idx on public.evaluations (player_id, tested_on desc);

-- ---------------------------------------------------------------------------
-- El árbol del programa — una tabla por nivel, sin embebido
-- ---------------------------------------------------------------------------

create table public.programs (
  id              uuid primary key default gen_random_uuid(),
  coach_id        uuid not null references public.profiles (id) on delete cascade,
  name            text not null,
  current_week_id uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index programs_coach_idx on public.programs (coach_id);

create table public.weeks (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.programs (id) on delete cascade,
  name        text not null,
  order_index integer not null default 0,
  created_at  timestamptz not null default now()
);

create index weeks_program_idx on public.weeks (program_id, order_index);

-- current_week_id se agrega recién acá porque necesita que weeks exista.
alter table public.programs
  add constraint programs_current_week_fk
  foreign key (current_week_id) references public.weeks (id) on delete set null;

create table public.days (
  id          uuid primary key default gen_random_uuid(),
  week_id     uuid not null references public.weeks (id) on delete cascade,
  name        text not null,
  order_index integer not null default 0
);

create index days_week_idx on public.days (week_id, order_index);

create table public.blocks (
  id          uuid primary key default gen_random_uuid(),
  day_id      uuid not null references public.days (id) on delete cascade,
  type        text,
  rounds      smallint check (rounds > 0),
  order_index integer not null default 0
);

create index blocks_day_idx on public.blocks (day_id, order_index);

create table public.block_exercises (
  id          uuid primary key default gen_random_uuid(),
  block_id    uuid not null references public.blocks (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,

  load_type   public.load_type not null,
  weight      numeric(5, 1) check (weight > 0),
  percentage  smallint      check (percentage between 1 and 100),

  sets        smallint check (sets > 0),
  -- Texto a propósito: el prototipo admite "8-10" y "AMRAP", no solo números.
  reps        text,
  target_rpe  numeric(3, 1) check (target_rpe between 1 and 10),
  order_index integer not null default 0,

  -- La regla que en DynamoDB solo podía vivir en Zod. Ahora es una garantía.
  constraint block_exercises_load_shape check (
    (load_type = 'WEIGHT'     and weight is not null and percentage is null) or
    (load_type = 'PERCENTAGE' and percentage is not null and weight is null) or
    (load_type = 'NONE'       and weight is null and percentage is null)
  )
);

create index block_exercises_block_idx on public.block_exercises (block_id, order_index);

-- ---------------------------------------------------------------------------
-- Grupos custom y asignaciones
-- ---------------------------------------------------------------------------

-- Solo grupos custom. Forwards y Backs son constantes de código.
create table public.position_groups (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references public.profiles (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (coach_id, name)
);

create table public.position_group_positions (
  group_id    uuid not null references public.position_groups (id) on delete cascade,
  position_id public.position_slug not null,
  primary key (group_id, position_id)
);

create table public.program_assignments (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,

  -- Exactamente uno de estos cuatro. Los niveles de prioridad y su resolución
  -- están en packages/core/src/domain/resolveProgram.ts.
  player_id         uuid references public.profiles (id) on delete cascade,
  position_group_id uuid references public.position_groups (id) on delete cascade,
  system_group_id   public.system_group_slug,
  position_id       public.position_slug,

  -- Override opcional que se SUMA a la prioridad base del nivel.
  priority   integer not null default 0,
  created_at timestamptz not null default now(),

  -- En DynamoDB esto no se podía expresar: dependía de que Zod y la derivación
  -- de targetKey estuvieran de acuerdo. Acá lo garantiza la base.
  constraint program_assignments_one_target check (
    num_nonnulls(player_id, position_group_id, system_group_id, position_id) = 1
  )
);

create index program_assignments_program_idx on public.program_assignments (program_id);
create index program_assignments_player_idx   on public.program_assignments (player_id)         where player_id is not null;
create index program_assignments_position_idx on public.program_assignments (position_id)       where position_id is not null;
create index program_assignments_sysgroup_idx on public.program_assignments (system_group_id)   where system_group_id is not null;
create index program_assignments_group_idx    on public.program_assignments (position_group_id) where position_group_id is not null;

-- ---------------------------------------------------------------------------
-- Lo que el jugador registró
-- ---------------------------------------------------------------------------

create table public.session_logs (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references public.profiles (id) on delete cascade,
  day_id       uuid not null references public.days (id) on delete cascade,
  note         text,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Un jugador tiene un solo log por día del programa.
  unique (player_id, day_id)
);

create index session_logs_player_idx on public.session_logs (player_id, completed_at desc nulls last);

create table public.exercise_entries (
  id                uuid primary key default gen_random_uuid(),
  session_log_id    uuid not null references public.session_logs (id) on delete cascade,
  block_exercise_id uuid not null references public.block_exercises (id) on delete cascade,

  weight numeric(5, 1) check (weight >= 0),
  reps   smallint      check (reps >= 0),
  rpe    numeric(3, 1) check (rpe between 1 and 10),

  unique (session_log_id, block_exercise_id)
);

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch     before update on public.profiles     for each row execute function public.touch_updated_at();
create trigger programs_touch     before update on public.programs     for each row execute function public.touch_updated_at();
create trigger session_logs_touch before update on public.session_logs for each row execute function public.touch_updated_at();
create trigger one_rms_touch      before update on public.one_rms      for each row execute function public.touch_updated_at();
