# F4 — Modelo de asignación y vista de feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el loop del producto — simplificar la asignación de rutinas a "gana la última asignada"
con elección del jugador, y darle al coach la pantalla donde ve qué hizo cada jugador ("2/3 días") con
el RPE del día contra los `target_rpe` del día y las notas.

**Architecture:** Dos mitades en una rama, en este orden. **Parte A (F4-B)** reemplaza la resolución por
prioridad y agrega `profiles.selected_program_id`; **Parte B** construye el feedback encima de esa
resolución final. El orden importa: la agregación del feedback necesita "el programa que el jugador ve
de verdad", que es lo que define la Parte A. Toda regla de negocio va como función pura en
`packages/core/src/domain/` con tests, y la base la garantiza otra vez con `CHECK`/trigger.

**Tech Stack:** Postgres (Supabase), supabase-js tipado, Hono + `@hono/zod-openapi`, Zod, Nuxt 4 + Vue 3
+ Nuxt UI, Vitest.

**Specs:** [F4-B](../specs/2026-07-31-f4b-assignment-model-design.md) ·
[Feedback](../specs/2026-08-02-f4-coach-feedback-design.md)

**Rama:** `feature/f4-feedback`, ya creada desde `develop` (que está al día con `main` en `d935659`).

---

## ⚠ Antes de empezar: la migración toca una base real

`supabase/.temp/project-ref` apunta a `hiceiurkvznfhujtjfar`, un proyecto hosted con datos reales.
`pnpm db:push` **no se corre sin luz verde explícita del dueño del repo** — es una acción difícil de
revertir sobre datos de producción. El plan escribe la migración y la deja lista; aplicarla es un paso
aparte y consentido (Task 5).

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `packages/core/src/domain/resolveProgram.ts` | **Reescrito.** Gana el `createdAt` más reciente + honrar la elección del jugador si sigue siendo válida |
| `packages/core/src/domain/rpeDelta.ts` | **Nuevo.** `dayTargetRpe`, `rpeDelta`, `summarizeRpe` |
| `packages/core/src/validators/program.ts` | Sin `positionId` ni `priority` en `assignmentSchema` |
| `supabase/migrations/0019_assignment_last_wins.sql` | Conversión, reescritura de `program_reaches_me()`, drops, `selected_program_id`, trigger de reset |
| `packages/api/src/access/assignments.ts` | Candidatos + elección; sin `position_id` |
| `packages/api/src/access/coachFeedback.ts` | **Nuevo.** Agregación del feedback por jugador |
| `packages/api/src/routes/coach/assignments.ts` | Alta sin `priority`/`positionId` |
| `packages/api/src/routes/coach/feedback.ts` | **Nuevo.** `GET /coach/feedback` y `/coach/feedback/{playerId}` |
| `packages/api/src/routes/player/programs.ts` | **Nuevo.** Listar las asignadas y cambiar la elegida |
| `packages/web/app/components/RpeBadge.vue` | **Nuevo.** El badge `8 → 10` con severidad |
| `packages/web/app/pages/coach/feedback/index.vue` | **Nuevo.** Listado del plantel |
| `packages/web/app/pages/coach/feedback/[playerId].vue` | **Nuevo.** Detalle por día |

---

# PARTE A — F4-B: el modelo de asignación

---

### Task 1: `resolveProgram` — gana la última asignada

**Files:**
- Modify: `packages/core/src/domain/resolveProgram.ts`
- Test: `packages/core/src/domain/resolveProgram.test.ts` (reemplaza los tests de los 4 niveles)

- [ ] **Step 1: Reemplazar el archivo de tests**

Los tests viejos prueban `BASE_PRIORITY` y los 4 niveles. Esa regla **deja de existir**, así que el
archivo se reemplaza entero:

```ts
import { describe, expect, it } from 'vitest'
import { resolveProgram, type CandidateAssignment } from './resolveProgram'

const at = (iso: string, over: Partial<CandidateAssignment> = {}): CandidateAssignment => ({
  assignmentId: `a-${iso}`,
  programId: `p-${iso}`,
  kind: 'PLAYER',
  createdAt: new Date(iso),
  ...over,
})

describe('resolveProgram', () => {
  it('sin candidatas no hay programa', () => {
    expect(resolveProgram([])).toBeNull()
  })

  it('con una sola candidata gana esa', () => {
    const only = at('2026-01-01')
    expect(resolveProgram([only])).toBe(only)
  })

  it('gana la asignada mas recientemente, sin importar el destino', () => {
    // La vieja regla habria hecho ganar a PLAYER (base 100) sobre SYSTEM_GROUP (30).
    const older = at('2026-01-01', { kind: 'PLAYER' })
    const newer = at('2026-02-01', { kind: 'SYSTEM_GROUP' })
    expect(resolveProgram([older, newer])?.assignmentId).toBe(newer.assignmentId)
  })

  it('el orden en que llegan las candidatas no cambia el resultado', () => {
    const older = at('2026-01-01')
    const newer = at('2026-02-01')
    expect(resolveProgram([newer, older])?.assignmentId).toBe(newer.assignmentId)
    expect(resolveProgram([older, newer])?.assignmentId).toBe(newer.assignmentId)
  })

  it('ante un empate exacto de createdAt es estable: gana la primera', () => {
    const a = at('2026-01-01', { assignmentId: 'a1' })
    const b = at('2026-01-01', { assignmentId: 'b1' })
    expect(resolveProgram([a, b])?.assignmentId).toBe('a1')
  })

  it('honra la eleccion del jugador cuando ese programa sigue entre las candidatas', () => {
    const older = at('2026-01-01', { programId: 'vieja' })
    const newer = at('2026-02-01', { programId: 'nueva' })
    expect(resolveProgram([older, newer], 'vieja')?.programId).toBe('vieja')
  })

  it('ignora una eleccion que ya no alcanza al jugador y cae en la ultima asignada', () => {
    // El coach le quito el assignment de 'vieja': la FK no se entera, la regla si.
    const newer = at('2026-02-01', { programId: 'nueva' })
    expect(resolveProgram([newer], 'vieja')?.programId).toBe('nueva')
  })

  it('una eleccion null significa "la ultima asignada", no "ninguna"', () => {
    const newer = at('2026-02-01', { programId: 'nueva' })
    expect(resolveProgram([newer], null)?.programId).toBe('nueva')
  })

  it('si dos assignments apuntan al mismo programa elegido, devuelve el mas reciente', () => {
    const a = at('2026-01-01', { programId: 'x', assignmentId: 'viejo' })
    const b = at('2026-03-01', { programId: 'x', assignmentId: 'nuevo' })
    expect(resolveProgram([a, b], 'x')?.assignmentId).toBe('nuevo')
  })
})
```

- [ ] **Step 2: Correr para ver que falla**

Run: `pnpm --filter @coachlab/core test resolveProgram`
Expected: FAIL — `resolveProgram` todavía toma un solo argumento y `CandidateAssignment` exige `priority`.

- [ ] **Step 3: Reescribir el módulo**

`packages/core/src/domain/resolveProgram.ts` — el archivo entero:

```ts
/**
 * Los tres destinos posibles de un assignment, con los nombres de las columnas
 * de program_assignments: player_id, position_group_id (custom) y
 * system_group_id (forwards/backs).
 *
 * `POSITION` se eliminó en F4-B: un puesto suelto se modela como grupo custom de
 * una sola posición. Ver docs/superpowers/specs/2026-07-31-f4b-assignment-model-design.md §2.2.
 */
export type AssignmentKind = 'PLAYER' | 'POSITION_GROUP' | 'SYSTEM_GROUP'

export type CandidateAssignment = {
  assignmentId: string
  programId: string
  kind: AssignmentKind
  createdAt: Date
}

/**
 * Elige el programa vigente de un jugador.
 *
 * La regla es de una línea (F4-B §2.1): **gana la última asignada**. Reemplaza a
 * la resolución por prioridad de cuatro niveles, que obligaba al coach a razonar
 * si 50 + override le ganaba a 100 cuando lo único que quería era que valiera lo
 * último que dijo.
 *
 * `selectedProgramId` es la elección del jugador (F4-B §2.3). Sólo vale si ese
 * programa TODAVÍA está entre las candidatas: el coach puede haberle quitado el
 * assignment, o haberlo cambiado de puesto o de grupo, y en ninguno de esos casos
 * se entera la FK. Ante una elección inválida se degrada al default en vez de
 * romper el render — el mismo criterio que isPositionId e isLoadType.
 *
 * Pura a propósito (CLAUDE.md §3): se podría resolver en SQL con un
 * ORDER BY ... LIMIT 1, pero entonces la regla viviría en un string y sólo se
 * podría testear con una base levantada.
 */
export function resolveProgram(
  candidates: readonly CandidateAssignment[],
  selectedProgramId?: string | null,
): CandidateAssignment | null {
  const latest = (pool: readonly CandidateAssignment[]): CandidateAssignment | null => {
    let winner: CandidateAssignment | null = null
    for (const candidate of pool) {
      // `>` y no `>=`: ante un empate exacto de createdAt gana la primera, así
      // el resultado no depende del orden en que PostgREST devolvió las filas.
      if (!winner || candidate.createdAt > winner.createdAt) winner = candidate
    }
    return winner
  }

  if (selectedProgramId) {
    const chosen = latest(candidates.filter((c) => c.programId === selectedProgramId))
    if (chosen) return chosen
  }

  return latest(candidates)
}
```

- [ ] **Step 4: Correr para ver que pasa**

Run: `pnpm --filter @coachlab/core test resolveProgram`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/resolveProgram.ts packages/core/src/domain/resolveProgram.test.ts
git commit -m "feat(domain): make the last assigned program win"
```

---

### Task 2: La regla de a quién alcanza un assignment

Es la regla del reset de F4-B §2.3: cuando el coach asigna algo nuevo, se resetea la elección de **todos
los jugadores que ese assignment alcanza**. La migración la implementa en SQL; acá vive la versión pura
y testeable, que es la que exige el spec (§3, "la regla se testea como función pura igual que
`nextOneRmFrom`").

**Files:**
- Create: `packages/core/src/domain/assignmentReaches.ts`
- Test: `packages/core/src/domain/assignmentReaches.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { describe, expect, it } from 'vitest'
import { assignmentReaches } from './assignmentReaches'

const player = {
  id: 'jugador-1',
  positionId: 'wing' as const,
  customGroupIds: ['g-lesionados'],
}

describe('assignmentReaches', () => {
  it('un assignment al propio jugador lo alcanza', () => {
    expect(assignmentReaches({ playerId: 'jugador-1' }, player)).toBe(true)
  })

  it('un assignment a otro jugador no lo alcanza', () => {
    expect(assignmentReaches({ playerId: 'jugador-2' }, player)).toBe(false)
  })

  it('un assignment al grupo system de su puesto lo alcanza', () => {
    // wing es BACK.
    expect(assignmentReaches({ systemGroupId: 'backs' }, player)).toBe(true)
  })

  it('un assignment al otro grupo system no lo alcanza', () => {
    expect(assignmentReaches({ systemGroupId: 'forwards' }, player)).toBe(false)
  })

  it('un assignment a un grupo custom que lo contiene lo alcanza', () => {
    expect(assignmentReaches({ positionGroupId: 'g-lesionados' }, player)).toBe(true)
  })

  it('un assignment a un grupo custom que no lo contiene no lo alcanza', () => {
    expect(assignmentReaches({ positionGroupId: 'g-primera' }, player)).toBe(false)
  })

  it('un jugador sin puesto no lo alcanza ningun grupo system', () => {
    const sinPuesto = { id: 'jugador-1', positionId: null, customGroupIds: [] }
    expect(assignmentReaches({ systemGroupId: 'backs' }, sinPuesto)).toBe(false)
    expect(assignmentReaches({ systemGroupId: 'forwards' }, sinPuesto)).toBe(false)
  })

  it('un jugador sin puesto igual lo alcanza un assignment directo', () => {
    const sinPuesto = { id: 'jugador-1', positionId: null, customGroupIds: [] }
    expect(assignmentReaches({ playerId: 'jugador-1' }, sinPuesto)).toBe(true)
  })
})
```

- [ ] **Step 2: Correr para ver que falla**

Run: `pnpm --filter @coachlab/core test assignmentReaches`
Expected: FAIL — "Failed to resolve import ./assignmentReaches".

- [ ] **Step 3: Implementar**

`packages/core/src/domain/assignmentReaches.ts`:

```ts
import { systemGroupForPosition } from './positions'

/** Un destino de assignment: exactamente uno de los tres viene definido. */
export type AssignmentTarget = {
  playerId?: string | null
  systemGroupId?: string | null
  positionGroupId?: string | null
}

export type ReachablePlayer = {
  id: string
  positionId: string | null
  /** Ids de los grupos custom que contienen su puesto. */
  customGroupIds: readonly string[]
}

/**
 * Si un assignment le aplica a un jugador.
 *
 * Es la regla del reset de F4-B §2.3: al crear un assignment se limpia la
 * elección de todos los jugadores que alcanza, incluidos los de un grupo. La
 * migración 0019 la implementa además en SQL — el mismo patrón de CLAUDE.md §5:
 * Zod (acá, el dominio) da el mensaje lindo, la base da la garantía.
 */
export function assignmentReaches(
  target: AssignmentTarget,
  player: ReachablePlayer,
): boolean {
  if (target.playerId) return target.playerId === player.id
  if (target.systemGroupId) {
    return systemGroupForPosition(player.positionId)?.id === target.systemGroupId
  }
  if (target.positionGroupId) return player.customGroupIds.includes(target.positionGroupId)
  return false
}
```

- [ ] **Step 4: Correr para ver que pasa**

Run: `pnpm --filter @coachlab/core test assignmentReaches`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/assignmentReaches.ts packages/core/src/domain/assignmentReaches.test.ts
git commit -m "feat(domain): add the rule for which players an assignment reaches"
```

---

### Task 3: El validador del assignment

**Files:**
- Modify: `packages/core/src/validators/program.ts`
- Test: `packages/core/src/validators/program.test.ts`

- [ ] **Step 1: Leer el schema actual**

Run: `grep -n "assignmentSchema" -A 30 packages/core/src/validators/program.ts`

Buscás el `assignmentSchema` con sus cuatro destinos, el `priority` y el refine de "exactamente uno".

- [ ] **Step 2: Escribir los tests que fallan**

Agregar a `packages/core/src/validators/program.test.ts`:

```ts
describe('assignmentSchema despues de F4-B', () => {
  it('acepta un destino de jugador', () => {
    expect(assignmentSchema.safeParse({ playerId: crypto.randomUUID() }).success).toBe(true)
  })

  it('acepta un grupo del sistema', () => {
    expect(assignmentSchema.safeParse({ systemGroupId: 'forwards' }).success).toBe(true)
  })

  it('acepta un grupo custom', () => {
    expect(assignmentSchema.safeParse({ positionGroupId: crypto.randomUUID() }).success).toBe(true)
  })

  it('rechaza dos destinos a la vez', () => {
    const result = assignmentSchema.safeParse({
      playerId: crypto.randomUUID(),
      systemGroupId: 'forwards',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza ningun destino', () => {
    expect(assignmentSchema.safeParse({}).success).toBe(false)
  })

  it('ya no acepta positionId como destino', () => {
    // Un puesto suelto se modela como grupo custom de una sola posicion (F4-B §2.2).
    const result = assignmentSchema.safeParse({ positionId: 'wing' })
    expect(result.success).toBe(false)
  })

  it('ignora priority: la columna ya no existe', () => {
    const parsed = assignmentSchema.parse({ playerId: crypto.randomUUID(), priority: 50 })
    expect(parsed).not.toHaveProperty('priority')
  })
})
```

- [ ] **Step 3: Correr para ver que falla**

Run: `pnpm --filter @coachlab/core test program`
Expected: FAIL — hoy `positionId` es válido y `priority` sobrevive al parse.

- [ ] **Step 4: Editar el schema**

En `packages/core/src/validators/program.ts`, sacar `positionId` y `priority` de `assignmentSchema`, y
dejar el refine contando **tres** destinos:

```ts
export const assignmentSchema = z
  .object({
    playerId: z.string().uuid().optional(),
    positionGroupId: z.string().uuid().optional(),
    systemGroupId: z.enum(['forwards', 'backs']).optional(),
  })
  // F4-B §2.2: tres destinos, no cuatro. El puesto salió como destino; sigue
  // existiendo en profiles.position_id, que es lo que decide grupo system y
  // qué grupos custom lo contienen.
  .refine(
    (v) => [v.playerId, v.positionGroupId, v.systemGroupId].filter(Boolean).length === 1,
    { message: 'Elegí exactamente un destino' },
  )
```

> `.object()` de Zod descarta las claves desconocidas por default, así que un
> `priority` que mande un cliente viejo se cae solo y no hace falta `.strict()`.

- [ ] **Step 5: Correr para ver que pasa**

Run: `pnpm --filter @coachlab/core test program`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/validators/program.ts packages/core/src/validators/program.test.ts
git commit -m "feat(validators): drop position target and priority from assignments"
```

---

### Task 4: La migración `0019`

**Files:**
- Create: `supabase/migrations/0019_assignment_last_wins.sql`

- [ ] **Step 1: Escribir la migración**

> ⚠ **El orden no es libre.** `program_reaches_me()` es `security definer` y la usan las políticas de
> RLS. Está **redefinida en `0005`**, no en `0003`. Hay que reescribirla **antes** de dropear
> `position_id`, o toda lectura del programa del jugador falla. Es un error que no agarran ni
> `typecheck` ni los tests de dominio.

`supabase/migrations/0019_assignment_last_wins.sql`:

```sql
-- ---------------------------------------------------------------------------
-- F4-B — Simplificar la asignación de rutinas.
-- docs/superpowers/specs/2026-07-31-f4b-assignment-model-design.md
--
-- 1. Convierte los assignments por puesto en grupos custom de una posición.
-- 2. Reescribe program_reaches_me() SIN position_id  <-- ANTES del drop.
-- 3. Recién ahí dropea position_id y priority, y baja el CHECK a 3 destinos.
-- 4. Agrega profiles.selected_program_id y el trigger que la resetea.
--
-- El orden de 1→2→3 es obligatorio: program_reaches_me() es security definer y
-- la usan las políticas de RLS. Dropear la columna primero rompe la capa 1 de
-- CLAUDE.md §4 y toda lectura del programa del jugador.
-- ---------------------------------------------------------------------------

-- --- 1. Conversión: un grupo custom por cada puesto usado como destino -------
--
-- Se convierte y no se borra: borrar deja jugadores sin programa EN SILENCIO y
-- el coach se entera cuando alguien le avisa que no le aparece la rutina.
-- Es no-op si ningún assignment apunta a un puesto.

with used as (
  select distinct pr.coach_id, a.position_id
  from public.program_assignments a
  join public.programs pr on pr.id = a.program_id
  where a.position_id is not null
),
created as (
  insert into public.position_groups (coach_id, name)
  select u.coach_id, initcap(replace(u.position_id::text, '-', ' '))
  from used u
  returning id, coach_id, name
)
insert into public.position_group_positions (group_id, position_id)
select c.id, u.position_id
from created c
join used u
  on u.coach_id = c.coach_id
 and initcap(replace(u.position_id::text, '-', ' ')) = c.name;

update public.program_assignments a
set position_group_id = g.id,
    position_id       = null
from public.programs pr
join public.position_groups g on g.coach_id = pr.coach_id
join public.position_group_positions gp on gp.group_id = g.id
where a.program_id = pr.id
  and a.position_id is not null
  and gp.position_id = a.position_id;

-- --- 2. program_reaches_me() sin position_id --------------------------------
--
-- Misma semántica que la versión de 0005 (H-1: sólo alcanzan los programas de
-- MI coach), menos la rama del puesto. El puesto sigue llegando por el grupo
-- system y por los grupos custom que lo contienen.

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

-- --- 3. Recién ahora se puede dropear ---------------------------------------

alter table public.program_assignments
  drop constraint program_assignments_one_target;

drop index if exists public.program_assignments_position_idx;

alter table public.program_assignments
  drop column position_id,
  drop column priority;

alter table public.program_assignments
  add constraint program_assignments_one_target check (
    num_nonnulls(player_id, position_group_id, system_group_id) = 1
  );

-- Gana la última asignada: la query ordena por created_at y merece su índice.
create index program_assignments_program_created_idx
  on public.program_assignments (program_id, created_at desc);

-- --- 4. La elección del jugador ---------------------------------------------
--
-- null = "la última asignada", NO "ninguna" (F4-B §3).
-- on delete set null: borrar un programa devuelve al jugador al default en vez
-- de dejarlo apuntando a un fantasma.
--
-- No hace falta tocar guard_profile_changes: ese trigger es una DENY-LIST (fija
-- id, role, invite_code, coach_id y email) y esta columna no está en la lista,
-- así que el jugador la puede escribir. profiles_update ya le permite tocar su
-- propia fila, y cambiar esta columna no la saca del alcance de profiles_select,
-- así que no aplica la trampa del 42501 de CLAUDE.md §3.

alter table public.profiles
  add column selected_program_id uuid references public.programs (id) on delete set null;

comment on column public.profiles.selected_program_id is
  'Rutina que el jugador eligió mirar. null = la última asignada. Se resetea sola cuando el coach asigna algo nuevo que lo alcanza (F4-B §2.3).';

-- --- El reset de la elección ------------------------------------------------
--
-- Va como trigger y no como sentencia en la ruta de alta, por tres razones:
--   * es atómico con el insert, así que ningún camino futuro que inserte un
--     assignment (import, seed, un fix a mano) se lo puede saltear;
--   * un assignment a un grupo toca muchas filas y eso es una sentencia, no un
--     loop en la API;
--   * security definer evita que el coach necesite permiso de update sobre las
--     filas de sus jugadores a través del cliente de la app.
-- La misma regla vive como función pura en domain/assignmentReaches.ts.

create or replace function public.reset_selected_program()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles p
  set selected_program_id = null
  where p.selected_program_id is not null
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
```

- [ ] **Step 2: Verificar que `system_group_of` existe**

Run: `grep -rn "system_group_of\|my_system_group_id" supabase/migrations/`

Expected: aparece la definición de `my_system_group_id()`. **Si no existe un `system_group_of(position)`
independiente**, agregalo al principio del bloque 4 de la migración (antes del trigger):

```sql
create or replace function public.system_group_of(position public.position_slug)
returns public.system_group_slug language sql immutable set search_path = public as $$
  select case
    when position in ('primera-linea','segunda-linea','tercera-linea','medio-scrum')
      then 'forwards'::public.system_group_slug
    when position in ('apertura','centro','wing','fullback')
      then 'backs'::public.system_group_slug
    else null
  end
$$;
```

> Si `my_system_group_id()` ya deriva el grupo del puesto del usuario actual, **no sirve acá**: el
> trigger necesita el grupo de OTRO jugador, no el del coach que está insertando.

- [ ] **Step 3: Verificar la sintaxis sin aplicar nada**

Run: `pnpm dlx supabase@latest db lint --schema public 2>/dev/null || echo "sin linter — revisar a mano"`

No hay base local levantada, así que esto puede no correr. **Releé la migración a mano** verificando el
orden 1→2→3 y que ningún bloque referencie `position_id` de `program_assignments` después del drop.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0019_assignment_last_wins.sql
git commit -m "feat(db): make the last assignment win and add the player choice"
```

---

### Task 5: Aplicar la migración y regenerar los tipos · **NECESITA LUZ VERDE**

**Files:**
- Modify: `packages/core/src/types/database.ts` (generado — no se edita a mano)

- [ ] **Step 1: Pedir confirmación explícita**

`pnpm db:push` corre contra `hiceiurkvznfhujtjfar`, un proyecto hosted **con datos reales**. Es difícil
de revertir. **Preguntar al dueño del repo antes de correrlo.** No asumir el permiso porque la tarea
diga "implementá".

Si prefiere aplicarla él, el resto del plan se puede seguir escribiendo, pero **Task 6 en adelante no
typecheckea** hasta que los tipos estén regenerados.

- [ ] **Step 2: Aplicar**

Run: `pnpm db:push`
Expected: aplica `0019` y lista la migración como nueva.

- [ ] **Step 3: Regenerar los tipos**

Run: `pnpm gen:types`
Expected: `packages/core/src/types/database.ts` pierde `position_id` y `priority` de
`program_assignments`, y gana `selected_program_id` en `profiles`.

- [ ] **Step 4: Verificar el diff de tipos**

Run: `git diff --stat packages/core/src/types/database.ts`
Expected: un solo archivo cambiado. Si cambió algo más, la base tenía deriva contra las migraciones y
hay que mirarlo antes de seguir.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/types/database.ts
git commit -m "chore(db): regenerate types after 0019"
```

---

### Task 6: El acceso a assignments

**Files:**
- Modify: `packages/api/src/access/assignments.ts`

- [ ] **Step 1: Reescribir el módulo**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@coachlab/core/types/database'
import { isPositionId, systemGroupForPosition } from '@coachlab/core/domain/positions'
import {
  resolveProgram,
  type AssignmentKind,
  type CandidateAssignment,
} from '@coachlab/core/domain/resolveProgram'

export type AssignmentRow = {
  id: string
  program_id: string
  player_id: string | null
  position_group_id: string | null
  system_group_id: string | null
  created_at: string
}

/** El destino sale de cuál columna vino no-nula: el CHECK garantiza que es una sola. */
export function kindOf(row: AssignmentRow): AssignmentKind {
  if (row.player_id) return 'PLAYER'
  if (row.position_group_id) return 'POSITION_GROUP'
  return 'SYSTEM_GROUP'
}

export function toCandidate(row: AssignmentRow): CandidateAssignment {
  return {
    assignmentId: row.id,
    programId: row.program_id,
    kind: kindOf(row),
    createdAt: new Date(row.created_at),
  }
}

export const ASSIGNMENT_COLUMNS =
  'id, program_id, player_id, position_group_id, system_group_id, created_at'

/** Los grupos custom que contienen el puesto del jugador. */
export async function customGroupIdsFor(
  db: SupabaseClient<Database>,
  positionId: string | null,
): Promise<string[]> {
  if (!positionId) return []
  const { data, error } = await db
    .from('position_group_positions')
    .select('group_id')
    .eq('position_id', positionId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => r.group_id as string)
}

/**
 * Los assignments que le aplican a un jugador. Tres destinos desde F4-B.
 *
 * RLS hace el trabajo pesado: program_assignments_select sólo devuelve los de
 * programas que el actor puede leer, y program_reaches_me (reescrita en 0019)
 * exige que el programa sea del coach del jugador.
 */
export async function candidateAssignmentsFor(
  db: SupabaseClient<Database>,
  player: { id: string; positionId: string | null },
): Promise<CandidateAssignment[]> {
  // El `.or()` se arma interpolando strings, así que el positionId tiene que ser
  // uno de los 8 slugs y no texto arbitrario: `wing,player_id.eq.<uuid>`
  // extendería el filtro.
  if (player.positionId !== null && !isPositionId(player.positionId)) {
    throw new Error(`Puesto inválido: ${player.positionId}`)
  }

  const systemGroup = systemGroupForPosition(player.positionId)
  const groupIds = await customGroupIdsFor(db, player.positionId)

  const clauses = [`player_id.eq.${player.id}`]
  if (systemGroup) clauses.push(`system_group_id.eq.${systemGroup.id}`)
  if (groupIds.length > 0) clauses.push(`position_group_id.in.(${groupIds.join(',')})`)

  const { data, error } = await db
    .from('program_assignments')
    .select(ASSIGNMENT_COLUMNS)
    .or(clauses.join(','))
  if (error) throw new Error(error.message)

  return ((data ?? []) as AssignmentRow[]).map(toCandidate)
}

/**
 * El programa que el jugador ESTÁ VIENDO: su elección si sigue siendo válida, si
 * no la última asignada. Es lo que tiene que mostrar el coach (F4-B §2.4), no el
 * default — con un selector en el medio, mostrar el default sería mentirle.
 */
export async function activeProgramIdFor(
  db: SupabaseClient<Database>,
  player: { id: string; positionId: string | null; selectedProgramId?: string | null },
): Promise<string | null> {
  const candidates = await candidateAssignmentsFor(db, player)
  return resolveProgram(candidates, player.selectedProgramId ?? null)?.programId ?? null
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @coachlab/api typecheck`
Expected: FAIL en `routes/coach/assignments.ts` (todavía importa `BASE_PRIORITY` y usa `positionId`).
Eso lo arregla la Task 7.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/access/assignments.ts
git commit -m "feat(api): resolve the program the player is actually seeing"
```

---

### Task 7: La ruta de assignments del coach

**Files:**
- Modify: `packages/api/src/routes/coach/assignments.ts`
- Modify: `packages/api/src/routes/coach/assignments.test.ts`

- [ ] **Step 1: Ajustar la ruta**

Cuatro cambios en `packages/api/src/routes/coach/assignments.ts`:

1. Borrar el import de `BASE_PRIORITY` y el de `positionById`:

```ts
import { SYSTEM_GROUPS } from '@coachlab/core/domain/positions'
```

2. El schema `Assignment` pierde las prioridades y el destino `POSITION`:

```ts
const Assignment = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(['PLAYER', 'POSITION_GROUP', 'SYSTEM_GROUP']),
    /** Nombre del destino resuelto, para no hacer que el frontend lo busque. */
    targetName: z.string(),
    createdAt: z.string(),
  })
  .openapi('Assignment')
```

3. El `map` del listado, sin la rama de puesto ni las prioridades:

```ts
    const rows = (data ?? []).map((row) => {
      const assignment = row as unknown as AssignmentRow
      const kind = kindOf(assignment)

      const targetName =
        kind === 'PLAYER'
          ? (nameOf((row as Record<string, unknown>).profiles) ?? 'Jugador')
          : kind === 'POSITION_GROUP'
            ? (nameOf((row as Record<string, unknown>).position_groups) ?? 'Grupo')
            : (SYSTEM_GROUPS.find((g) => g.id === assignment.system_group_id)?.name ?? 'Grupo')

      return {
        id: assignment.id,
        kind,
        targetName,
        createdAt: assignment.created_at,
      }
    })
```

4. El insert, sin `position_id` ni `priority`:

```ts
      .insert({
        program_id: programId,
        // Exactamente uno no-nulo: lo garantiza assignmentSchema y el CHECK
        // program_assignments_one_target (0019).
        player_id: input.playerId ?? null,
        position_group_id: input.positionGroupId ?? null,
        system_group_id: input.systemGroupId ?? null,
      })
```

5. En el preview, pasar la elección del jugador para que el coach vea lo que el jugador ve:

```ts
    const { data: playersData, error } = await db
      .from('profiles')
      .select('id, name, position_id, selected_program_id')
      .eq('coach_id', actor.id)
      .eq('role', 'PLAYER')
      .order('name')
```

y dentro del `map`:

```ts
        const programId = await activeProgramIdFor(db, {
          id: playerId,
          positionId,
          selectedProgramId: (p.selected_program_id as string | null) ?? null,
        })
```

- [ ] **Step 2: Actualizar los tests existentes**

En `packages/api/src/routes/coach/assignments.test.ts`, sacar cualquier caso que mande `positionId` o
`priority` y agregar:

```ts
it('rechaza un assignment con destino de puesto', async () => {
  const res = await app.request(`/api/coach/programs/${programId}/assignments`, {
    method: 'POST',
    headers: authHeaders(coachToken),
    body: JSON.stringify({ positionId: 'wing' }),
  })
  // Sin destino válido: el refine de assignmentSchema lo rechaza.
  expect(res.status).toBe(400)
})
```

- [ ] **Step 3: Correr**

Run: `pnpm --filter @coachlab/api test assignments`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routes/coach/assignments.ts packages/api/src/routes/coach/assignments.test.ts
git commit -m "feat(api): drop priority and the position target from assignments"
```

---

### Task 8: La ruta del jugador para elegir rutina

**Files:**
- Create: `packages/api/src/routes/player/programs.ts`
- Create: `packages/api/src/routes/player/programs.test.ts`
- Modify: `packages/api/src/app.ts`

- [ ] **Step 1: La ruta**

`packages/api/src/routes/player/programs.ts`:

```ts
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { candidateAssignmentsFor } from '../../access/assignments'
import type { AuthVariables } from '../../middleware/auth'
import { ErrorResponse } from '../schemas'
import { assertRow } from '../coach/_scope'

const PlayerProgram = z
  .object({
    programId: z.string().uuid(),
    name: z.string(),
    assignedAt: z.string(),
    /** La que el jugador está viendo: su elección, o la última asignada. */
    current: z.boolean(),
  })
  .openapi('PlayerProgram')

const ProgramsResponse = z
  .object({ ok: z.literal(true), programs: z.array(PlayerProgram) })
  .openapi('PlayerProgramsResponse')

const errors = {
  401: {
    description: 'Sin sesión o rol equivocado',
    content: { 'application/json': { schema: ErrorResponse } },
  },
  404: {
    description: 'Ese programa no te fue asignado',
    content: { 'application/json': { schema: ErrorResponse } },
  },
}

export const playerPrograms = new OpenAPIHono<{ Variables: AuthVariables }>()

playerPrograms.openapi(
  createRoute({
    method: 'get',
    path: '/player/programs',
    summary: 'Las rutinas asignadas al jugador',
    responses: {
      200: {
        description: 'Rutinas',
        content: { 'application/json': { schema: ProgramsResponse } },
      },
      401: errors[401],
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const db = c.get('db')

    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('position_id, selected_program_id')
      .eq('id', actor.id)
      .maybeSingle()
    if (profileError) throw new Error(profileError.message)

    const selectedProgramId = profile?.selected_program_id ?? null
    const candidates = await candidateAssignmentsFor(db, {
      id: actor.id,
      positionId: profile?.position_id ?? null,
    })

    if (candidates.length === 0) return c.json({ ok: true as const, programs: [] }, 200)

    const { data: programs, error } = await db
      .from('programs')
      .select('id, name')
      .in('id', [...new Set(candidates.map((a) => a.programId))])
    if (error) throw new Error(error.message)

    const nameById = new Map((programs ?? []).map((p) => [p.id as string, p.name as string]))

    // Un programa puede tener más de un assignment al mismo jugador (directo y
    // por grupo). Se muestra una vez, con la fecha de la asignación más reciente.
    const latestByProgram = new Map<string, Date>()
    for (const candidate of candidates) {
      const seen = latestByProgram.get(candidate.programId)
      if (!seen || candidate.createdAt > seen) {
        latestByProgram.set(candidate.programId, candidate.createdAt)
      }
    }

    const rows = [...latestByProgram.entries()]
      .map(([programId, assignedAt]) => ({
        programId,
        name: nameById.get(programId) ?? 'Rutina',
        assignedAt: assignedAt.toISOString(),
      }))
      .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))

    // `current` refleja la MISMA regla que resolveProgram: la elección si sigue
    // entre las candidatas, si no la última asignada (la primera de la lista).
    const currentId =
      selectedProgramId && latestByProgram.has(selectedProgramId)
        ? selectedProgramId
        : (rows[0]?.programId ?? null)

    return c.json(
      {
        ok: true as const,
        programs: rows.map((r) => ({ ...r, current: r.programId === currentId })),
      },
      200,
    )
  },
)

playerPrograms.openapi(
  createRoute({
    method: 'put',
    path: '/player/programs/selected',
    summary: 'Elegir cuál de mis rutinas quiero mirar',
    request: {
      body: {
        content: {
          'application/json': {
            // null = volver al default ("la última asignada").
            schema: z.object({ programId: z.string().uuid().nullable() }),
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Elegida',
        content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } },
      },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const { programId } = c.req.valid('json')
    const db = c.get('db')

    if (programId) {
      // No se puede elegir una rutina que no te fue asignada. RLS ya negaría la
      // lectura, pero sin esto la fila quedaría apuntando a algo que el jugador
      // no puede leer y "Mi semana" degradaría en vez de dar un error claro.
      const { data: profile } = await db
        .from('profiles')
        .select('position_id')
        .eq('id', actor.id)
        .maybeSingle()

      const candidates = await candidateAssignmentsFor(db, {
        id: actor.id,
        positionId: profile?.position_id ?? null,
      })
      if (!candidates.some((a) => a.programId === programId)) {
        return c.json({ ok: false as const, error: 'Esa rutina no te fue asignada' }, 404)
      }
    }

    const { data, error } = await db
      .from('profiles')
      .update({ selected_program_id: programId })
      .eq('id', actor.id)
      .select('id')
      .maybeSingle()

    assertRow(data, error)
    return c.json({ ok: true as const }, 200)
  },
)
```

- [ ] **Step 2: Montar la ruta**

En `packages/api/src/app.ts`, agregar el import junto a los otros de player:

```ts
import { playerPrograms } from './routes/player/programs'
```

y el `route` junto a los otros:

```ts
app.route('/', playerPrograms)
```

> No hace falta guard propio: `/player/*` ya lleva `requireRole(['PLAYER'])` montado en el prefijo
> (CLAUDE.md §4, capa 2). La ruta nace protegida.

- [ ] **Step 3: Test de scoping**

`packages/api/src/routes/player/programs.test.ts` — seguí el patrón de
`packages/api/src/routes/player/week.test.ts` para el arranque de la app y los headers. Los casos:

```ts
it('elegir una rutina que no me fue asignada da 404', async () => {
  const res = await app.request('/api/player/programs/selected', {
    method: 'PUT',
    headers: authHeaders(playerToken),
    body: JSON.stringify({ programId: otroProgramaId }),
  })
  expect(res.status).toBe(404)
})

it('programId null vuelve al default', async () => {
  const res = await app.request('/api/player/programs/selected', {
    method: 'PUT',
    headers: authHeaders(playerToken),
    body: JSON.stringify({ programId: null }),
  })
  expect(res.status).toBe(200)
})

it('un coach no puede usar la ruta del jugador', async () => {
  const res = await app.request('/api/player/programs', { headers: authHeaders(coachToken) })
  expect(res.status).toBe(401)
})
```

- [ ] **Step 4: Correr**

Run: `pnpm --filter @coachlab/api test programs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes/player/programs.ts packages/api/src/routes/player/programs.test.ts packages/api/src/app.ts
git commit -m "feat(api): let the player switch between their assigned routines"
```

---

### Task 9: `playerWeekFor` respeta la elección

**Files:**
- Modify: `packages/api/src/access/playerWeek.ts`
- Modify: `packages/api/src/routes/player/week.ts`

- [ ] **Step 1: Pasar la elección**

En `packages/api/src/access/playerWeek.ts`, la firma acepta la elección y se la pasa a
`activeProgramIdFor`:

```ts
export async function playerWeekFor(
  db: SupabaseClient<Database>,
  player: { id: string; positionId: string | null; selectedProgramId?: string | null },
): Promise<PlayerWeek | null> {
  const programId = await activeProgramIdFor(db, player)
  if (!programId) return null
```

- [ ] **Step 2: Cargar la columna en la ruta**

En `packages/api/src/routes/player/week.ts` y en cualquier otro llamador (`grep -rn "playerWeekFor"
packages/api/src`), el select del perfil tiene que traer `selected_program_id` y pasarlo:

```ts
      .select('id, position_id, selected_program_id')
```

```ts
    const week = await playerWeekFor(db, {
      id: actor.id,
      positionId: profile.position_id,
      selectedProgramId: profile.selected_program_id,
    })
```

Hacer lo mismo en `packages/api/src/routes/player/dashboard.ts` si también resuelve el programa.

- [ ] **Step 3: Correr los tests del jugador**

Run: `pnpm --filter @coachlab/api test player`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/access/playerWeek.ts packages/api/src/routes/player/
git commit -m "feat(api): show the routine the player chose in their week"
```

---

### Task 10: La UI de F4-B

**Files:**
- Modify: `packages/web/app/pages/coach/programs/[programId]/assign.vue`
- Modify: `packages/web/app/pages/player/week/index.vue`
- Modify: `packages/web/nuxt.config.ts`

- [ ] **Step 1: Regenerar el cliente tipado**

Run: `pnpm dump:openapi && pnpm --filter @coachlab/web generate:api`
Expected: `packages/web/generated/` se regenera con los tipos nuevos (assignments sin `priority`,
`/player/programs`, `/coach/feedback`).

`packages/web/generated/` y `packages/core/src/types/database.ts` **se regeneran, no se editan**
(CLAUDE.md §5).

- [ ] **Step 2: `assign.vue`**

Tres cambios:

1. **Sacar el campo "Prioridad extra"** entero, con su label y su hint. De paso se va el bug conocido
   de que label y hint se pegaban y se leía "Prioridad extrabase 100".
2. **Sacar "Puesto" del selector de destino.** Quedan Jugador / Grupo del sistema / Grupo custom. En el
   texto de ayuda, explicar el reemplazo: *"¿Querés asignar por puesto? Creá un grupo con ese puesto
   solo."*
3. **La tabla de impacto** deja de decir "prioridad" y pasa a marcar cuándo el jugador está mirando otra
   rutina. Agregar una columna o un badge:

```vue
<UBadge v-if="row.programId !== row.assignedProgramId" color="warning" variant="subtle">
  Eligió otra
</UBadge>
```

> Sin esta marca, C1 es peligrosa: el coach creería que todos ven lo último que asignó. Con la marca es
> auditable (F4-B §2.4). Requiere que el preview devuelva también `assignedProgramId` — agregalo en la
> Task 7, Step 1.5, devolviendo `resolveProgram(candidates, null)?.programId` además del resuelto.

- [ ] **Step 3: El selector en `week/index.vue`**

Sólo se muestra **si hay más de una rutina**. Con una sola, un selector de un elemento es ruido.

```vue
<USelect
  v-if="programs.length > 1"
  v-model="selected"
  :items="programs.map((p) => ({ label: p.name, value: p.programId }))"
  @update:model-value="onSelect"
/>
<p v-if="programs.length > 1" class="text-sm text-muted">
  Tu entrenador puede cambiarte la rutina en cualquier momento.
</p>
```

`onSelect` hace el `PUT /player/programs/selected` y recarga la semana.

- [ ] **Step 4: El ícono**

Si agregaste algún ícono nuevo, va **también** a la lista de `packages/web/nuxt.config.ts`, o
`tests/icons.test.ts` falla. Falla en los dos sentidos: un ícono que se deja de usar también hay que
sacarlo.

- [ ] **Step 5: Verificar**

Run: `pnpm --filter @coachlab/web test && pnpm --filter @coachlab/web lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): drop priority and let the player switch routines"
```

---

# PARTE B — La vista de feedback

---

### Task 11: `rpeDelta`, `dayTargetRpe` y `summarizeRpe`

**Files:**
- Create: `packages/core/src/domain/rpeDelta.ts`
- Test: `packages/core/src/domain/rpeDelta.test.ts`

> El handoff dice que este archivo ya existe y está testeado. **No existe.** El spec de F3 tiene razón:
> "`rpeDelta` se escribe en F4, donde se usa".

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { describe, expect, it } from 'vitest'
import { dayTargetRpe, rpeDelta, summarizeRpe } from './rpeDelta'

describe('dayTargetRpe', () => {
  it('promedia los target del dia', () => {
    expect(dayTargetRpe([8, 8, 8])).toBe(8)
  })

  it('ignora los ejercicios sin target', () => {
    expect(dayTargetRpe([8, null, 6, null])).toBe(7)
  })

  it('redondea a un decimal para no mostrar 7.333333', () => {
    expect(dayTargetRpe([7, 7, 8])).toBe(7.3)
  })

  it('sin ningun target el dia no tiene objetivo', () => {
    // Caso real: target_rpe es nullable y las planillas del club lo dejan vacio.
    expect(dayTargetRpe([null, null])).toBeNull()
  })

  it('con lista vacia no rompe', () => {
    expect(dayTargetRpe([])).toBeNull()
  })
})

describe('rpeDelta', () => {
  it('en el objetivo devuelve severidad ok', () => {
    expect(rpeDelta(8, 8)).toEqual({ delta: 0, severity: 'ok', label: 'En el objetivo' })
  })

  it('1 punto de diferencia sigue siendo ok', () => {
    expect(rpeDelta(8, 9).severity).toBe('ok')
    expect(rpeDelta(8, 7).severity).toBe('ok')
  })

  it('2 puntos por encima avisa que la carga quedo pesada', () => {
    const result = rpeDelta(7, 9)
    expect(result.delta).toBe(2)
    expect(result.severity).toBe('heavy')
    expect(result.label).toBe('2 puntos más pesado de lo pedido')
  })

  it('2 puntos por debajo avisa que quedo liviana', () => {
    const result = rpeDelta(9, 7)
    expect(result.delta).toBe(-2)
    expect(result.severity).toBe('light')
    expect(result.label).toBe('2 puntos más liviano de lo pedido')
  })

  it('un solo punto de diferencia se escribe en singular', () => {
    expect(rpeDelta(6, 9).label).toBe('3 puntos más pesado de lo pedido')
    expect(rpeDelta(7.5, 10).label).toBe('2.5 puntos más pesado de lo pedido')
  })

  it('sin RPE objetivo no compara', () => {
    expect(rpeDelta(null, 8)).toEqual({ delta: null, severity: 'unknown', label: 'Sin objetivo' })
  })

  it('sin RPE percibido no compara', () => {
    expect(rpeDelta(8, null)).toEqual({ delta: null, severity: 'unknown', label: 'Sin registrar' })
  })

  it('un objetivo promediado con decimales no rompe la comparacion', () => {
    const result = rpeDelta(7.3, 10)
    expect(result.severity).toBe('heavy')
    expect(result.delta).toBe(2.7)
  })
})

describe('summarizeRpe', () => {
  it('promedia solo los dias comparables', () => {
    const summary = summarizeRpe([
      { targetRpe: 8, perceivedRpe: 9 },
      { targetRpe: 8, perceivedRpe: 10 },
      { targetRpe: null, perceivedRpe: 7 },
      { targetRpe: 8, perceivedRpe: null },
    ])
    expect(summary.comparable).toBe(2)
    expect(summary.averageDelta).toBe(1.5)
  })

  it('cuenta cuantos se fueron para arriba y para abajo', () => {
    const summary = summarizeRpe([
      { targetRpe: 7, perceivedRpe: 9 },
      { targetRpe: 7, perceivedRpe: 10 },
      { targetRpe: 9, perceivedRpe: 7 },
      { targetRpe: 8, perceivedRpe: 8 },
    ])
    expect(summary.heavy).toBe(2)
    expect(summary.light).toBe(1)
    expect(summary.ok).toBe(1)
  })

  it('sin pares comparables devuelve averageDelta null', () => {
    expect(summarizeRpe([{ targetRpe: null, perceivedRpe: null }]).averageDelta).toBeNull()
  })

  it('con lista vacia no rompe', () => {
    expect(summarizeRpe([])).toEqual({
      comparable: 0,
      averageDelta: null,
      ok: 0,
      heavy: 0,
      light: 0,
    })
  })
})
```

- [ ] **Step 2: Correr para ver que falla**

Run: `pnpm --filter @coachlab/core test rpeDelta`
Expected: FAIL — "Failed to resolve import ./rpeDelta".

- [ ] **Step 3: Implementar**

`packages/core/src/domain/rpeDelta.ts`:

```ts
export type RpeSeverity = 'ok' | 'heavy' | 'light' | 'unknown'

export type RpeComparison = {
  /** percibido - objetivo. Positivo = costó más de lo pedido. */
  delta: number | null
  severity: RpeSeverity
  label: string
}

/** ±1 punto es ruido de percepción; a partir de 2 el coach debería mirar la carga. */
const TOLERANCE = 1

/** Un decimal alcanza: "7.3" se lee, "7.333333" no. */
const round1 = (n: number): number => Math.round(n * 10) / 10

/**
 * El objetivo del día: el promedio de los target_rpe no nulos de sus ejercicios.
 *
 * Desde F3.5 el jugador da UN RPE percibido por día, no uno por ejercicio
 * (CLAUDE.md §1), así que hay que reducir los N objetivos del día a uno solo.
 * El promedio es la lectura natural de "el RPE del día contra los target_rpe del
 * día" (CLAUDE.md §6) y degrada bien cuando sólo algunos ejercicios tienen
 * target. Las alternativas descartadas están en el spec §3.
 */
export function dayTargetRpe(targets: readonly (number | null)[]): number | null {
  const known = targets.filter((t): t is number => t != null)
  if (known.length === 0) return null
  return round1(known.reduce((sum, t) => sum + t, 0) / known.length)
}

export function rpeDelta(
  targetRpe: number | null,
  perceivedRpe: number | null,
): RpeComparison {
  if (targetRpe == null) return { delta: null, severity: 'unknown', label: 'Sin objetivo' }
  if (perceivedRpe == null) return { delta: null, severity: 'unknown', label: 'Sin registrar' }

  const delta = round1(perceivedRpe - targetRpe)
  if (Math.abs(delta) <= TOLERANCE) return { delta, severity: 'ok', label: 'En el objetivo' }

  const magnitude = round1(Math.abs(delta))
  const direction = delta > 0 ? 'pesado' : 'liviano'
  return {
    delta,
    severity: delta > 0 ? 'heavy' : 'light',
    label: `${magnitude} puntos más ${direction} de lo pedido`,
  }
}

export type RpePair = { targetRpe: number | null; perceivedRpe: number | null }

export type RpeSummary = {
  comparable: number
  averageDelta: number | null
  ok: number
  heavy: number
  light: number
}

/**
 * Agrega DÍAS, no ejercicios: un par comparable por día cerrado.
 *
 * El plan viejo de F4 agregaba pares por ejercicio, cuando el RPE percibido se
 * pedía una vez por ejercicio. F3.5 lo movió a una pregunta por día y esta
 * función cambió de unidad, no de forma.
 */
export function summarizeRpe(pairs: readonly RpePair[]): RpeSummary {
  const summary: RpeSummary = { comparable: 0, averageDelta: null, ok: 0, heavy: 0, light: 0 }
  let total = 0

  for (const pair of pairs) {
    const comparison = rpeDelta(pair.targetRpe, pair.perceivedRpe)
    if (comparison.delta === null) continue

    summary.comparable += 1
    total += comparison.delta
    if (comparison.severity === 'heavy') summary.heavy += 1
    else if (comparison.severity === 'light') summary.light += 1
    else summary.ok += 1
  }

  if (summary.comparable > 0) summary.averageDelta = round1(total / summary.comparable)

  return summary
}
```

- [ ] **Step 4: Correr para ver que pasa**

Run: `pnpm --filter @coachlab/core test rpeDelta`
Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/rpeDelta.ts packages/core/src/domain/rpeDelta.test.ts
git commit -m "feat(domain): compare the day's perceived rpe against its targets"
```

---

### Task 12: La agregación del feedback

**Files:**
- Create: `packages/api/src/access/coachFeedback.ts`

- [ ] **Step 1: El helper**

`packages/api/src/access/coachFeedback.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@coachlab/core/types/database'
import {
  dayTargetRpe,
  rpeDelta,
  summarizeRpe,
  type RpeComparison,
  type RpeSummary,
} from '@coachlab/core/domain/rpeDelta'
import { sortByOrderIndex } from '@coachlab/core/domain/tree'
import { weekProgress } from '@coachlab/core/domain/weekProgress'
import { activeProgramIdFor } from './assignments'

export type FeedbackExercise = {
  blockExerciseId: string
  exerciseName: string
  sets: number | null
  reps: string | null
  targetRpe: number | null
  weight: number | null
  loggedReps: number | null
}

export type FeedbackDay = {
  dayId: string
  dayName: string
  completedAt: string | null
  targetRpe: number | null
  perceivedRpe: number | null
  comparison: RpeComparison
  note: string | null
  exercises: FeedbackExercise[]
}

export type PlayerFeedback = {
  playerId: string
  playerName: string
  positionId: string | null
  programName: string | null
  weekName: string | null
  daysDone: number
  daysTotal: number
  rpe: RpeSummary
  lastNote: { dayName: string; note: string } | null
}

export type PlayerFeedbackDetail = PlayerFeedback & { days: FeedbackDay[] }

type PlayerRow = {
  id: string
  name: string
  position_id: string | null
  selected_program_id: string | null
}

/**
 * El plantel del coach con su progreso de la semana.
 *
 * Todas las queries van con el cliente creado de la sesión del coach: RLS es la
 * que garantiza que no vea plantel ajeno. NUNCA service_role (CLAUDE.md §4).
 *
 * Resolver el programa por jugador en un loop es aceptable a 40–60 jugadores:
 * son queries por índice, no scans (CLAUDE.md §2). Si un plantel pasa de 100, lo
 * primero es cachear por grupo dentro del request, ANTES de tocar otra cosa.
 */
export async function coachFeedbackFor(
  db: SupabaseClient<Database>,
  coachId: string,
): Promise<PlayerFeedback[]> {
  const { data, error } = await db
    .from('profiles')
    .select('id, name, position_id, selected_program_id')
    .eq('coach_id', coachId)
    .eq('role', 'PLAYER')
    .order('name')
  if (error) throw new Error(error.message)

  const players = (data ?? []) as PlayerRow[]

  return Promise.all(
    players.map(async (player) => {
      const detail = await feedbackForPlayer(db, player)
      // El listado no manda los días enteros por la red: son N jugadores × M días
      // × sus ejercicios, y esta pantalla sólo muestra el resumen.
      const { days: _days, ...summary } = detail
      return summary
    }),
  )
}

/** El detalle de un jugador. El scoping (404) lo resuelve la ruta, no esto. */
export async function playerFeedbackFor(
  db: SupabaseClient<Database>,
  player: PlayerRow,
): Promise<PlayerFeedbackDetail> {
  return feedbackForPlayer(db, player)
}

async function feedbackForPlayer(
  db: SupabaseClient<Database>,
  player: PlayerRow,
): Promise<PlayerFeedbackDetail> {
  const empty: PlayerFeedbackDetail = {
    playerId: player.id,
    playerName: player.name,
    positionId: player.position_id,
    programName: null,
    weekName: null,
    daysDone: 0,
    daysTotal: 0,
    rpe: summarizeRpe([]),
    lastNote: null,
    days: [],
  }

  const programId = await activeProgramIdFor(db, {
    id: player.id,
    positionId: player.position_id,
    selectedProgramId: player.selected_program_id,
  })
  // Un jugador sin programa asignado aparece igual, con 0/0. No desaparece del
  // listado ni tira 500: el coach necesita ver justamente a ese.
  if (!programId) return empty

  const { data: program, error: programError } = await db
    .from('programs')
    .select('id, name, current_week_id, weeks!weeks_program_id_fkey(id, name, order_index)')
    .eq('id', programId)
    .maybeSingle()
  if (programError) throw new Error(programError.message)
  if (!program) return empty

  const weeks = sortByOrderIndex(program.weeks ?? [])
  const week = weeks.find((w) => w.id === program.current_week_id) ?? weeks[0]
  if (!week) return { ...empty, programName: program.name }

  const { data: dayRows, error: daysError } = await db
    .from('days')
    .select(
      `id, name, order_index,
       blocks (
         order_index,
         block_exercises (
           id, sets, reps, target_rpe, order_index,
           exercises ( name )
         )
       )`,
    )
    .eq('week_id', week.id)
  if (daysError) throw new Error(daysError.message)

  const days = sortByOrderIndex(dayRows ?? [])
  const dayIds = days.map((d) => d.id as string)

  const { data: logRows, error: logsError } = await db
    .from('session_logs')
    .select('id, day_id, note, perceived_rpe, completed_at')
    .eq('player_id', player.id)
    .in('day_id', dayIds.length > 0 ? dayIds : ['00000000-0000-0000-0000-000000000000'])
  if (logsError) throw new Error(logsError.message)

  const logs = logRows ?? []
  const logByDay = new Map(logs.map((l) => [l.day_id as string, l]))

  const { data: entryRows, error: entriesError } =
    logs.length > 0
      ? await db
          .from('exercise_entries')
          .select('session_log_id, block_exercise_id, weight, reps')
          .in(
            'session_log_id',
            logs.map((l) => l.id as string),
          )
      : { data: [], error: null }
  if (entriesError) throw new Error(entriesError.message)

  const entryByKey = new Map(
    (entryRows ?? []).map((e) => [`${e.session_log_id}:${e.block_exercise_id}`, e]),
  )

  const feedbackDays: FeedbackDay[] = days.map((day) => {
    const log = logByDay.get(day.id as string) ?? null

    const exercises: FeedbackExercise[] = sortByOrderIndex(day.blocks ?? []).flatMap((block) =>
      sortByOrderIndex(block.block_exercises ?? []).map((be) => {
        const entry = log ? entryByKey.get(`${log.id}:${be.id}`) : undefined
        return {
          blockExerciseId: be.id as string,
          exerciseName: be.exercises?.name ?? 'Ejercicio',
          sets: be.sets,
          reps: be.reps,
          targetRpe: be.target_rpe,
          weight: entry?.weight ?? null,
          loggedReps: entry?.reps ?? null,
        }
      }),
    )

    const targetRpe = dayTargetRpe(exercises.map((e) => e.targetRpe))
    const perceivedRpe = log?.perceived_rpe ?? null

    return {
      dayId: day.id as string,
      dayName: day.name as string,
      completedAt: log?.completed_at ?? null,
      targetRpe,
      perceivedRpe,
      comparison: rpeDelta(targetRpe, perceivedRpe),
      note: log?.note ?? null,
      exercises,
    }
  })

  const completedDayIds = logs
    .filter((l) => l.completed_at !== null)
    .map((l) => l.day_id as string)
  const progress = weekProgress(completedDayIds, days.length)

  // Sólo los días CERRADOS entran al resumen: un día a medio registrar todavía
  // no afirma nada sobre cuánto costó.
  const closed = feedbackDays.filter((d) => d.completedAt !== null)

  const lastClosed = [...closed]
    .filter((d) => d.note !== null && d.note.trim() !== '')
    .sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? ''))
    .pop()

  return {
    playerId: player.id,
    playerName: player.name,
    positionId: player.position_id,
    programName: program.name,
    weekName: week.name,
    daysDone: progress.completed,
    daysTotal: progress.total,
    rpe: summarizeRpe(
      closed.map((d) => ({ targetRpe: d.targetRpe, perceivedRpe: d.perceivedRpe })),
    ),
    lastNote: lastClosed ? { dayName: lastClosed.dayName, note: lastClosed.note! } : null,
    days: feedbackDays,
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @coachlab/api typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/access/coachFeedback.ts
git commit -m "feat(api): aggregate the squad feedback for the coach"
```

---

### Task 13: Las rutas de feedback

**Files:**
- Create: `packages/api/src/routes/coach/feedback.ts`
- Create: `packages/api/src/routes/coach/feedback.test.ts`
- Modify: `packages/api/src/app.ts`

- [ ] **Step 1: La ruta**

`packages/api/src/routes/coach/feedback.ts`:

```ts
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { coachFeedbackFor, playerFeedbackFor } from '../../access/coachFeedback'
import type { AuthVariables } from '../../middleware/auth'
import { ErrorResponse } from '../schemas'
import { assertRow } from './_scope'

const RpeSummary = z.object({
  comparable: z.number(),
  averageDelta: z.number().nullable(),
  ok: z.number(),
  heavy: z.number(),
  light: z.number(),
})

const RpeComparison = z.object({
  delta: z.number().nullable(),
  severity: z.enum(['ok', 'heavy', 'light', 'unknown']),
  label: z.string(),
})

const PlayerFeedback = z
  .object({
    playerId: z.string().uuid(),
    playerName: z.string(),
    positionId: z.string().nullable(),
    programName: z.string().nullable(),
    weekName: z.string().nullable(),
    daysDone: z.number(),
    daysTotal: z.number(),
    rpe: RpeSummary,
    lastNote: z.object({ dayName: z.string(), note: z.string() }).nullable(),
  })
  .openapi('PlayerFeedback')

const FeedbackExercise = z.object({
  blockExerciseId: z.string().uuid(),
  exerciseName: z.string(),
  sets: z.number().nullable(),
  reps: z.string().nullable(),
  targetRpe: z.number().nullable(),
  weight: z.number().nullable(),
  loggedReps: z.number().nullable(),
})

const FeedbackDay = z.object({
  dayId: z.string().uuid(),
  dayName: z.string(),
  completedAt: z.string().nullable(),
  targetRpe: z.number().nullable(),
  perceivedRpe: z.number().nullable(),
  comparison: RpeComparison,
  note: z.string().nullable(),
  exercises: z.array(FeedbackExercise),
})

const FeedbackListResponse = z
  .object({ ok: z.literal(true), players: z.array(PlayerFeedback) })
  .openapi('FeedbackListResponse')

const FeedbackDetailResponse = z
  .object({ ok: z.literal(true), player: PlayerFeedback.extend({ days: z.array(FeedbackDay) }) })
  .openapi('FeedbackDetailResponse')

const errors = {
  401: {
    description: 'Sin sesión o rol equivocado',
    content: { 'application/json': { schema: ErrorResponse } },
  },
  404: {
    description: 'No existe o no es tuyo',
    content: { 'application/json': { schema: ErrorResponse } },
  },
}

export const feedback = new OpenAPIHono<{ Variables: AuthVariables }>()

feedback.openapi(
  createRoute({
    method: 'get',
    path: '/coach/feedback',
    summary: 'Cómo viene el plantel esta semana',
    responses: {
      200: {
        description: 'El plantel con su progreso',
        content: { 'application/json': { schema: FeedbackListResponse } },
      },
      401: errors[401],
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const players = await coachFeedbackFor(c.get('db'), actor.id)
    return c.json({ ok: true as const, players }, 200)
  },
)

feedback.openapi(
  createRoute({
    method: 'get',
    path: '/coach/feedback/{playerId}',
    summary: 'El detalle de un jugador, día por día',
    request: {
      params: z.object({
        playerId: z.string().uuid().openapi({ param: { name: 'playerId', in: 'path' } }),
      }),
    },
    responses: {
      200: {
        description: 'El detalle',
        content: { 'application/json': { schema: FeedbackDetailResponse } },
      },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const { playerId } = c.req.valid('param')
    const db = c.get('db')

    // El scoping va acá y no en el helper: un jugador de otro coach tiene que dar
    // 404 y no una lista vacía (CLAUDE.md §4, capa 4 — no revelar existencia).
    // RLS ya lo bloquearía; esto le da el status correcto.
    const { data, error } = await db
      .from('profiles')
      .select('id, name, position_id, selected_program_id')
      .eq('id', playerId)
      .eq('coach_id', actor.id)
      .eq('role', 'PLAYER')
      .maybeSingle()

    const player = assertRow(data, error)
    const detail = await playerFeedbackFor(db, player)
    return c.json({ ok: true as const, player: detail }, 200)
  },
)
```

- [ ] **Step 2: Montarla**

En `packages/api/src/app.ts`:

```ts
import { feedback } from './routes/coach/feedback'
```

```ts
app.route('/', feedback)
```

> Nace protegida: `/coach/*` ya lleva `requireRole(['COACH','ADMIN'])` en el prefijo.

- [ ] **Step 3: Los tests de scoping**

`packages/api/src/routes/coach/feedback.test.ts` — copiá el arranque de
`packages/api/src/routes/coach/players.test.ts` (mismo patrón de dos coaches con un jugador cada uno):

```ts
it('el detalle de un jugador de otro coach da 404, no 403', async () => {
  const res = await app.request(`/api/coach/feedback/${jugadorDelOtroCoach}`, {
    headers: authHeaders(coachAToken),
  })
  // 404 y no 403: un 403 confirmaria que ese jugador existe.
  expect(res.status).toBe(404)
})

it('el detalle de un playerId inexistente da el MISMO 404', async () => {
  const res = await app.request(`/api/coach/feedback/${crypto.randomUUID()}`, {
    headers: authHeaders(coachAToken),
  })
  expect(res.status).toBe(404)
})

it('el listado solo trae el plantel propio', async () => {
  const res = await app.request('/api/coach/feedback', { headers: authHeaders(coachAToken) })
  const body = await res.json()
  expect(res.status).toBe(200)
  expect(body.players.map((p) => p.playerId)).not.toContain(jugadorDelOtroCoach)
})

it('un jugador no puede leer el feedback', async () => {
  const res = await app.request('/api/coach/feedback', { headers: authHeaders(playerToken) })
  expect(res.status).toBe(401)
})

it('un jugador sin programa aparece con 0/0 y sin romper', async () => {
  const res = await app.request('/api/coach/feedback', { headers: authHeaders(coachSinProgramas) })
  const body = await res.json()
  expect(res.status).toBe(200)
  expect(body.players[0].daysTotal).toBe(0)
  expect(body.players[0].rpe.comparable).toBe(0)
})
```

- [ ] **Step 4: Correr**

Run: `pnpm --filter @coachlab/api test feedback`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routes/coach/feedback.ts packages/api/src/routes/coach/feedback.test.ts packages/api/src/app.ts
git commit -m "feat(api): add the coach feedback endpoints with scoping"
```

---

### Task 14: `RpeBadge.vue`

**Files:**
- Create: `packages/web/app/components/RpeBadge.vue`

- [ ] **Step 1: El componente**

```vue
<script setup lang="ts">
import { rpeDelta } from '@coachlab/core/domain/rpeDelta'

const props = defineProps<{
  targetRpe: number | null
  perceivedRpe: number | null
}>()

const comparison = computed(() => rpeDelta(props.targetRpe, props.perceivedRpe))

// `pitch` es el verde botella que estrenó F4-A para success; warning quedó en
// dorado y ya no comparte clubred con primary (docs/DESIGN-SYSTEM.md §3.6).
const COLOR = {
  ok: 'success',
  heavy: 'error',
  light: 'info',
  unknown: 'neutral',
} as const
</script>

<template>
  <UBadge
    :color="COLOR[comparison.severity]"
    variant="subtle"
    :title="comparison.label"
  >
    <!--
      El color NO es la única señal: el texto siempre dice los dos números, para
      que el badge sirva con daltonismo y en una captura en blanco y negro.
    -->
    <template v-if="targetRpe !== null && perceivedRpe !== null">
      {{ targetRpe }} → {{ perceivedRpe }}
    </template>
    <template v-else>
      {{ comparison.label }}
    </template>
  </UBadge>
</template>
```

- [ ] **Step 2: Verificar que `info` existe en la paleta**

Run: `grep -n "info\|success\|pitch" packages/web/app/app.config.ts`
Expected: aparecen `success` y los demás alias. Si `info` no está definido, usá `'primary'` para
`light` y anotalo.

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/components/RpeBadge.vue
git commit -m "feat(ui): add the rpe comparison badge"
```

---

### Task 15: El listado del plantel

**Files:**
- Create: `packages/web/app/pages/coach/feedback/index.vue`
- Modify: `packages/web/app/components/AppSidebar.vue`
- Modify: `packages/web/nuxt.config.ts`

- [ ] **Step 1: La página**

`packages/web/app/pages/coach/feedback/index.vue`. Estructura, siguiendo el patrón de
`pages/coach/players/index.vue` (mirá cómo hace el fetch, el estado de carga y el de error de red):

- Encabezado: "Cómo viene el plantel" + el nombre de la semana vigente.
- **Estado vacío** si no hay jugadores: "Todavía no tenés jugadores en el plantel" con un link a
  `/coach/players`.
- **Estado de error de red** con botón de reintentar, como las otras tres pantallas que ya lo tienen.
- Tabla en `sm:` y arriba; **cards en mobile**. Una tabla de 6 columnas a 380 px no se lee.

Columnas: Jugador (link a `/coach/feedback/{playerId}`), Puesto, Semana, **Días** (`2/3`), **RPE**, y
Última nota truncada.

La celda de RPE:

```vue
<span v-if="player.rpe.comparable === 0" class="text-muted">Sin datos</span>
<span v-else>
  {{ player.rpe.averageDelta! > 0 ? '+' : '' }}{{ player.rpe.averageDelta }} promedio
  <template v-if="player.rpe.heavy > 0"> · {{ player.rpe.heavy }} pesados</template>
  <template v-if="player.rpe.light > 0"> · {{ player.rpe.light }} livianos</template>
</span>
```

- [ ] **Step 2: El ítem del sidebar**

En `packages/web/app/components/AppSidebar.vue`, **primero** en `NAV.COACH`:

```ts
  COACH: [
    { to: '/coach/feedback', label: 'Cómo viene el plantel', icon: 'i-lucide-activity' },
    { to: '/coach/players', label: 'Plantel', icon: 'i-lucide-users' },
    { to: '/coach/groups', label: 'Grupos', icon: 'i-lucide-layout-grid' },
    { to: '/coach/programs', label: 'Programas', icon: 'i-lucide-clipboard-list' },
  ],
```

Va primero porque es la pantalla a la que el coach entra a **mirar**, no a editar.

- [ ] **Step 3: El ícono en `nuxt.config.ts`**

`lucide:activity` **no está** en la lista. Sin esto el ícono sale a buscarse por red y el sidebar queda
sin ícono con un "timed out after 1500ms". Agregar en orden alfabético, antes de `lucide:calendar-days`:

```ts
        'lucide:activity',
```

- [ ] **Step 4: Correr**

Run: `pnpm --filter @coachlab/web test`
Expected: PASS — en particular `tests/icons.test.ts`, que falla en los dos sentidos.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ui): add the squad feedback list"
```

---

### Task 16: El detalle por jugador

**Files:**
- Create: `packages/web/app/pages/coach/feedback/[playerId].vue`

> **Regla de nombres de Nuxt** (CLAUDE.md §5): esta página y `index.vue` van como **hermanas** dentro
> de `feedback/`. Si existiera un `feedback.vue` al lado del directorio, pasaría a ser el padre y este
> detalle **no renderizaría** hasta que el padre incluyera `<NuxtPage />`. No lo crees.

- [ ] **Step 1: La página**

Encabezado con el nombre del jugador, su puesto, el programa y la semana, más el `2/3` general.

Por cada día:

```vue
<UCard v-for="day in player.days" :key="day.dayId">
  <template #header>
    <div class="flex items-center justify-between gap-2">
      <div>
        <h3 class="font-medium">{{ day.dayName }}</h3>
        <p class="text-sm text-muted">
          {{ day.completedAt ? `Cerrado el ${formatDate(day.completedAt)}` : 'Sin cerrar' }}
        </p>
      </div>
      <!-- El badge va UNA vez por día: desde F3.5 el RPE percibido es del día,
           no del ejercicio, así que no hay con qué comparar fila por fila. -->
      <RpeBadge :target-rpe="day.targetRpe" :perceived-rpe="day.perceivedRpe" />
    </div>
  </template>

  <!-- La nota es la mitad del valor de esta pantalla: el RPE dice cuánto costó,
       la nota dice por qué. -->
  <UAlert
    v-if="day.note"
    icon="i-lucide-message-square-plus"
    color="neutral"
    variant="subtle"
    :description="day.note"
    class="mb-4"
  />

  <table class="w-full text-sm">
    <thead>
      <tr class="text-left text-muted">
        <th class="py-1">Ejercicio</th>
        <th class="py-1">Planificado</th>
        <th class="py-1">Hecho</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="ex in day.exercises" :key="ex.blockExerciseId" class="border-t border-default">
        <td class="py-1">{{ ex.exerciseName }}</td>
        <td class="py-1">
          {{ ex.sets ?? '—' }} × {{ ex.reps ?? '—' }}
          <span v-if="ex.targetRpe !== null" class="text-muted">· RPE {{ ex.targetRpe }}</span>
        </td>
        <td class="py-1">
          <template v-if="ex.weight !== null || ex.loggedReps !== null">
            {{ ex.weight ?? '—' }} kg · {{ ex.loggedReps ?? '—' }} reps
          </template>
          <span v-else class="text-muted">Sin registrar</span>
        </td>
      </tr>
    </tbody>
  </table>
</UCard>
```

Estado vacío si `player.days` está vacío: "Este jugador todavía no tiene una rutina asignada" con link
a `/coach/programs`.

- [ ] **Step 2: Probar a mano**

Con el día que ya está completado por la cuenta `@coachlab.test`:

1. `/coach/feedback` → el jugador aparece con su `1/1` y la nota.
2. Click en el nombre → el detalle muestra el día con su nota y el badge.

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/pages/coach/feedback/
git commit -m "feat(ui): add the per-player feedback detail"
```

---

### Task 17: Cierre — gates, auditoría y documentación

- [ ] **Step 1: Los tres gates**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: los tres en 0. Tardan ~10 minutos en total; presupuestá el tiempo.

- [ ] **Step 2: Confirmar que el typecheck es real**

`vue-tsc` tiene historial de **salir con código 0 estando roto** en este repo. Antes de confiar en un
verde, inyectá un error de tipos en un `.vue` que hayas tocado:

```ts
const roto: number = 'no soy un number'
```

Run: `pnpm typecheck`
Expected: **exit 2**. Sacá el error y volvé a correr para confirmar el 0.

- [ ] **Step 3: Verificar RLS con sesión real** ← *lo más riesgoso de toda la rama*

Es el punto 1 de la verificación del spec de F4-B: `0019` reescribe `program_reaches_me()`, que es
`security definer` y **la usan las políticas de RLS**. Si quedó mal, la capa 1 de `CLAUDE.md` §4 se
rompe en silencio y ningún test de dominio se entera.

Run: `pnpm verify:setup`
Expected: 85/85 o más (el baseline de F3.5). Cualquier caída acá es la migración, no el código.

Run: `pnpm smoke:player`
Expected: 32/32 o más. Cubre el "80% → 112 kg" y la lectura del programa del jugador **con RLS puesta**,
que es justo lo que toca `program_reaches_me()`.

> Estos dos scripts sí usan `service_role`, y está bien: son scripts de administración corridos a mano,
> uno de los tres casos que `CLAUDE.md` §4 permite. Lo prohibido es la `service_role` en un request de
> usuario.

Al assertar sobre fallas de la base, **hacelo por código de error**: `42501` es política de RLS y
`23514` es violación de `CHECK`. Desde afuera son indistinguibles y significan lo opuesto.

- [ ] **Step 4: `rbac-auditor`**

Dispatch el agente `rbac-auditor` sobre `packages/api/src/routes/coach/feedback.ts`,
`packages/api/src/routes/player/programs.ts` y `packages/api/src/access/`. Es lo que pide el handoff:
son rutas nuevas que tocan datos de jugador.

Expected: sin hallazgos de severidad alta. Si aparece alguno, arreglalo antes de seguir.

- [ ] **Step 5: `code-reviewer`**

Dispatch `code-reviewer` sobre el diff completo de la rama contra `develop`.

- [ ] **Step 6: Actualizar `CLAUDE.md`**

Tres lugares, en este mismo commit (la regla de §5: si cambia una decisión de §2 o §3, se actualiza en
el mismo PR):

1. **§3, "Reglas de negocio críticas"** — reemplazar la resolución por prioridad de 4 niveles por:

```markdown
**Resolución del programa activo de un jugador:** **gana la última asignada** (el `created_at` más
reciente entre los assignments que lo alcanzan). Los destinos son tres: un jugador, un grupo system
(Forwards/Backs) y un grupo custom. Si el jugador eligió otra de sus rutinas
(`profiles.selected_program_id`), gana esa — pero **sólo mientras ese programa siga alcanzándolo**, y
la elección se resetea sola cuando el coach asigna algo nuevo. La regla vive en
`packages/core/src/domain/resolveProgram.ts`. Ver `docs/superpowers/specs/2026-07-31-f4b-assignment-model-design.md`.
```

2. **§3, la tabla de tablas** — `program_assignments` pasa a "**Tres** columnas de destino mutuamente
   excluyentes + `created_at`" (sin `priority`), y `profiles` gana `selected_program_id`.

3. **§6** — marcar la fase:

```markdown
- [x] **F4 — Loop de feedback**: vista coach con progreso "2/3 días" y el RPE del día contra los
  `target_rpe` del día, con notas; modelo de asignación simplificado (gana la última asignada) con
  elección del jugador. → `docs/IMPLEMENTATION-F4.md`
```

> El keepalive de UptimeRobot **sigue pendiente** y lo hace el dueño del repo — no lo marques hecho.

- [ ] **Step 7: Corregir `docs/HANDOFF-F4.md`**

Dos correcciones, para que la próxima sesión no herede el error:

- Línea 78: `rpeDelta` **no existía**; se escribió en esta rama.
- Agregar que el RPE es **por día** desde F3.5, así nadie vuelve a planificar un badge por ejercicio.

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md docs/HANDOFF-F4.md
git commit -m "docs: mark F4 done and correct the handoff"
```

---

## Definición de terminado

- El coach ve "2/3 días" por jugador y el promedio de desvío de RPE del día.
- El detalle muestra objetivo → percibido **por día**, con la nota destacada y la tabla de ejercicios
  planificado vs. hecho.
- Un coach no ve feedback de plantel ajeno: **404**, con el mismo body que un id inexistente.
- Gana la última asignada; no queda rastro de `priority` ni del destino `POSITION`.
- El jugador con más de una rutina puede cambiar, y su elección se resetea cuando el coach asigna algo.
- Una elección que dejó de alcanzarlo degrada al default en vez de romper "Mi semana".
- `pnpm lint && pnpm typecheck && pnpm test` en verde, **con el typecheck verificado inyectando un
  error**.
- `rbac-auditor` sin hallazgos altos.

## Fuera de alcance (del handoff, deliberado)

- **Paso 1** keepalive de UptimeRobot — lo hace el dueño del repo, 10 minutos.
- **Paso 3** recuperación de contraseña — es una decisión suya, no una implementación
  (`IMPLEMENTATION-F2.md` §5.5 B).
- **Paso 4** terminar el click-through — necesita browser con sesión real.
- **Paso 6** borrar los datos de prueba — pidió dejarlos hasta nuevo aviso.
- **El E2E del loop completo** — es el próximo candidato natural, ahora que el flujo cierra.
