# F2 — Panel del coach (Supabase + Vercel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> Reemplaza a `2026-07-27-f2-coach-panel.md`, escrito contra el stack descartado (ElectroDB,
> árbol embebido en la semana, GSI2, `targetKey` derivado). El comportamiento de producto es el
> mismo; la implementación cambia de raíz y en general **se simplifica**: el árbol es una tabla
> por nivel, así que el autosave es un `PATCH` a una fila por id en vez de un update anidado
> sobre una ruta de map, y desaparecen los tres chequeos de ruta que ese diseño exigía.

**Goal:** Que un coach gestione su plantel (puesto, medidas, 1RM), arme grupos custom, construya un
programa completo (semanas → días → bloques → ejercicios con los 3 modos de carga y RPE objetivo),
lo asigne a jugadores/puestos/grupos con prioridad viendo el impacto, y cargue un programa entero
desde Excel o texto.

**Architecture:** El árbol vive en 5 tablas (`programs → weeks → days → blocks → block_exercises`)
con `ON DELETE CASCADE`. La lectura del editor es **un** request con selects anidados de PostgREST;
la escritura es CRUD de filas por id, y RLS resuelve el ownership en cada nivel subiendo hasta
`can_write_program` (migración `0003`). `resolveProgram` sigue siendo una función pura: la query
trae los candidatos y la regla de negocio vive en TypeScript, testeable en milisegundos.

**Tech Stack:** Postgres + `supabase-js` con tipos generados, Hono + `@hono/zod-openapi`, Zod,
Nuxt 4 + Nuxt UI, SheetJS (client-side), Vitest.

**Precondición:** F1 en `main` y el hardening RBAC (`0005`–`0007`) aplicado. Rama: `feature/f2`.

---

## Lo que ya está hecho y NO hay que rehacer

Antes de escribir código, saber qué regala el stack:

| Lo que en el plan viejo era trabajo | Quién lo hace ahora |
|---|---|
| Ownership del árbol en cada update | RLS (`0003`): las políticas de `weeks`/`days`/`blocks`/`block_exercises` suben hasta `can_write_program` |
| Verificar que la ruta del árbol existe antes de escribir | No aplica: no hay rutas de map, hay filas con id y FK |
| Coherencia de LoadType | `CHECK block_exercises_load_shape` (`0001`) **más** Zod |
| "Exactamente un destino" del assignment | `CHECK program_assignments_one_target` (`0001`) **más** Zod |
| Que el destino del assignment sea del coach del programa | Trigger `guard_assignment_targets` (`0006`) **más** chequeo en la ruta |
| Borrado en cascada del árbol | `ON DELETE CASCADE` (`0001`) |
| Desvincular un jugador del plantel | RPC `release_player` (`0007`) |

## ⚠ Dos trampas que ya nos costaron tiempo — leer antes de escribir rutas

1. **Un `UPDATE`/`DELETE` de PostgREST que no matchea filas devuelve ÉXITO con 0 filas.** Cuando RLS
   filtra la fila por `USING`, no hay error. Toda ruta de escritura tiene que cerrar con
   `.select().maybeSingle()` y devolver **404 si vuelve `null`** (`CLAUDE.md` §4, capa 4: recurso
   ajeno → 404, nunca 403). Si no, el coach cree que guardó y no guardó nada.
2. **Un `UPDATE` que saca la fila del alcance de su política de `SELECT` falla con 42501.** Está
   documentado en `CLAUDE.md` §3. En F2 aplica si alguna vez se mueve una fila entre padres
   (por ejemplo cambiar el `block_id` de un `block_exercise` a un bloque de otro programa): no lo
   hagas con un `PATCH`, y en general **no permitas re-parentar filas entre programas**.

## ⚠ NECESITA PROTOTIPO (Task 13)

`coach.html` y `README-CoachLab.md` **siguen sin estar en el repo** (verificado el 2026-07-28), así
que el formato exacto del import es una **suposición**. El contrato de tipos (`ParsedProgram`) y las
firmas no van a cambiar; el formato de entrada sí puede. Antes de la Task 13:

1. Restaurar `coach.html` y `README-CoachLab.md` en la raíz.
2. Dispatch `spec-navigator`: *"¿Qué columnas exactas espera `parseGrid` y qué formato de línea
   espera `parseText`? Dame 2 ejemplos reales de cada uno."*
3. Reemplazar los tests de la Task 13 por los del formato real.

Si el prototipo no aparece, la Task 13 corre con el formato asumido y queda marcada como pendiente
de validación con un coach real. Las Tasks 1–12 no dependen de esto.

## File Structure

```
supabase/migrations/
  0008_catalog_growth_and_block_shape.sql   # RPC ensure_exercise + CHECK de blocks

packages/core/src/
  domain/
    resolveProgram.ts        # los 4 niveles + empates. La regla de negocio del producto
    tree.ts                  # orden por order_index: comparador, siguiente, reindex
  validators/
    program.ts               # programa, semana, día, bloque, ejercicio del bloque, assignment
    player.ts                # perfil editable por el coach + 1RM
    group.ts                 # grupo custom
    parsedProgram.ts         # contrato del import (compartido por parsers y ruta)

packages/api/src/routes/coach/
  players.ts                 # plantel: listar, ficha, editar, 1RM, desvincular
  groups.ts                  # grupos custom (+ los system desde constantes)
  programs.ts                # programas: CRUD + lectura del árbol completo
  tree.ts                    # semanas, días, bloques y ejercicios: CRUD de filas
  assignments.ts             # assignments + preview de impacto
  import.ts                  # aplicar un ParsedProgram

packages/web/app/
  components/
    ExerciseTypeahead.vue    # compartido con F3
    program/WeekTabs.vue, DayColumn.vue, BlockCard.vue, ExerciseRow.vue
  composables/
    useDebouncedSave.ts
  pages/coach/
    players/index.vue        # (ya existe: se le agrega link a ficha y desvincular)
    players/[playerId].vue
    groups.vue
    programs/index.vue
    programs/[programId].vue          # PADRE: encabezado + tabs + <NuxtPage />
    programs/[programId]/index.vue    # editor
    programs/[programId]/assign.vue
    programs/[programId]/import.vue
```

**Regla de nombres de Nuxt** (`CLAUDE.md` §5): `players/index.vue` y `players/[playerId].vue` son
**hermanas** (no comparten nada). `programs/[programId].vue` **sí** es padre de sus tres hijas,
porque las tres cargan el mismo programa y muestran los mismos tabs.

---

### Task 1: Migración 0008 — crecimiento del catálogo y forma del bloque

Dos cosas que bloquean tasks posteriores si no se hacen ahora.

**Files:**
- Create: `supabase/migrations/0008_catalog_growth_and_block_shape.sql`
- Regenerate: `packages/web/types/database.ts`

- [ ] **Step 1: Escribir la migración**

```sql
-- ---------------------------------------------------------------------------
-- El import necesita agregar ejercicios al catálogo, y no puede.
--
-- exercises_write (0003) es solo ADMIN, a propósito: el catálogo es global y no
-- queremos que cualquiera lo edite. Pero el import de un programa trae nombres
-- que pueden no existir ("Remo Pendlay"), y abortar el import por eso sería
-- inusable.
--
-- Salida: una RPC security definer que SOLO inserta si falta y devuelve el id.
-- No actualiza ni borra nada, así que el catálogo puede crecer pero no se puede
-- pisar ni vaciar desde la app.
--
-- El normalized_name lo calcula el llamador con normName() de
-- packages/core/src/domain/normName.ts: replicar ese algoritmo en SQL sería
-- tener dos fuentes de verdad del matching de 1RM (que es lo que decide si un
-- jugador ve sus kg o el aviso de "falta tu 1RM").
-- ---------------------------------------------------------------------------

create or replace function public.ensure_exercise(p_name text, p_normalized text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_name text := trim(p_name);
  v_norm text := trim(p_normalized);
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if length(v_name) < 2 or length(v_name) > 120 or length(v_norm) < 2 then
    raise exception 'Nombre de ejercicio inválido';
  end if;

  select e.id into v_id from public.exercises e where e.normalized_name = v_norm;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.exercises (name, normalized_name)
  values (v_name, v_norm)
  -- Dos coaches importando el mismo ejercicio a la vez: gana el primero y el
  -- segundo recibe su id, no un error.
  on conflict (normalized_name) do nothing
  returning id into v_id;

  if v_id is null then
    select e.id into v_id from public.exercises e where e.normalized_name = v_norm;
  end if;

  return v_id;
end;
$$;

revoke execute on function public.ensure_exercise(text, text) from anon;

-- ---------------------------------------------------------------------------
-- Coherencia de la forma del bloque, al mismo nivel que la de LoadType.
--
-- blocks.type era text libre y nullable: la regla "un circuito tiene vueltas,
-- un bloque simple no" vivía solo en la UI. CLAUDE.md §5: si se puede expresar
-- como CHECK, va como CHECK además de en Zod.
--
-- La tabla está vacía (F2 es la fase que crea programas), así que el NOT NULL
-- con default no necesita backfill.
-- ---------------------------------------------------------------------------

update public.blocks set type = 'SINGLE' where type is null;

alter table public.blocks
  alter column type set default 'SINGLE',
  alter column type set not null;

alter table public.blocks
  add constraint blocks_type_shape check (
    (type = 'SINGLE'  and rounds is null) or
    (type = 'CIRCUIT' and rounds is not null)
  );
```

- [ ] **Step 2: Aplicar**

```powershell
pnpm exec supabase db push --db-url "postgresql://postgres.hiceiurkvznfhujtjfar:<PASSWORD>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres" --include-all
```

Expected: `Applying migration 0008_catalog_growth_and_block_shape.sql...` → `Finished`.

- [ ] **Step 3: Regenerar tipos**

```powershell
$env:SUPABASE_ACCESS_TOKEN="sbp_..."
pnpm exec supabase gen types typescript --project-id hiceiurkvznfhujtjfar --schema public | Out-File -Encoding utf8 packages/web/types/database.ts
```

(`Out-File -Encoding utf8`, no `>`: en Windows PowerShell 5.1 `>` escribe UTF-16 y git trata el
archivo como binario.)

Verificar: `Select-String -Path packages\web\types\database.ts -Pattern 'ensure_exercise'` devuelve
una línea.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0008_catalog_growth_and_block_shape.sql packages/web/types/database.ts
git commit -m "feat(db): add ensure_exercise rpc and block shape check"
```

---

### Task 2: `resolveProgram` — la regla de negocio del producto

La más importante de `CLAUDE.md` §3. Vive en un solo lugar, es pura y se testea en milisegundos.

**Files:**
- Create: `packages/core/src/domain/resolveProgram.ts`
- Test: `packages/core/src/domain/resolveProgram.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { describe, expect, it } from 'vitest'
import { BASE_PRIORITY, type CandidateAssignment, resolveProgram, scoreOf } from './resolveProgram'

const at = (iso: string) => new Date(iso)

function candidate(over: Partial<CandidateAssignment> = {}): CandidateAssignment {
  return {
    assignmentId: 'a1',
    programId: 'p1',
    kind: 'POSITION',
    priority: 0,
    createdAt: at('2026-01-01T00:00:00Z'),
    ...over,
  }
}

describe('BASE_PRIORITY', () => {
  it('respeta el orden individual > grupo custom > grupo system > puesto', () => {
    expect(BASE_PRIORITY.PLAYER).toBe(100)
    expect(BASE_PRIORITY.POSITION_GROUP).toBe(50)
    expect(BASE_PRIORITY.SYSTEM_GROUP).toBe(30)
    expect(BASE_PRIORITY.POSITION).toBe(10)
  })
})

describe('scoreOf', () => {
  it('suma el override de prioridad a la base', () => {
    expect(scoreOf(candidate({ kind: 'POSITION', priority: 5 }))).toBe(15)
  })

  it('acepta override negativo', () => {
    expect(scoreOf(candidate({ kind: 'PLAYER', priority: -80 }))).toBe(20)
  })
})

describe('resolveProgram', () => {
  it('sin candidatos devuelve null', () => {
    expect(resolveProgram([])).toBeNull()
  })

  it('con un solo candidato lo devuelve', () => {
    expect(resolveProgram([candidate({ programId: 'solo' })])?.programId).toBe('solo')
  })

  it('individual le gana a grupo custom', () => {
    expect(
      resolveProgram([
        candidate({ assignmentId: 'g', kind: 'POSITION_GROUP', programId: 'grupo' }),
        candidate({ assignmentId: 'i', kind: 'PLAYER', programId: 'individual' }),
      ])?.programId,
    ).toBe('individual')
  })

  it('grupo custom le gana a grupo system', () => {
    expect(
      resolveProgram([
        candidate({ assignmentId: 's', kind: 'SYSTEM_GROUP', programId: 'forwards' }),
        candidate({ assignmentId: 'c', kind: 'POSITION_GROUP', programId: 'primeras' }),
      ])?.programId,
    ).toBe('primeras')
  })

  it('grupo system le gana a puesto', () => {
    expect(
      resolveProgram([
        candidate({ assignmentId: 'p', kind: 'POSITION', programId: 'puesto' }),
        candidate({ assignmentId: 's', kind: 'SYSTEM_GROUP', programId: 'system' }),
      ])?.programId,
    ).toBe('system')
  })

  it('respeta los 4 niveles a la vez', () => {
    expect(
      resolveProgram([
        candidate({ assignmentId: '1', kind: 'POSITION', programId: 'puesto' }),
        candidate({ assignmentId: '2', kind: 'SYSTEM_GROUP', programId: 'system' }),
        candidate({ assignmentId: '3', kind: 'POSITION_GROUP', programId: 'custom' }),
        candidate({ assignmentId: '4', kind: 'PLAYER', programId: 'individual' }),
      ])?.programId,
    ).toBe('individual')
  })

  it('el override de prioridad puede dar vuelta el orden natural', () => {
    expect(
      resolveProgram([
        candidate({ assignmentId: 'i', kind: 'PLAYER', programId: 'individual', priority: 0 }),
        candidate({ assignmentId: 'p', kind: 'POSITION', programId: 'puesto', priority: 200 }),
      ])?.programId,
    ).toBe('puesto')
  })

  it('ante empate gana el createdAt más reciente', () => {
    expect(
      resolveProgram([
        candidate({ assignmentId: 'v', programId: 'viejo', createdAt: at('2026-01-01T00:00:00Z') }),
        candidate({ assignmentId: 'n', programId: 'nuevo', createdAt: at('2026-06-01T00:00:00Z') }),
      ])?.programId,
    ).toBe('nuevo')
  })

  it('el empate desempata por fecha aun entre kinds distintos con el mismo score', () => {
    expect(
      resolveProgram([
        candidate({
          assignmentId: 'a',
          kind: 'SYSTEM_GROUP', // 30 + 20 = 50
          priority: 20,
          programId: 'system-boosteado',
          createdAt: at('2026-03-01T00:00:00Z'),
        }),
        candidate({
          assignmentId: 'b',
          kind: 'POSITION_GROUP', // 50 + 0 = 50
          priority: 0,
          programId: 'custom',
          createdAt: at('2026-01-01T00:00:00Z'),
        }),
      ])?.programId,
    ).toBe('system-boosteado')
  })

  it('no muta el array de entrada', () => {
    const list = [
      candidate({ assignmentId: '1', kind: 'POSITION' }),
      candidate({ assignmentId: '2', kind: 'PLAYER' }),
    ]
    resolveProgram(list)
    expect(list.map((c) => c.assignmentId)).toEqual(['1', '2'])
  })
})
```

- [ ] **Step 2: Correr para ver que falla**

Run: `pnpm --filter @coachlab/core test`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

`packages/core/src/domain/resolveProgram.ts`:

```ts
/**
 * Los cuatro destinos posibles de un assignment, con los nombres de las columnas
 * de program_assignments: player_id, position_group_id (custom),
 * system_group_id (forwards/backs) y position_id.
 */
export type AssignmentKind = 'PLAYER' | 'POSITION_GROUP' | 'SYSTEM_GROUP' | 'POSITION'

/** CLAUDE.md §3: individual pisa grupo custom, pisa grupo system, pisa puesto. */
export const BASE_PRIORITY: Record<AssignmentKind, number> = {
  PLAYER: 100,
  POSITION_GROUP: 50,
  SYSTEM_GROUP: 30,
  POSITION: 10,
}

export type CandidateAssignment = {
  assignmentId: string
  programId: string
  kind: AssignmentKind
  /** Override que define el coach por assignment. Se SUMA a la base. */
  priority: number
  createdAt: Date
}

export function scoreOf(candidate: CandidateAssignment): number {
  return BASE_PRIORITY[candidate.kind] + candidate.priority
}

/**
 * Elige el assignment vigente entre los que le aplican a un jugador.
 * Gana el score más alto; ante empate, el createdAt más reciente.
 *
 * Pura a propósito (CLAUDE.md §3): se podría resolver en SQL con un
 * ORDER BY ... LIMIT 1, pero entonces la regla de negocio viviría en un string
 * y solo se podría testear con una base levantada.
 */
export function resolveProgram(candidates: readonly CandidateAssignment[]): CandidateAssignment | null {
  let winner: CandidateAssignment | null = null
  let winnerScore = -Infinity

  for (const candidate of candidates) {
    const score = scoreOf(candidate)
    if (score > winnerScore) {
      winner = candidate
      winnerScore = score
      continue
    }
    if (score === winnerScore && winner && candidate.createdAt > winner.createdAt) {
      winner = candidate
    }
  }

  return winner
}
```

- [ ] **Step 4: Correr para ver que pasa**

Run: `pnpm --filter @coachlab/core test`
Expected: PASS, 14 tests nuevos.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/resolveProgram.ts packages/core/src/domain/resolveProgram.test.ts
git commit -m "feat(domain): add resolveProgram with 4-level assignment priority"
```

---

### Task 3: Helpers de orden del árbol

`CLAUDE.md` §3: *"El orden **nunca** sale del orden en que vuelven las filas"*. Estos helpers son el
único lugar donde se ordena, y por eso tienen tests.

**Files:**
- Create: `packages/core/src/domain/tree.ts`
- Test: `packages/core/src/domain/tree.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { describe, expect, it } from 'vitest'
import { byOrderIndex, nextOrderIndex, reindex, sortByOrderIndex } from './tree'

const rows = [
  { id: 'b', order_index: 2, name: 'segundo' },
  { id: 'a', order_index: 1, name: 'primero' },
  { id: 'c', order_index: 3, name: 'tercero' },
]

describe('sortByOrderIndex', () => {
  it('ordena por order_index, no por el orden de llegada', () => {
    expect(sortByOrderIndex(rows).map((r) => r.name)).toEqual(['primero', 'segundo', 'tercero'])
  })

  it('no muta el array de entrada', () => {
    const input = [...rows]
    sortByOrderIndex(input)
    expect(input.map((r) => r.id)).toEqual(['b', 'a', 'c'])
  })

  it('con array vacío devuelve array vacío', () => {
    expect(sortByOrderIndex([])).toEqual([])
  })

  it('desempata por id para ser determinístico', () => {
    const tie = [
      { id: 'z', order_index: 1 },
      { id: 'a', order_index: 1 },
    ]
    expect(sortByOrderIndex(tie).map((r) => r.id)).toEqual(['a', 'z'])
  })

  it('tolera null en order_index poniéndolo al final', () => {
    const withNull = [
      { id: 'x', order_index: null },
      { id: 'y', order_index: 0 },
    ]
    expect(sortByOrderIndex(withNull).map((r) => r.id)).toEqual(['y', 'x'])
  })
})

describe('byOrderIndex', () => {
  it('sirve como comparador de Array.prototype.sort', () => {
    expect([...rows].sort(byOrderIndex).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('nextOrderIndex', () => {
  it('devuelve el máximo más uno', () => {
    expect(nextOrderIndex(rows)).toBe(4)
  })

  it('devuelve 0 con array vacío', () => {
    expect(nextOrderIndex([])).toBe(0)
  })

  it('no se rompe con un hueco en la secuencia', () => {
    expect(nextOrderIndex([{ order_index: 0 }, { order_index: 7 }])).toBe(8)
  })

  it('ignora nulls', () => {
    expect(nextOrderIndex([{ order_index: null }, { order_index: 2 }])).toBe(3)
  })
})

describe('reindex', () => {
  it('renumera 0..n-1 respetando el orden actual', () => {
    expect(reindex(rows)).toEqual([
      { id: 'a', order_index: 0 },
      { id: 'b', order_index: 1 },
      { id: 'c', order_index: 2 },
    ])
  })

  it('con array vacío devuelve array vacío', () => {
    expect(reindex([])).toEqual([])
  })

  it('sirve para mover un elemento: reordenar y renumerar', () => {
    const moved = [
      { id: 'c', order_index: 0 },
      { id: 'a', order_index: 1 },
      { id: 'b', order_index: 2 },
    ]
    expect(reindex(moved).map((r) => r.id)).toEqual(['c', 'a', 'b'])
  })
})
```

- [ ] **Step 2: Correr para ver que falla** → FAIL.

- [ ] **Step 3: Implementar**

`packages/core/src/domain/tree.ts`:

```ts
/**
 * Orden del árbol del programa.
 *
 * CLAUDE.md §3: el orden NUNCA sale del orden en que vuelven las filas, sale de
 * order_index. La query pide el orden y estos helpers lo garantizan igual, para
 * que un select que se olvide del `order` no reordene la rutina de nadie.
 */

export type Ordered = { order_index?: number | null }

/** null va al final: una fila sin orden explícito es la última, no la primera. */
function orderOf(row: Ordered): number {
  return row.order_index ?? Number.MAX_SAFE_INTEGER
}

/** Comparador para `Array.prototype.sort`. Empata por id para ser determinístico. */
export function byOrderIndex<T extends Ordered & { id?: string }>(a: T, b: T): number {
  const diff = orderOf(a) - orderOf(b)
  if (diff !== 0) return diff
  return (a.id ?? '').localeCompare(b.id ?? '')
}

/** Copia ordenada. No muta la entrada. */
export function sortByOrderIndex<T extends Ordered & { id?: string }>(rows: readonly T[]): T[] {
  return [...rows].sort(byOrderIndex)
}

/** El order_index que le toca a un hermano nuevo. */
export function nextOrderIndex(rows: readonly Ordered[]): number {
  const indexes = rows.map((r) => r.order_index).filter((i): i is number => typeof i === 'number')
  return indexes.length === 0 ? 0 : Math.max(...indexes) + 1
}

/**
 * Renumera 0..n-1 respetando el orden actual del array recibido.
 * Devuelve solo `{ id, order_index }`: es lo que la ruta de reordenar manda.
 */
export function reindex<T extends { id: string }>(rows: readonly T[]): { id: string; order_index: number }[] {
  return rows.map((row, index) => ({ id: row.id, order_index: index }))
}
```

> `reindex` recibe el array **ya en el orden deseado** (lo que devuelve un drag&drop) y no lo
> reordena: para renumerar lo que viene de la base, primero `sortByOrderIndex`.

- [ ] **Step 4: Correr para ver que pasa** → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/tree.ts packages/core/src/domain/tree.test.ts
git commit -m "feat(domain): add order_index helpers for the program tree"
```

---

### Task 4: Validadores

**Files:**
- Create: `packages/core/src/validators/program.ts`, `player.ts`, `group.ts`
- Test: `packages/core/src/validators/program.test.ts`, `player.test.ts`, `group.test.ts`

- [ ] **Step 1: Tests de `program.ts`**

```ts
import { describe, expect, it } from 'vitest'
import {
  assignmentSchema,
  blockExerciseSchema,
  blockSchema,
  programSchema,
  weekSchema,
} from './program'

const base = { exerciseId: '7c9e6679-7425-40de-944b-e07fc1f90ae7', sets: 4, reps: '8' }

describe('blockExerciseSchema', () => {
  it('WEIGHT con weight es válido', () => {
    expect(blockExerciseSchema.safeParse({ ...base, loadType: 'WEIGHT', weight: 80 }).success).toBe(true)
  })

  it('WEIGHT sin weight falla en el campo weight', () => {
    const result = blockExerciseSchema.safeParse({ ...base, loadType: 'WEIGHT' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['weight'])
  })

  it('WEIGHT con percentage falla', () => {
    expect(
      blockExerciseSchema.safeParse({ ...base, loadType: 'WEIGHT', weight: 80, percentage: 70 }).success,
    ).toBe(false)
  })

  it('PERCENTAGE con percentage 1..100 es válido', () => {
    expect(blockExerciseSchema.safeParse({ ...base, loadType: 'PERCENTAGE', percentage: 80 }).success).toBe(true)
  })

  it('PERCENTAGE con 0 o 101 falla', () => {
    expect(blockExerciseSchema.safeParse({ ...base, loadType: 'PERCENTAGE', percentage: 0 }).success).toBe(false)
    expect(blockExerciseSchema.safeParse({ ...base, loadType: 'PERCENTAGE', percentage: 101 }).success).toBe(false)
  })

  it('PERCENTAGE sin percentage falla en el campo percentage', () => {
    const result = blockExerciseSchema.safeParse({ ...base, loadType: 'PERCENTAGE' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['percentage'])
  })

  it('NONE sin carga es válido', () => {
    expect(blockExerciseSchema.safeParse({ ...base, loadType: 'NONE' }).success).toBe(true)
  })

  it('NONE con weight falla', () => {
    expect(blockExerciseSchema.safeParse({ ...base, loadType: 'NONE', weight: 50 }).success).toBe(false)
  })

  it('acepta null explícito además de undefined en la carga que no corresponde', () => {
    expect(
      blockExerciseSchema.safeParse({ ...base, loadType: 'NONE', weight: null, percentage: null }).success,
    ).toBe(true)
  })

  it('targetRpe fuera de 1..10 falla', () => {
    expect(blockExerciseSchema.safeParse({ ...base, loadType: 'NONE', targetRpe: 11 }).success).toBe(false)
    expect(blockExerciseSchema.safeParse({ ...base, loadType: 'NONE', targetRpe: 0 }).success).toBe(false)
  })

  it('acepta RPE con medio punto', () => {
    expect(blockExerciseSchema.safeParse({ ...base, loadType: 'NONE', targetRpe: 7.5 }).success).toBe(true)
  })

  it('reps vacío falla', () => {
    expect(blockExerciseSchema.safeParse({ ...base, reps: '   ', loadType: 'NONE' }).success).toBe(false)
  })

  it('reps acepta rangos y AMRAP', () => {
    expect(blockExerciseSchema.safeParse({ ...base, reps: '8-10', loadType: 'NONE' }).success).toBe(true)
    expect(blockExerciseSchema.safeParse({ ...base, reps: 'AMRAP', loadType: 'NONE' }).success).toBe(true)
  })

  it('exerciseId tiene que ser un uuid', () => {
    expect(blockExerciseSchema.safeParse({ ...base, exerciseId: 'no-uuid', loadType: 'NONE' }).success).toBe(false)
  })
})

describe('blockSchema', () => {
  it('CIRCUIT con vueltas es válido', () => {
    expect(blockSchema.safeParse({ type: 'CIRCUIT', rounds: 3 }).success).toBe(true)
  })

  it('CIRCUIT sin vueltas falla', () => {
    const result = blockSchema.safeParse({ type: 'CIRCUIT' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['rounds'])
  })

  it('SINGLE sin vueltas es válido', () => {
    expect(blockSchema.safeParse({ type: 'SINGLE' }).success).toBe(true)
  })

  it('SINGLE con vueltas falla — lo mismo que el CHECK de la base', () => {
    expect(blockSchema.safeParse({ type: 'SINGLE', rounds: 3 }).success).toBe(false)
  })
})

describe('programSchema y weekSchema', () => {
  it('aceptan un nombre válido', () => {
    expect(programSchema.safeParse({ name: 'Mesociclo 1' }).success).toBe(true)
    expect(weekSchema.safeParse({ name: 'Semana 1' }).success).toBe(true)
  })

  it('rechazan nombre vacío o de solo espacios', () => {
    expect(programSchema.safeParse({ name: '  ' }).success).toBe(false)
    expect(weekSchema.safeParse({ name: '' }).success).toBe(false)
  })

  it('recortan espacios', () => {
    expect(programSchema.parse({ name: '  Mesociclo 1  ' }).name).toBe('Mesociclo 1')
  })
})

describe('assignmentSchema', () => {
  const uuid = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

  it('acepta exactamente un destino', () => {
    expect(assignmentSchema.safeParse({ playerId: uuid }).success).toBe(true)
    expect(assignmentSchema.safeParse({ positionId: 'wing' }).success).toBe(true)
    expect(assignmentSchema.safeParse({ systemGroupId: 'forwards' }).success).toBe(true)
    expect(assignmentSchema.safeParse({ positionGroupId: uuid }).success).toBe(true)
  })

  it('rechaza dos destinos a la vez — lo mismo que el CHECK de la base', () => {
    expect(assignmentSchema.safeParse({ playerId: uuid, positionId: 'wing' }).success).toBe(false)
  })

  it('rechaza cero destinos', () => {
    expect(assignmentSchema.safeParse({}).success).toBe(false)
  })

  it('rechaza un positionId que no es una de las 8', () => {
    expect(assignmentSchema.safeParse({ positionId: 'hooker' }).success).toBe(false)
  })

  it('rechaza un systemGroupId inventado', () => {
    expect(assignmentSchema.safeParse({ systemGroupId: 'centros' }).success).toBe(false)
  })

  it('priority por defecto es 0', () => {
    expect(assignmentSchema.parse({ positionId: 'wing' }).priority).toBe(0)
  })

  it('acepta priority negativa y la acota', () => {
    expect(assignmentSchema.safeParse({ positionId: 'wing', priority: -50 }).success).toBe(true)
    expect(assignmentSchema.safeParse({ positionId: 'wing', priority: 9999 }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Correr para ver que falla** → FAIL.

- [ ] **Step 3: Implementar `program.ts`**

`packages/core/src/validators/program.ts`:

```ts
import { z } from 'zod'
import { isPositionId } from '../domain/positions'

const name = (max: number) => z.string().trim().min(1, 'Poné un nombre').max(max)

export const programSchema = z.object({ name: name(120) })
export const weekSchema = z.object({ name: name(60) })
export const daySchema = z.object({ name: name(60) })

export type ProgramInput = z.infer<typeof programSchema>

/** Coherencia de la forma del bloque. Espejo del CHECK blocks_type_shape (0008). */
export const blockSchema = z
  .object({
    type: z.enum(['SINGLE', 'CIRCUIT']),
    rounds: z.number().int().min(1).max(20).nullish(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'CIRCUIT' && data.rounds == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rounds'],
        message: 'Un circuito necesita cantidad de vueltas',
      })
    }
    if (data.type === 'SINGLE' && data.rounds != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rounds'],
        message: 'Las vueltas son solo para circuitos',
      })
    }
  })

export type BlockInput = z.infer<typeof blockSchema>

/**
 * Coherencia de LoadType. Espejo del CHECK block_exercises_load_shape (0001).
 * Zod da el mensaje lindo, la base da la garantía (CLAUDE.md §5).
 */
export const blockExerciseSchema = z
  .object({
    exerciseId: z.string().uuid('Elegí un ejercicio'),
    sets: z.number().int().min(1, 'Mínimo 1 serie').max(20),
    reps: z.string().trim().min(1, 'Poné las repeticiones').max(20),
    loadType: z.enum(['WEIGHT', 'PERCENTAGE', 'NONE']),
    weight: z.number().positive('El peso tiene que ser mayor a 0').max(500).nullish(),
    percentage: z.number().int().min(1).max(100).nullish(),
    targetRpe: z.number().min(1).max(10).nullish(),
  })
  .superRefine((data, ctx) => {
    const custom = z.ZodIssueCode.custom

    if (data.loadType === 'WEIGHT') {
      if (data.weight == null) ctx.addIssue({ code: custom, path: ['weight'], message: 'Poné los kg' })
      if (data.percentage != null) {
        ctx.addIssue({ code: custom, path: ['percentage'], message: 'No lleva porcentaje' })
      }
    }

    if (data.loadType === 'PERCENTAGE') {
      if (data.percentage == null) {
        ctx.addIssue({ code: custom, path: ['percentage'], message: 'Poné el porcentaje' })
      }
      if (data.weight != null) ctx.addIssue({ code: custom, path: ['weight'], message: 'No lleva kg fijos' })
    }

    if (data.loadType === 'NONE') {
      if (data.weight != null) ctx.addIssue({ code: custom, path: ['weight'], message: 'Sin peso no lleva kg' })
      if (data.percentage != null) {
        ctx.addIssue({ code: custom, path: ['percentage'], message: 'Sin peso no lleva porcentaje' })
      }
    }
  })

export type BlockExerciseInput = z.infer<typeof blockExerciseSchema>

/** Espejo del CHECK program_assignments_one_target (0001). */
export const assignmentSchema = z
  .object({
    playerId: z.string().uuid().nullish(),
    positionId: z.string().refine(isPositionId, 'Puesto inválido').nullish(),
    systemGroupId: z.enum(['forwards', 'backs']).nullish(),
    positionGroupId: z.string().uuid().nullish(),
    priority: z.number().int().min(-100).max(500).default(0),
  })
  .superRefine((data, ctx) => {
    const targets = [data.playerId, data.positionId, data.systemGroupId, data.positionGroupId].filter(
      (t) => t != null,
    )
    if (targets.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['playerId'],
        message: 'Elegí exactamente un destino: jugador, puesto, grupo del sistema o grupo custom',
      })
    }
  })

export type AssignmentInput = z.infer<typeof assignmentSchema>

/** Reordenar hermanos: lo que produce `reindex` de domain/tree. */
export const reorderSchema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), order_index: z.number().int().min(0) })).min(1),
})
```

- [ ] **Step 4: Tests de `player.ts` y `group.ts`**

`packages/core/src/validators/player.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { oneRmSchema, playerProfileSchema } from './player'

describe('playerProfileSchema', () => {
  it('acepta puesto, altura y peso', () => {
    expect(
      playerProfileSchema.safeParse({ positionId: 'wing', heightCm: 182, weightKg: 88.5 }).success,
    ).toBe(true)
  })

  it('acepta null para limpiar un campo', () => {
    expect(
      playerProfileSchema.safeParse({ positionId: null, heightCm: null, weightKg: null }).success,
    ).toBe(true)
  })

  it('rechaza un puesto inventado', () => {
    expect(playerProfileSchema.safeParse({ positionId: 'hooker' }).success).toBe(false)
  })

  it('rechaza altura y peso fuera de rango', () => {
    expect(playerProfileSchema.safeParse({ heightCm: 90 }).success).toBe(false)
    expect(playerProfileSchema.safeParse({ heightCm: 260 }).success).toBe(false)
    expect(playerProfileSchema.safeParse({ weightKg: 20 }).success).toBe(false)
    expect(playerProfileSchema.safeParse({ weightKg: 300 }).success).toBe(false)
  })

  it('IGNORA role, coachId, email e inviteCode si vienen en el body', () => {
    // Es la defensa contra una escalada de privilegios por spread del body:
    // el perfil vive en la misma tabla que el rol.
    const parsed = playerProfileSchema.parse({
      positionId: 'wing',
      role: 'ADMIN',
      coachId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      email: 'otro@x.com',
      inviteCode: 'ABC234',
    })
    expect(parsed).toEqual({ positionId: 'wing' })
    expect('role' in parsed).toBe(false)
  })
})

describe('oneRmSchema', () => {
  it('acepta ejercicio y kg', () => {
    expect(
      oneRmSchema.safeParse({ exerciseId: '7c9e6679-7425-40de-944b-e07fc1f90ae7', kg: 140 }).success,
    ).toBe(true)
  })

  it('rechaza kg 0 o negativo', () => {
    const id = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
    expect(oneRmSchema.safeParse({ exerciseId: id, kg: 0 }).success).toBe(false)
    expect(oneRmSchema.safeParse({ exerciseId: id, kg: -5 }).success).toBe(false)
  })

  it('acepta medio kilo', () => {
    expect(
      oneRmSchema.safeParse({ exerciseId: '7c9e6679-7425-40de-944b-e07fc1f90ae7', kg: 82.5 }).success,
    ).toBe(true)
  })
})
```

`packages/core/src/validators/group.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { positionGroupSchema } from './group'

describe('positionGroupSchema', () => {
  it('acepta nombre y puestos', () => {
    expect(
      positionGroupSchema.safeParse({ name: 'Primeras y Segundas', positionIds: ['primera-linea', 'segunda-linea'] })
        .success,
    ).toBe(true)
  })

  it('exige al menos un puesto', () => {
    expect(positionGroupSchema.safeParse({ name: 'Vacío', positionIds: [] }).success).toBe(false)
  })

  it('rechaza puestos repetidos', () => {
    expect(
      positionGroupSchema.safeParse({ name: 'Repe', positionIds: ['wing', 'wing'] }).success,
    ).toBe(false)
  })

  it('rechaza un puesto inventado', () => {
    expect(positionGroupSchema.safeParse({ name: 'X', positionIds: ['hooker'] }).success).toBe(false)
  })

  it('rechaza nombre de menos de 2 caracteres', () => {
    expect(positionGroupSchema.safeParse({ name: 'A', positionIds: ['wing'] }).success).toBe(false)
  })
})
```

- [ ] **Step 5: Implementar `player.ts` y `group.ts`**

`packages/core/src/validators/player.ts`:

```ts
import { z } from 'zod'
import { isPositionId } from '../domain/positions'

/**
 * Lo que el coach (o el jugador en F3) puede editar del perfil.
 *
 * NO incluye role, coach_id, email ni invite_code a propósito: el perfil vive en
 * la misma tabla que el rol, y un update armado con spread del body sería una
 * escalada de privilegios. Zod los descarta (no usa .passthrough()), el trigger
 * guard_profile_changes los frena en la base, y la ruta escribe campo por campo
 * desde el objeto ya validado. Tres capas para la misma cosa (CLAUDE.md §4).
 */
export const playerProfileSchema = z.object({
  positionId: z.string().refine(isPositionId, 'Puesto inválido').nullish(),
  heightCm: z.number().int().min(100, 'Muy poco').max(250, 'Demasiado').nullish(),
  weightKg: z.number().min(30, 'Muy poco').max(250, 'Demasiado').nullish(),
})

export type PlayerProfileInput = z.infer<typeof playerProfileSchema>

export const oneRmSchema = z.object({
  exerciseId: z.string().uuid('Elegí un ejercicio'),
  kg: z.number().positive('Tiene que ser mayor a 0').max(500),
})

export type OneRmInput = z.infer<typeof oneRmSchema>
```

`packages/core/src/validators/group.ts`:

```ts
import { z } from 'zod'
import { POSITIONS, isPositionId } from '../domain/positions'

export const positionGroupSchema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(60),
  positionIds: z
    .array(z.string().refine(isPositionId, 'Puesto inválido'))
    .min(1, 'Elegí al menos un puesto')
    .max(POSITIONS.length)
    .refine((ids) => new Set(ids).size === ids.length, 'Hay puestos repetidos'),
})

export type PositionGroupInput = z.infer<typeof positionGroupSchema>
```

- [ ] **Step 6: Correr** → `pnpm --filter @coachlab/core test` PASS. Y `typecheck`.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/validators
git commit -m "feat(validators): add program, player and group schemas"
```

---

### Task 5: API del plantel

**Files:**
- Create: `packages/api/src/routes/coach/players.ts`
- Modify: `packages/api/src/app.ts` (montar), borrar `packages/api/src/routes/players.ts` (se absorbe)
- Test: `packages/api/src/routes/coach/players.test.ts`

- [ ] **Step 1: Helper de "404 si no hay fila"**

Este helper es la respuesta a la trampa #1 del encabezado. Va en
`packages/api/src/routes/coach/_scope.ts`:

```ts
import { NotFoundError } from '@coachlab/core/access/rbac'

/**
 * Un UPDATE/DELETE de PostgREST que no matchea filas devuelve ÉXITO con 0 filas:
 * cuando RLS filtra la fila por USING no hay error. Sin esto, el coach cree que
 * guardó y no guardó nada, y un recurso ajeno respondería 200.
 *
 * CLAUDE.md §4, capa 4: recurso ajeno → 404, nunca 403.
 */
export function assertRow<T>(row: T | null | undefined, error?: { message: string } | null): T {
  if (error) throw new Error(error.message)
  if (row == null) throw new NotFoundError()
  return row
}
```

- [ ] **Step 2: Las rutas**

`packages/api/src/routes/coach/players.ts` — todas bajo `/coach/*`, que ya lleva
`requireRole(['COACH','ADMIN'])` desde F1.

| Método | Path | Comportamiento |
|---|---|---|
| GET | `/coach/players` | Plantel del actor, ordenado por nombre. Incluye `positionId`, `heightCm`, `weightKg` |
| GET | `/coach/players/{playerId}` | Ficha + sus 1RM con nombre de ejercicio. `assertRow` → 404 si no es del plantel |
| PATCH | `/coach/players/{playerId}` | `playerProfileSchema`, **campos explícitos**, `.select().maybeSingle()` + `assertRow` |
| PUT | `/coach/players/{playerId}/one-rm` | `oneRmSchema`, upsert por `(player_id, exercise_id)` |
| DELETE | `/coach/players/{playerId}/one-rm/{exerciseId}` | |
| POST | `/coach/players/{playerId}/release` | RPC `release_player` (0007) |

El PATCH, que es el que puede escalar privilegios si se hace mal:

```ts
const { data, error } = await db
  .from('profiles')
  .update({
    // Campo por campo desde el objeto validado. NUNCA `...body`.
    position_id: input.positionId ?? null,
    height_cm: input.heightCm ?? null,
    weight_kg: input.weightKg ?? null,
  })
  .eq('id', playerId)
  .eq('coach_id', actor.id)   // capa 4, explícita además de RLS
  .eq('role', 'PLAYER')
  .select('id, name, email, position_id, height_cm, weight_kg')
  .maybeSingle()

const player = assertRow(data, error)
```

> **Ojo con `?? null`:** `playerProfileSchema` usa `.nullish()`, así que un campo ausente llega
> `undefined`. Mandar `undefined` a supabase-js **omite la columna** (update parcial), mandar `null`
> la limpia. Acá queremos que la ficha sea autoritativa: lo que no vino, se limpia. Si en algún
> momento se quiere PATCH parcial de verdad, hay que armar el objeto solo con las claves presentes.

Los 1RM se leen con un select anidado, sin segunda query:

```ts
.from('one_rms')
.select('kg, updated_at, exercises(id, name, normalized_name)')
.eq('player_id', playerId)
```

`POST /release` no toca la tabla: `await db.rpc('release_player', { player_id: playerId })`. Si la
RPC lanza (no es tu jugador), el error se traduce a 404 con `NotFoundError`.

- [ ] **Step 3: Tests de guard (offline)**

`packages/api/src/routes/coach/players.test.ts`, con `app.request()` como en F1: sin cookie, cada
ruta nueva devuelve **401**. Es el test que garantiza que ninguna ruta nació sin guard.

```ts
import { describe, expect, it } from 'vitest'
import { app } from '../../app'

const PLAYER = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

describe('rutas del plantel sin sesión', () => {
  const cases: [string, RequestInit | undefined][] = [
    [`/api/coach/players`, undefined],
    [`/api/coach/players/${PLAYER}`, undefined],
    [`/api/coach/players/${PLAYER}`, { method: 'PATCH', body: '{}' }],
    [`/api/coach/players/${PLAYER}/one-rm`, { method: 'PUT', body: '{}' }],
    [`/api/coach/players/${PLAYER}/one-rm/${PLAYER}`, { method: 'DELETE' }],
    [`/api/coach/players/${PLAYER}/release`, { method: 'POST' }],
  ]

  for (const [path, init] of cases) {
    it(`${init?.method ?? 'GET'} ${path} → 401`, async () => {
      const res = await app.request(path, {
        ...init,
        headers: { 'content-type': 'application/json' },
      })
      expect(res.status).toBe(401)
    })
  }
})
```

- [ ] **Step 4: Correr** → `pnpm --filter @coachlab/api test` PASS.

- [ ] **Step 5: Regenerar el contrato**

```powershell
pnpm dump:openapi
pnpm --filter @coachlab/web generate:api
```

- [ ] **Step 6: Commit**

```bash
git add packages/api packages/web/generated
git commit -m "feat(api): add coach roster routes with 1rm and release"
```

---

### Task 6: API de grupos custom

**Files:**
- Create: `packages/api/src/routes/coach/groups.ts`
- Test: `packages/api/src/routes/coach/groups.test.ts`

- [ ] **Step 1: Las rutas**

| Método | Path | Comportamiento |
|---|---|---|
| GET | `/coach/groups` | Los 2 system (desde `SYSTEM_GROUPS`, con `isSystem: true`) **más** los custom del coach con sus puestos |
| POST | `/coach/groups` | `positionGroupSchema`. Inserta el grupo y sus filas en `position_group_positions` |
| PATCH | `/coach/groups/{groupId}` | Renombra y **reemplaza** los puestos (delete + insert) |
| DELETE | `/coach/groups/{groupId}` | `assertRow` sobre el `.select()` del delete |

Dos cosas que no se negocian:

1. **Los system no son filas.** Un `PATCH`/`DELETE` con `groupId = 'forwards'` no matchea ninguna
   fila (no es un uuid) → 404. Está bien así, pero el schema de path valida uuid, así que ni llega.
2. **Reemplazar puestos no es un `upsert`.** Hay que borrar los que ya no están: si no, sacar un
   puesto de un grupo no tiene efecto. `delete().eq('group_id', id)` y después `insert`.

El GET arma la respuesta mezclando constantes y filas:

```ts
const systemGroups = SYSTEM_GROUPS.map((g) => ({
  id: g.id,
  name: g.name,
  positionIds: [...g.positionIds],
  isSystem: true as const,
}))

const { data, error } = await db
  .from('position_groups')
  .select('id, name, position_group_positions(position_id)')
  .eq('coach_id', actor.id)
  .order('name')
if (error) throw new Error(error.message)

const customGroups = (data ?? []).map((g) => ({
  id: g.id,
  name: g.name,
  positionIds: g.position_group_positions.map((p) => p.position_id as string),
  isSystem: false as const,
}))

return c.json({ ok: true as const, groups: [...systemGroups, ...customGroups] }, 200)
```

- [ ] **Step 2: Tests de guard** — mismo patrón que la Task 5: las 4 rutas sin cookie → 401.

- [ ] **Step 3: Correr, regenerar contrato, commit**

```bash
git add packages/api packages/web/generated
git commit -m "feat(api): add custom position group routes"
```

---

### Task 7: API de programas y del árbol

**Files:**
- Create: `packages/api/src/routes/coach/programs.ts`, `packages/api/src/routes/coach/tree.ts`
- Test: `packages/api/src/routes/coach/programs.test.ts`

- [ ] **Step 1: Rutas del programa**

| Método | Path | Comportamiento |
|---|---|---|
| GET | `/coach/programs` | Los del coach, con conteo de semanas y de assignments |
| POST | `/coach/programs` | Crea el programa **más Semana 1 con Día 1**, y deja `current_week_id` apuntando ahí. Un programa vacío no se puede editar |
| GET | `/coach/programs/{programId}` | **El árbol entero en un request** (ver Step 2) |
| PATCH | `/coach/programs/{programId}` | Renombrar y/o setear `current_week_id` **validando que la semana sea de ese programa** |
| DELETE | `/coach/programs/{programId}` | Una sola línea: el `CASCADE` se lleva semanas, días, bloques, ejercicios y assignments |

- [ ] **Step 2: La lectura del árbol — el select que reemplaza a todo el diseño embebido**

```ts
const { data, error } = await db
  .from('programs')
  .select(
    `id, name, current_week_id,
     weeks(id, name, order_index,
       days(id, name, order_index,
         blocks(id, type, rounds, order_index,
           block_exercises(id, exercise_id, load_type, weight, percentage,
                           sets, reps, target_rpe, order_index,
                           exercises(id, name, normalized_name)))))`,
  )
  .eq('id', programId)
  .order('order_index', { referencedTable: 'weeks' })
  .maybeSingle()

const program = assertRow(data, error)
```

> El `.order(...)` pide el orden de las semanas, pero **el orden real lo garantiza
> `sortByOrderIndex` de `domain/tree`** aplicado en el frontend a cada nivel (`CLAUDE.md` §3: el
> orden nunca sale del orden en que vuelven las filas). Ordenar los niveles anidados desde
> PostgREST requiere un `referencedTable` por nivel y es fácil de olvidar; el helper puro es la
> garantía que no se olvida.

- [ ] **Step 3: CRUD del árbol en `tree.ts`**

Todas verifican pertenencia subiendo por el padre. RLS ya lo hace (capa 1), y `assertRow` convierte
"0 filas" en 404 (capa 4).

| Método | Path | Nota |
|---|---|---|
| POST | `/coach/programs/{programId}/weeks` | `weekSchema` + `order_index` = `nextOrderIndex(existentes)` |
| PATCH | `/coach/weeks/{weekId}` | Renombrar |
| DELETE | `/coach/weeks/{weekId}` | Cascade a días/bloques/ejercicios |
| POST | `/coach/weeks/{weekId}/days` | `daySchema` |
| PATCH/DELETE | `/coach/days/{dayId}` | |
| POST | `/coach/days/{dayId}/blocks` | `blockSchema` |
| PATCH/DELETE | `/coach/blocks/{blockId}` | |
| POST | `/coach/blocks/{blockId}/exercises` | `blockExerciseSchema` |
| PATCH/DELETE | `/coach/block-exercises/{id}` | **La ruta del autosave** |
| PATCH | `/coach/blocks/{blockId}/exercises/reorder` | `reorderSchema` |

> **Por qué las rutas de hijos no repiten el `programId`:** el id de cada fila es un uuid y RLS
> resuelve el ownership subiendo el árbol hasta `can_write_program`. Meter el `programId` en el path
> daría una validación redundante que igual habría que verificar contra la fila — y el riesgo real
> (que alguien toque una fila ajena) ya está cubierto en la base. Lo que **sí** hay que hacer en
> cada una es `assertRow`, o un id ajeno responde 200 con 0 filas afectadas.

El PATCH del autosave, que es la ruta más ejecutada de la app:

```ts
const { data, error } = await db
  .from('block_exercises')
  .update({
    exercise_id: input.exerciseId,
    load_type: input.loadType,
    // Los tres modos son mutuamente excluyentes: se limpian los dos que no van.
    // El CHECK block_exercises_load_shape rechaza cualquier combinación inválida.
    weight: input.loadType === 'WEIGHT' ? input.weight : null,
    percentage: input.loadType === 'PERCENTAGE' ? input.percentage : null,
    sets: input.sets,
    reps: input.reps,
    target_rpe: input.targetRpe ?? null,
  })
  .eq('id', id)
  .select('id')
  .maybeSingle()

assertRow(data, error)
```

**No se permite cambiar `block_id`** (re-parentar): es la trampa #2 del encabezado y además no hay
caso de uso — mover un ejercicio de bloque es borrar y crear.

- [ ] **Step 4: Tests de guard** — todas las rutas nuevas sin cookie → 401. Con el mismo patrón de
tabla de casos de la Task 5, así agregar una ruta y olvidarse del test es difícil.

- [ ] **Step 5: Correr, regenerar contrato, commit**

```bash
git add packages/api packages/web/generated
git commit -m "feat(api): add program crud and tree row routes"
```

---

### Task 8: API de assignments y resolución

**Files:**
- Create: `packages/api/src/routes/coach/assignments.ts`
- Create: `packages/api/src/access/assignments.ts`
- Test: `packages/api/src/access/assignments.test.ts`

- [ ] **Step 1: Los candidatos — la query de `CLAUDE.md` §3**

`packages/api/src/access/assignments.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { systemGroupForPosition } from '@coachlab/core/domain/positions'
import {
  resolveProgram,
  type AssignmentKind,
  type CandidateAssignment,
} from '@coachlab/core/domain/resolveProgram'

type AssignmentRow = {
  id: string
  program_id: string
  player_id: string | null
  position_group_id: string | null
  system_group_id: string | null
  position_id: string | null
  priority: number
  created_at: string
}

/** El destino sale de cuál columna vino no-nula: el CHECK garantiza que es una sola. */
function kindOf(row: AssignmentRow): AssignmentKind {
  if (row.player_id) return 'PLAYER'
  if (row.position_group_id) return 'POSITION_GROUP'
  if (row.system_group_id) return 'SYSTEM_GROUP'
  return 'POSITION'
}

export function toCandidate(row: AssignmentRow): CandidateAssignment {
  return {
    assignmentId: row.id,
    programId: row.program_id,
    kind: kindOf(row),
    priority: row.priority,
    createdAt: new Date(row.created_at),
  }
}

/**
 * Los assignments que le aplican a un jugador. Es la query de CLAUDE.md §3: un
 * OR sobre los cuatro destinos, cada uno con su índice parcial.
 *
 * Los grupos custom que contienen su puesto salen de una subquery previa porque
 * PostgREST no expresa un `in (select ...)` dentro de un `.or()`.
 */
export async function candidateAssignmentsFor(
  db: SupabaseClient,
  player: { id: string; positionId: string | null },
): Promise<CandidateAssignment[]> {
  const systemGroup = systemGroupForPosition(player.positionId)

  let groupIds: string[] = []
  if (player.positionId) {
    const { data } = await db
      .from('position_group_positions')
      .select('group_id')
      .eq('position_id', player.positionId)
    groupIds = (data ?? []).map((r) => r.group_id as string)
  }

  const clauses = [`player_id.eq.${player.id}`]
  if (player.positionId) clauses.push(`position_id.eq.${player.positionId}`)
  if (systemGroup) clauses.push(`system_group_id.eq.${systemGroup.id}`)
  if (groupIds.length > 0) clauses.push(`position_group_id.in.(${groupIds.join(',')})`)

  const { data, error } = await db
    .from('program_assignments')
    .select('id, program_id, player_id, position_group_id, system_group_id, position_id, priority, created_at')
    .or(clauses.join(','))
  if (error) throw new Error(error.message)

  return (data as AssignmentRow[] | null ?? []).map(toCandidate)
}

export async function activeProgramIdFor(
  db: SupabaseClient,
  player: { id: string; positionId: string | null },
): Promise<string | null> {
  return resolveProgram(await candidateAssignmentsFor(db, player))?.programId ?? null
}
```

> **RLS hace el trabajo pesado acá.** La query no filtra por coach: no hace falta, porque
> `program_assignments_select` solo devuelve los de programas que el actor puede leer, y
> `program_reaches_me` (endurecida en `0005`) exige que el programa sea del coach del jugador. Si
> mañana esta query se copia a un contexto con `service_role`, deja de estar protegida — por eso
> nunca se usa `service_role` en un request (`CLAUDE.md` §4).

- [ ] **Step 2: Test de `kindOf`/`toCandidate` (puro, sin base)**

```ts
import { describe, expect, it } from 'vitest'
import { toCandidate } from './assignments'

const base = {
  id: 'a1',
  program_id: 'p1',
  player_id: null,
  position_group_id: null,
  system_group_id: null,
  position_id: null,
  priority: 0,
  created_at: '2026-01-01T00:00:00Z',
}

describe('toCandidate', () => {
  it('deriva PLAYER de player_id', () => {
    expect(toCandidate({ ...base, player_id: 'pl1' }).kind).toBe('PLAYER')
  })

  it('deriva POSITION_GROUP de position_group_id', () => {
    expect(toCandidate({ ...base, position_group_id: 'g1' }).kind).toBe('POSITION_GROUP')
  })

  it('deriva SYSTEM_GROUP de system_group_id', () => {
    expect(toCandidate({ ...base, system_group_id: 'forwards' }).kind).toBe('SYSTEM_GROUP')
  })

  it('deriva POSITION de position_id', () => {
    expect(toCandidate({ ...base, position_id: 'wing' }).kind).toBe('POSITION')
  })

  it('convierte created_at a Date para que el desempate funcione', () => {
    expect(toCandidate({ ...base, position_id: 'wing' }).createdAt).toBeInstanceOf(Date)
  })
})
```

- [ ] **Step 3: Las rutas**

| Método | Path | Comportamiento |
|---|---|---|
| GET | `/coach/programs/{programId}/assignments` | Los del programa, con el nombre del destino resuelto |
| POST | `/coach/programs/{programId}/assignments` | `assignmentSchema` → inserta la columna del destino elegido |
| DELETE | `/coach/assignments/{assignmentId}` | `assertRow` |
| GET | `/coach/assignments/preview` | **Vista previa de impacto**: por cada jugador del plantel, qué programa le queda vigente |

El POST tiene que verificar que el destino sea del coach **además** del trigger de `0006`:

```ts
if (input.playerId) {
  const { data } = await db
    .from('profiles')
    .select('id')
    .eq('id', input.playerId)
    .eq('coach_id', actor.id)
    .maybeSingle()
  assertRow(data)   // 404 si no es de tu plantel
}
if (input.positionGroupId) {
  const { data } = await db
    .from('position_groups')
    .select('id')
    .eq('id', input.positionGroupId)
    .eq('coach_id', actor.id)
    .maybeSingle()
  assertRow(data)
}
```

> Redundante con `guard_assignment_targets` (`0006`) a propósito: el trigger da la garantía, esto da
> el 404 con mensaje en vez de un error de Postgres crudo.

La preview:

```ts
const { data: players, error } = await db
  .from('profiles')
  .select('id, name, position_id')
  .eq('coach_id', actor.id)
  .eq('role', 'PLAYER')
  .order('name')
if (error) throw new Error(error.message)

const rows = await Promise.all(
  (players ?? []).map(async (p) => ({
    playerId: p.id as string,
    name: p.name as string,
    positionId: (p.position_id as string | null) ?? null,
    programId: await activeProgramIdFor(db, {
      id: p.id as string,
      positionId: (p.position_id as string | null) ?? null,
    }),
  })),
)
```

> A 40–60 jugadores son ~2 queries por jugador, una vez que el coach abre la pantalla. A esta escala
> es gratis (`CLAUDE.md` §2: no optimizar prematuramente). Si algún día molesta, el fix es una sola
> query de todos los assignments del coach + resolver en memoria con la misma función pura.

- [ ] **Step 4: Tests de guard + correr + regenerar contrato + commit**

```bash
git add packages/api packages/web/generated
git commit -m "feat(api): add assignments with candidate resolution and impact preview"
```

---

### Task 9: Web — sidebar, plantel y typeahead

**Files:**
- Modify: `packages/web/app/components/AppSidebar.vue`
- Modify: `packages/web/app/pages/coach/players/index.vue`
- Create: `packages/web/app/pages/coach/players/[playerId].vue`
- Create: `packages/web/app/components/ExerciseTypeahead.vue`

- [ ] **Step 1: Sidebar completo**

En F1 el nav del coach tenía solo "Plantel" para no linkear a páginas inexistentes. Ahora:

```ts
const NAV: Record<SessionUser['role'], NavItem[]> = {
  COACH: [
    { to: '/coach/players', label: 'Plantel', icon: 'i-lucide-users' },
    { to: '/coach/groups', label: 'Grupos', icon: 'i-lucide-layout-grid' },
    { to: '/coach/programs', label: 'Programas', icon: 'i-lucide-clipboard-list' },
  ],
  PLAYER: [{ to: '/player/week', label: 'Mi semana', icon: 'i-lucide-calendar-days' }],
  ADMIN: [{ to: '/admin', label: 'Administración', icon: 'i-lucide-shield' }],
}
```

- [ ] **Step 2: `ExerciseTypeahead.vue`** — compartido con F3

Props: `modelValue` (exerciseId o null), `exercises` (catálogo). Filtra con `normName` **del
dominio**, no con una reimplementación:

```ts
import { normName } from '@coachlab/core/domain/normName'

const filtered = computed(() => {
  const q = normName(query.value)
  if (!q) return props.exercises.slice(0, 8)
  return props.exercises.filter((e) => normName(e.name).includes(q)).slice(0, 8)
})
```

Sobre `UInputMenu` de Nuxt UI, agrupado por `category`, navegación con flechas + Enter.

- [ ] **Step 3: Lista de plantel con link a la ficha y desvincular**

Sobre la página de F1: cada jugador es un `NuxtLink` a `/coach/players/{id}`, y un menú con
"Sacar del plantel" que llama `POST /coach/players/{id}/release` con confirmación
(`UModal`) — el texto tiene que decir que **no borra la cuenta**, solo el vínculo, y que el jugador
puede volver a entrar con un código nuevo.

- [ ] **Step 4: Ficha del jugador**

Encabezado con nombre y email. Después:
- `USelect` de puesto con las 8 de `POSITIONS`.
- Inputs de altura y peso, autosave al blur con `useDebouncedSave`.
- Tabla de 1RM: ejercicio, kg, "actualizado el", botón borrar.
- Fila de alta: `ExerciseTypeahead` + input de kg + "Agregar".

- [ ] **Step 5: Probar**

1. Asignar puesto Wing, altura 182, peso 88. Recargar → persiste.
2. Cargar 1RM Press Banca 140; volver a cargar el mismo ejercicio con 145 → **actualiza**, no duplica.
3. Entrar por URL al `playerId` de otro coach → **404**, no 403.
4. `PATCH /api/coach/players/{id}` con `{"role":"ADMIN"}` en el body → el rol **no** cambia.
5. Sacar del plantel → desaparece de la lista y su `coachId` queda null.

- [ ] **Step 6: Commit**

```bash
git add packages/web/app
git commit -m "feat(coach): add roster detail with position, measures and 1rm"
```

---

### Task 10: Web — grupos custom

**Files:**
- Create: `packages/web/app/pages/coach/groups.vue`

- [ ] **Step 1: La pantalla**

Cards con nombre y chips de puestos. Los system llevan badge "Del sistema" y **no** muestran botones
de editar/borrar. "Nuevo grupo" abre un form inline con input de nombre y los 8 checkboxes de
`POSITIONS` agrupados por Forwards/Backs.

- [ ] **Step 2: Probar**

1. Crear "Primeras y Segundas" con dos puestos → aparece con 2 chips.
2. Editarlo agregando un tercero → 3 chips; **sacando** uno → 2 chips (prueba el delete+insert).
3. Forwards y Backs aparecen sin botones de edición.
4. Crear otro grupo con el mismo nombre → error claro (`UNIQUE (coach_id, name)`).

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/pages/coach/groups.vue
git commit -m "feat(coach): add custom position group screen"
```

---

### Task 11: Web — editor de programas con autosave

**Files:**
- Create: `packages/web/app/composables/useDebouncedSave.ts`
- Create: `packages/web/app/pages/coach/programs/index.vue`
- Create: `packages/web/app/pages/coach/programs/[programId].vue` (padre)
- Create: `packages/web/app/pages/coach/programs/[programId]/index.vue` (editor)
- Create: `packages/web/app/components/program/{WeekTabs,DayColumn,BlockCard,ExerciseRow}.vue`

- [ ] **Step 1: `useDebouncedSave`**

```ts
export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Autosave con debounce. Devuelve `flush` para forzar el guardado pendiente
 * (por ejemplo al desmontar o antes de navegar): sin eso, la última tecla
 * escrita se pierde si el usuario cambia de pantalla antes del delay.
 */
export function useDebouncedSave<T>(
  save: (value: T) => Promise<void>,
  delayMs = 800,
) {
  const state = ref<SaveState>('idle')
  const error = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: T | null = null

  async function run(value: T) {
    state.value = 'saving'
    try {
      await save(value)
      state.value = 'saved'
      error.value = null
    } catch (e) {
      state.value = 'error'
      error.value = e instanceof Error ? e.message : 'No se pudo guardar'
    }
  }

  function trigger(value: T) {
    pending = value
    if (timer) clearTimeout(timer)
    state.value = 'saving'
    timer = setTimeout(() => {
      timer = null
      const value = pending
      pending = null
      if (value !== null) void run(value)
    }, delayMs)
  }

  async function flush() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    const value = pending
    pending = null
    if (value !== null) await run(value)
  }

  onScopeDispose(() => {
    if (timer) clearTimeout(timer)
  })

  return { trigger, flush, state, error }
}
```

- [ ] **Step 2: Listado de programas**

Cards con nombre, "N semanas", "N asignaciones", fecha. Botón "Nuevo programa" (pide nombre y hace
`POST`, que ya crea Semana 1 / Día 1) y menú con renombrar y borrar (confirmación que diga que
borra semanas, días y asignaciones).

- [ ] **Step 3: El padre con tabs**

`[programId].vue` carga el programa **una vez** (`GET /coach/programs/{id}`), muestra el nombre
editable inline y tres tabs (Editor / Asignaciones / Import) y renderiza `<NuxtPage />`.
Pasa el programa a las hijas por `provide`/`inject` para que cambiar de tab no lo vuelva a pedir.

> Esto es lo contrario de lo que se hizo en `players` a propósito (`CLAUDE.md` §5): ahí listado y
> detalle no comparten nada y van como hermanas; acá las tres vistas comparten programa y
> encabezado.

- [ ] **Step 4: El editor**

Tres niveles, todos ordenados con `sortByOrderIndex`:
- **Tabs de semanas** (`WeekTabs`): nombre editable inline; la que es `current_week_id` lleva badge
  "Semana actual", las demás un botón "Marcar como actual". "+ Semana" al final.
- **Columnas de días** (`DayColumn`) de la semana activa, cada una con "+ Bloque" (SINGLE o CIRCUIT).
- **Bloques** (`BlockCard`): un CIRCUIT muestra input de vueltas. Lista sus filas y tiene
  "+ Ejercicio".

Mutación optimista + revert con toast si la ruta falla. Indicador global "Guardando… / Guardado /
Error al guardar" arriba a la derecha, alimentado por el `state` del composable.

- [ ] **Step 5: `ExerciseRow` con carga dinámica**

| Campo | Control |
|---|---|
| Ejercicio | `ExerciseTypeahead` |
| Series | number 1–20 |
| Reps | text — acepta "10", "8-10", "AMRAP" |
| Modo de carga | Select: "Kg" / "% del 1RM" / "Sin peso" |
| Carga | **condicional** según el modo |
| RPE objetivo | number 1–10 (medio punto permitido), opcional |

Al cambiar de modo hay que **limpiar el campo del modo anterior antes de guardar**. Si no, el
`CHECK block_exercises_load_shape` rechaza el update y el autosave falla en silencio:

```ts
function onLoadTypeChange(next: LoadType) {
  const cleaned = { ...row.value, loadType: next, weight: null, percentage: null }
  row.value = cleaned
  trigger(cleaned)
}
```

- [ ] **Step 6: Probar**

1. Bloque SINGLE con "Press Banca", 4×5, "% del 1RM" 80, RPE 8. Recargar → persiste.
2. Cambiar a "Kg" 100. Recargar → `percentage` quedó null y `weight` 100.
3. Bloque CIRCUIT con 3 vueltas y dos ejercicios. Recargar → persiste.
4. Agregar Semana 2 y marcarla actual → el badge se mueve.
5. Borrar un día → se van sus bloques y ejercicios, y el resto del árbol queda intacto.
6. Editor de un programa de otro coach por URL → **404**.
7. Escribir en un campo y navegar de tab inmediatamente → el `flush` guarda igual.

- [ ] **Step 7: Commit**

```bash
git add packages/web/app
git commit -m "feat(coach): add program editor with debounced autosave"
```

---

### Task 12: Web — assignments con vista previa

**Files:**
- Create: `packages/web/app/pages/coach/programs/[programId]/assign.vue`

- [ ] **Step 1: La pantalla**

- **Form de alta**: select "Asignar a" con cuatro modos (Jugador / Puesto / Grupo del sistema /
  Grupo custom) que cambia el segundo select; input "prioridad extra" con default 0 y ayuda inline
  con las bases (100 / 50 / 30 / 10).
- **Tabla**: destino, tipo, `base + override = total`, botón borrar.
- **Vista previa de impacto**: la lista del plantel con el programa vigente de cada jugador según
  `GET /coach/assignments/preview`, resaltando los que quedan con **este** programa. Es lo que evita
  que el coach descubra un conflicto de prioridades recién cuando un jugador se queja.

- [ ] **Step 2: Probar la resolución completa, los 4 niveles**

Con dos programas (A y B) y un jugador Wing:

1. A al puesto Wing → la preview muestra **A** (10).
2. B al grupo system Backs → pasa a **B** (30 > 10).
3. Grupo custom con Wing, asignarle A → vuelve a **A** (50 > 30).
4. B al jugador directo → **B** (100 > 50).
5. Prioridad extra 60 al de puesto (70) → sigue **B**.
6. Prioridad extra 200 al de puesto (210) → pasa a **A**.
7. Asignar a un jugador de otro coach por API → **404** (el trigger de `0006` además lo bloquea).

- [ ] **Step 3: Commit**

```bash
git add packages/web/app/pages/coach/programs
git commit -m "feat(coach): add program assignments with impact preview"
```

---

### Task 13: Import de Excel y texto

⚠ **NECESITA PROTOTIPO** — leer la sección del encabezado antes de empezar.

**Files:**
- Create: `packages/core/src/validators/parsedProgram.ts`
- Create: `packages/core/src/domain/parseText.ts`, `parseGrid.ts` (+ tests)
- Create: `packages/api/src/routes/coach/import.ts`
- Create: `packages/web/app/pages/coach/programs/[programId]/import.vue`

- [ ] **Step 1: Contrato compartido**

`packages/core/src/validators/parsedProgram.ts` — es **schema Zod y tipo a la vez**, porque el
cliente parsea y **el server no confía**:

```ts
import { z } from 'zod'

export const parsedExerciseSchema = z.object({
  exerciseName: z.string().trim().min(2).max(120),
  sets: z.number().int().min(1).max(20),
  reps: z.string().trim().min(1).max(20),
  loadType: z.enum(['WEIGHT', 'PERCENTAGE', 'NONE']),
  weight: z.number().positive().max(500).nullable(),
  percentage: z.number().int().min(1).max(100).nullable(),
  targetRpe: z.number().min(1).max(10).nullable(),
})

export const parsedBlockSchema = z.object({
  type: z.enum(['SINGLE', 'CIRCUIT']),
  rounds: z.number().int().min(1).max(20).nullable(),
  exercises: z.array(parsedExerciseSchema),
})

export const parsedDaySchema = z.object({
  name: z.string().trim().min(1).max(60),
  blocks: z.array(parsedBlockSchema),
})

export const parsedWeekSchema = z.object({
  name: z.string().trim().min(1).max(60),
  days: z.array(parsedDaySchema),
})

export const parseIssueSchema = z.object({ row: z.number().int().min(1), message: z.string() })

export const parsedProgramSchema = z.object({
  weeks: z.array(parsedWeekSchema),
  /** Filas que no se pudieron interpretar. El import se aplica igual, salteándolas. */
  issues: z.array(parseIssueSchema),
})

export type ParsedExercise = z.infer<typeof parsedExerciseSchema>
export type ParsedBlock = z.infer<typeof parsedBlockSchema>
export type ParsedDay = z.infer<typeof parsedDaySchema>
export type ParsedWeek = z.infer<typeof parsedWeekSchema>
export type ParseIssue = z.infer<typeof parseIssueSchema>
export type ParsedProgram = z.infer<typeof parsedProgramSchema>
```

- [ ] **Step 2: Formato asumido**

**Texto (`parseText`)** — una línea por ejercicio, con encabezados de sección:

```
Semana 1
Día 1
# Bloque circuito x3
Press Banca 4x5 @80% RPE8
Remo con Barra 3x10 @60kg
Plancha 3x30s
```

`Semana N` / `Día N` abren sección; una línea que empieza con `#` abre bloque (con `x3` → CIRCUIT de
3 vueltas, sin `x` → SINGLE); el resto es `<nombre> <sets>x<reps> [@carga] [RPE<n>]`.

**Excel (`parseGrid`)** — primera fila de encabezados, columnas por nombre (case-insensitive vía
`normName`): `semana`, `dia`, `bloque`, `vueltas`, `ejercicio`, `series`, `reps`, `carga`, `rpe`.
La columna `carga`: `"80%"` → PERCENTAGE 80; `"100"` / `"100kg"` → WEIGHT 100; vacío o `"-"` → NONE.

- [ ] **Step 3: Tests de `parseText` primero**

```ts
import { describe, expect, it } from 'vitest'
import { parseText } from './parseText'

const first = (input: string) => parseText(input).weeks[0]!.days[0]!.blocks[0]!

describe('parseText', () => {
  it('devuelve un programa vacío con entrada vacía', () => {
    expect(parseText('')).toEqual({ weeks: [], issues: [] })
  })

  it('parsea un ejercicio con porcentaje y RPE', () => {
    expect(first('Semana 1\nDía 1\nPress Banca 4x5 @80% RPE8').exercises[0]!).toEqual({
      exerciseName: 'Press Banca',
      sets: 4,
      reps: '5',
      loadType: 'PERCENTAGE',
      weight: null,
      percentage: 80,
      targetRpe: 8,
    })
  })

  it('parsea kg fijos', () => {
    const e = first('Semana 1\nDía 1\nRemo con Barra 3x10 @60kg').exercises[0]!
    expect(e.loadType).toBe('WEIGHT')
    expect(e.weight).toBe(60)
    expect(e.percentage).toBeNull()
  })

  it('sin carga usa NONE y conserva reps con unidad', () => {
    const e = first('Semana 1\nDía 1\nPlancha 3x30s').exercises[0]!
    expect(e.loadType).toBe('NONE')
    expect(e.reps).toBe('30s')
  })

  it('acepta rangos de reps', () => {
    expect(first('Semana 1\nDía 1\nSentadilla 4x8-10').exercises[0]!.reps).toBe('8-10')
  })

  it('abre un circuito con # y x<n>', () => {
    const b = first('Semana 1\nDía 1\n# Core circuito x3\nPlancha 3x30s')
    expect(b.type).toBe('CIRCUIT')
    expect(b.rounds).toBe(3)
  })

  it('un # sin x abre un bloque simple', () => {
    const b = first('Semana 1\nDía 1\n# Fuerza\nSentadilla 4x5')
    expect(b.type).toBe('SINGLE')
    expect(b.rounds).toBeNull()
  })

  it('acepta "Dia" sin tilde', () => {
    expect(parseText('Semana 1\nDia 2\nPlancha 3x30s').weeks[0]!.days[0]!.name).toBe('Día 2')
  })

  it('agrupa varias semanas y días', () => {
    const r = parseText('Semana 1\nDía 1\nPlancha 3x30s\nDía 2\nSentadilla 4x5\nSemana 2\nDía 1\nRemo 3x10')
    expect(r.weeks).toHaveLength(2)
    expect(r.weeks[0]!.days).toHaveLength(2)
    expect(r.weeks[1]!.days).toHaveLength(1)
  })

  it('ignora líneas en blanco', () => {
    const r = parseText('Semana 1\n\nDía 1\n\nPlancha 3x30s\n\n')
    expect(r.issues).toHaveLength(0)
    expect(r.weeks[0]!.days[0]!.blocks[0]!.exercises).toHaveLength(1)
  })

  it('reporta una línea sin sets x reps como issue con su número de fila', () => {
    const r = parseText('Semana 1\nDía 1\nPress Banca')
    expect(r.issues).toHaveLength(1)
    expect(r.issues[0]!.row).toBe(3)
  })

  it('reporta un ejercicio antes de cualquier Semana', () => {
    const r = parseText('Press Banca 4x5')
    expect(r.weeks).toHaveLength(0)
    expect(r.issues[0]!.message).toContain('Semana')
  })

  it('un ejercicio sin bloque explícito crea un bloque simple', () => {
    expect(first('Semana 1\nDía 1\nSentadilla 4x5').type).toBe('SINGLE')
  })

  it('el resultado pasa parsedProgramSchema', async () => {
    const { parsedProgramSchema } = await import('../validators/parsedProgram')
    const r = parseText('Semana 1\nDía 1\n# Circuito x3\nPress Banca 4x5 @80% RPE8')
    expect(parsedProgramSchema.safeParse(r).success).toBe(true)
  })
})
```

- [ ] **Step 4: Correr (FAIL), implementar `parseText` usando `normName` para reconocer
`semana`/`dia` con y sin tilde, correr (PASS).**

- [ ] **Step 5: Tests e implementación de `parseGrid`**

Firma `parseGrid(rows: unknown[][]): ParsedProgram` — recibe la matriz que devuelve
`XLSX.utils.sheet_to_json(sheet, { header: 1 })`, así queda **pura y testeable sin archivos**.
Casos mínimos: encabezados en cualquier orden; falta la columna `ejercicio` → issue en fila 1 y
`weeks: []`; celda numérica vs. string en `series`; `carga` en los 3 formatos; filas totalmente
vacías salteadas sin issue; una fila con `semana`/`dia` repetidos agrupa en la misma sección.

- [ ] **Step 6: SheetJS en el frontend**

```powershell
pnpm --filter @coachlab/web add xlsx
```

Corre en el browser, igual que el prototipo: **el archivo no sube al servidor** (`CLAUDE.md` §2).

- [ ] **Step 7: Ruta de import**

`POST /coach/programs/{programId}/import` recibe un `ParsedProgram` y lo **revalida** con
`parsedProgramSchema`. Comportamiento:

1. Verificar el programa con `assertRow`.
2. Por cada `exerciseName` único: `db.rpc('ensure_exercise', { p_name, p_normalized: normName(name) })`
   (migración `0008`). Devuelve el id exista o no, y la ruta acumula cuáles se crearon para avisarle
   al coach.
3. **Reemplazar** las semanas: `delete().eq('program_id', programId)` en `weeks` (el CASCADE se
   lleva días, bloques y ejercicios) y escribir las nuevas con `order_index` secuencial.
4. `current_week_id` a la primera semana nueva.

Es un **reemplazo, no un merge**, y la pantalla lo tiene que decir antes de confirmar.

> **Por qué no es transaccional:** PostgREST no expone transacciones multi-request. Si el import se
> corta a mitad, el programa queda con las semanas nuevas parciales. Es aceptable porque el coach ve
> el resultado inmediatamente y puede reimportar, y la alternativa (una función SQL que reciba el
> árbol entero como JSON) mete la construcción del árbol en SQL, que es justo lo que `CLAUDE.md` §3
> evita. Queda anotado como deuda: si molesta, va como RPC `import_program(jsonb)`.

- [ ] **Step 8: Pantalla**

Dos pestañas: "Pegar texto" (textarea) y "Subir Excel" (`accept=".xlsx,.xls"`). Vista previa del
árbol resultante y lista de `issues` con su número de fila. Botón "Reemplazar programa"
deshabilitado si `weeks.length === 0`, con confirmación explícita que diga que **borra el contenido
actual**. Toast final con "N semanas, N días, N ejercicios" y, si hubo, "Se agregaron al catálogo: …".

- [ ] **Step 9: Probar**

1. Pegar el ejemplo del Step 2 → vista previa con 1 semana, 1 día, circuito de 3 vueltas, 3 ejercicios.
2. Confirmar → el editor muestra ese árbol.
3. Subir un `.xlsx` con esas columnas → mismo resultado.
4. Importar "Remo Pendlay" (inexistente) → se crea en el catálogo y el toast lo avisa.
5. Reimportar sobre un programa que ya tenía semanas → las reemplaza, no las duplica.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(coach): add excel and text program import"
```

---

### Task 14: Cierre de fase

- [ ] **Step 1: Auditoría**

Dispatch `rbac-auditor` sobre `packages/api/src/routes/coach/` y `packages/api/src/access/`. Foco:
que **toda** ruta de escritura use `assertRow` (o un recurso ajeno responde 200 con 0 filas), que el
PATCH de perfil escriba campo por campo, que `POST /assignments` valide el destino, y que la ruta de
import no use `service_role`.

- [ ] **Step 2: Checks en vivo**

Agregar a `scripts/verify-setup.mjs`, con sesiones reales:
- Un coach no ve ni edita un programa de otro coach (404, no 403).
- Un `PATCH` de perfil con `role: 'ADMIN'` no cambia el rol.
- Un assignment a un jugador ajeno falla.
- El árbol se borra en cascada al borrar el programa.

```powershell
pnpm verify:setup
```

- [ ] **Step 3: Suite completa**

```powershell
pnpm lint; if ($?) { pnpm typecheck }
pnpm test
```

- [ ] **Step 4: Marcar la fase y documentar**

1. `CLAUDE.md` §6: `- [x] **F2 — Panel coach**: …`
2. Escribir `docs/IMPLEMENTATION-F2.md` con el formato de F0/F1.
3. Si la Task 13 corrió con el formato asumido, agregar bajo §6 de `CLAUDE.md`:

```markdown
> **Pendiente de validación:** el formato de import Excel/texto se implementó sin `coach.html` a la vista. Confirmar contra el prototipo o con un coach real antes de F4.
```

4. En `docs/superpowers/plans/2026-07-27-f2-coach-panel.md`, poner al tope:
   `> **OBSOLETO — reemplazado por 2026-07-28-f2-coach-panel.md tras el cambio de stack. Se conserva como registro.**`

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs scripts
git commit -m "docs: mark F2 complete"
```

---

## Definición de terminado

- El coach edita puesto/medidas/1RM de su plantel, y saca un jugador del plantel sin borrar su cuenta.
- No ve plantel ni programas ajenos: **404**, nunca 403 ni una lista vacía confusa.
- Un `PATCH` de perfil con `role` en el body no escala privilegios.
- Crea grupos custom; Forwards/Backs aparecen de solo lectura.
- Construye un programa con los 3 modos de carga y RPE objetivo, con autosave que no pierde la
  última tecla al navegar.
- Cambiar de modo de carga limpia el campo anterior y el `CHECK` de la base nunca rechaza un update.
- Asigna con prioridad y la vista previa muestra los 4 niveles resolviéndose correctamente.
- Importa un programa desde texto y desde Excel, creando en el catálogo lo que falte.
- `pnpm verify:setup` en verde con los checks nuevos.
- `rbac-auditor` sin hallazgos abiertos.
- `pnpm lint && pnpm typecheck && pnpm test` en verde.
