# F2 — Panel del coach Implementation Plan

> **OBSOLETO — reemplazado por `2026-07-28-f2-coach-panel.md`, que ya fue ejecutado (ver `docs/IMPLEMENTATION-F2.md`). Se conserva como registro.**

> ## ⚠ PARCIALMENTE OBSOLETO — cambio de stack del 2026-07-27
>
> Este plan se escribió contra **AWS + DynamoDB + ElectroDB + JWT propio**, stack que se
> descartó a mitad de F0. Las razones están en `CLAUDE.md` §1 ("Historial de stack").
>
> **Qué sigue siendo válido:** todo lo que describe *comportamiento de producto* — pantallas,
> flujos, textos de UI, reglas de negocio, criterios de aceptación y casos borde. Esa parte
> es la que costó pensar y no cambió.
>
> **Qué NO usar:** cualquier paso que mencione ElectroDB, entidades, `pk`/`sk`, GSI1/GSI2,
> `TransactWrite`, items de unicidad, `Resource`, SST, Lambda, argon2 o el JWT propio.
> El equivalente actual está en `CLAUDE.md` §3 (tablas y `CHECK`) y §4 (RLS + 5 capas).
>
> **Antes de ejecutar esta fase:** regenerar el plan contra el stack vigente. Es más barato
> y más confiable que parchear los pasos de abajo uno por uno.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un coach gestione su plantel (puesto, medidas, 1RM), arme grupos custom, construya un
programa completo (semanas → días → bloques → ejercicios con los 3 modos de carga y RPE objetivo), lo
asigne a jugadores/puestos/grupos con prioridad, y pueda cargar un programa entero desde Excel o texto.

**Architecture:** El árbol del programa vive embebido dentro del item `Week` (CLAUDE.md §3), así que el
editor lee una semana con un `GetItem` y el autosave escribe una ruta anidada estable
(`SET days.#d.blocks.#b.exercises.#e.percentage = :v`) sin reescribir el item entero. `resolveProgram`
sigue siendo una función pura que recibe candidatos ya cargados; quien los carga es una query a GSI2
con hasta 4 `targetKey`.

**Tech Stack:** ElectroDB (updates anidados, GSI2), Hono + Zod OpenAPI, Nuxt UI, SheetJS, Vitest.

**Precondición:** F1 mergeado en `main`.

---

## ⚠ NECESITA PROTOTIPO

La Task 10 (import Excel/texto) depende del formato exacto que aceptaba `coach.html`, que **no está en
el repo**. El plan define un contrato de tipos (`ParsedProgram`) que no va a cambiar, y un formato de
entrada **asumido** que sí puede cambiar. Antes de ejecutar la Task 10:

1. Restaurar `coach.html` y `README-CoachLab.md` en la raíz del repo.
2. Dispatch `spec-navigator`: *"¿Qué columnas exactas espera `parseGrid` y qué formato de línea espera
   `parseText`? Dame 2 ejemplos reales de cada uno."*
3. Reemplazar los tests de la Task 10 por los del formato real. La firma de las funciones y
   `ParsedProgram` se mantienen.

Si el prototipo no aparece, la Task 10 corre con el formato asumido y queda marcada como pendiente de
validación con un coach real. Las Tasks 1–9 no dependen de esto.

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `packages/core/src/domain/resolveProgram.ts` | Decide qué programa le toca a un jugador |
| `packages/core/src/domain/tree.ts` | Ordenar y recorrer los maps embebidos del árbol |
| `packages/core/src/domain/parsedProgram.ts` | Tipos compartidos por los parsers |
| `packages/core/src/domain/parseGrid.ts` / `parseText.ts` | Import |
| `packages/core/src/entities/program.ts` | `Program`, `Week` |
| `packages/core/src/entities/assignment.ts` | `ProgramAssignment` con GSI2 |
| `packages/core/src/entities/group.ts` | `PositionGroup` custom |
| `packages/core/src/entities/oneRm.ts` | `OneRM` |
| `packages/core/src/access/programs.ts` | `scopedProgram`, candidatos de assignment |
| `packages/core/src/validators/program.ts` | Zod del árbol + coherencia LoadType |
| `packages/api/src/routes/coach/*.ts` | players, groups, programs, assignments, import |
| `packages/web/app/pages/coach/**` | Pantallas |

---

### Task 1: `resolveProgram`

La regla de negocio más importante de `CLAUDE.md` §3. Vive en un solo lugar y tiene tests.

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
    expect(BASE_PRIORITY.GROUP_CUSTOM).toBe(50)
    expect(BASE_PRIORITY.GROUP_SYSTEM).toBe(30)
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
        candidate({ assignmentId: 'g', kind: 'GROUP_CUSTOM', programId: 'grupo' }),
        candidate({ assignmentId: 'i', kind: 'PLAYER', programId: 'individual' }),
      ])?.programId,
    ).toBe('individual')
  })

  it('grupo custom le gana a grupo system', () => {
    expect(
      resolveProgram([
        candidate({ assignmentId: 's', kind: 'GROUP_SYSTEM', programId: 'forwards' }),
        candidate({ assignmentId: 'c', kind: 'GROUP_CUSTOM', programId: 'primeras' }),
      ])?.programId,
    ).toBe('primeras')
  })

  it('grupo system le gana a puesto', () => {
    expect(
      resolveProgram([
        candidate({ assignmentId: 'p', kind: 'POSITION', programId: 'puesto' }),
        candidate({ assignmentId: 's', kind: 'GROUP_SYSTEM', programId: 'system' }),
      ])?.programId,
    ).toBe('system')
  })

  it('respeta los 4 niveles a la vez', () => {
    expect(
      resolveProgram([
        candidate({ assignmentId: '1', kind: 'POSITION', programId: 'puesto' }),
        candidate({ assignmentId: '2', kind: 'GROUP_SYSTEM', programId: 'system' }),
        candidate({ assignmentId: '3', kind: 'GROUP_CUSTOM', programId: 'custom' }),
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
        candidate({ assignmentId: 'v', kind: 'PLAYER', programId: 'viejo', createdAt: at('2026-01-01T00:00:00Z') }),
        candidate({ assignmentId: 'n', kind: 'PLAYER', programId: 'nuevo', createdAt: at('2026-06-01T00:00:00Z') }),
      ])?.programId,
    ).toBe('nuevo')
  })

  it('el empate desempata por fecha aun entre kinds distintos con el mismo score', () => {
    expect(
      resolveProgram([
        candidate({
          assignmentId: 'a',
          kind: 'GROUP_SYSTEM', // 30 + 20 = 50
          priority: 20,
          programId: 'system-boosteado',
          createdAt: at('2026-03-01T00:00:00Z'),
        }),
        candidate({
          assignmentId: 'b',
          kind: 'GROUP_CUSTOM', // 50 + 0 = 50
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

- [ ] **Step 2: Correr para ver que falla** → FAIL.

- [ ] **Step 3: Implementar**

`packages/core/src/domain/resolveProgram.ts`:

```ts
export type AssignmentKind = 'PLAYER' | 'GROUP_CUSTOM' | 'GROUP_SYSTEM' | 'POSITION'

/** CLAUDE.md §3: individual pisa grupo custom, pisa grupo system, pisa puesto. */
export const BASE_PRIORITY: Record<AssignmentKind, number> = {
  PLAYER: 100,
  GROUP_CUSTOM: 50,
  GROUP_SYSTEM: 30,
  POSITION: 10,
}

export type CandidateAssignment = {
  assignmentId: string
  programId: string
  kind: AssignmentKind
  /** Override que define el coach por assignment. Se suma a la base. */
  priority: number
  createdAt: Date
}

export function scoreOf(candidate: CandidateAssignment): number {
  return BASE_PRIORITY[candidate.kind] + candidate.priority
}

/**
 * Elige el assignment vigente entre los que le aplican a un jugador.
 * Gana el score más alto; ante empate, el createdAt más reciente.
 * Pura: los candidatos los arma access/programs.ts.
 */
export function resolveProgram(candidates: CandidateAssignment[]): CandidateAssignment | null {
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

- [ ] **Step 4: Correr para ver que pasa** → PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git checkout -b feature/f2-coach-panel
git add packages/core/src/domain/resolveProgram*
git commit -m "feat(domain): add resolveProgram with 4-level assignment priority"
```

---

### Task 2: Helpers del árbol embebido

Los días, bloques y ejercicios son maps indexados por id. Todo el resto del código los va a querer
ordenados, y esa conversión tiene que estar en un solo lugar.

**Files:**
- Create: `packages/core/src/domain/tree.ts`
- Test: `packages/core/src/domain/tree.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { describe, expect, it } from 'vitest'
import { nextOrder, ordered, reindex } from './tree'

const map = {
  b: { order: 2, name: 'segundo' },
  a: { order: 1, name: 'primero' },
  c: { order: 3, name: 'tercero' },
}

describe('ordered', () => {
  it('ordena por el campo order, no por la clave', () => {
    expect(ordered(map).map((x) => x.name)).toEqual(['primero', 'segundo', 'tercero'])
  })

  it('adjunta el id de cada entrada', () => {
    expect(ordered(map).map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('con map vacío devuelve array vacío', () => {
    expect(ordered({})).toEqual([])
  })

  it('desempata por id cuando dos comparten order', () => {
    const tie = { z: { order: 1 }, a: { order: 1 } }
    expect(ordered(tie).map((x) => x.id)).toEqual(['a', 'z'])
  })
})

describe('nextOrder', () => {
  it('devuelve el máximo más uno', () => {
    expect(nextOrder(map)).toBe(4)
  })

  it('devuelve 0 con map vacío', () => {
    expect(nextOrder({})).toBe(0)
  })

  it('no se rompe con un hueco en la secuencia', () => {
    expect(nextOrder({ a: { order: 0 }, b: { order: 7 } })).toBe(8)
  })
})

describe('reindex', () => {
  it('renumera de 0 en adelante respetando el orden actual', () => {
    expect(reindex(map)).toEqual({ a: 0, b: 1, c: 2 })
  })

  it('con map vacío devuelve objeto vacío', () => {
    expect(reindex({})).toEqual({})
  })
})
```

- [ ] **Step 2: Correr para ver que falla** → FAIL.

- [ ] **Step 3: Implementar**

`packages/core/src/domain/tree.ts`:

```ts
export type Ordered = { order: number }

export type WithId<T> = T & { id: string }

/**
 * Convierte un map embebido en una lista ordenada.
 * El orden NUNCA sale del orden de claves del map (CLAUDE.md §3): sale del campo `order`.
 * Empates por id, para que el resultado sea determinístico.
 */
export function ordered<T extends Ordered>(map: Record<string, T>): WithId<T>[] {
  return Object.entries(map)
    .map(([id, value]) => ({ ...value, id }))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

/** El `order` que le toca a un hermano nuevo. */
export function nextOrder<T extends Ordered>(map: Record<string, T>): number {
  const orders = Object.values(map).map((v) => v.order)
  return orders.length === 0 ? 0 : Math.max(...orders) + 1
}

/** Renumera 0..n-1 respetando el orden actual. Devuelve id → nuevo order. */
export function reindex<T extends Ordered>(map: Record<string, T>): Record<string, number> {
  const result: Record<string, number> = {}
  ordered(map).forEach((item, index) => {
    result[item.id] = index
  })
  return result
}
```

- [ ] **Step 4: Correr para ver que pasa** → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/tree*
git commit -m "feat(domain): add ordering helpers for embedded tree maps"
```

---

### Task 3: Validadores del programa

`CLAUDE.md` §3 exige la coherencia de LoadType en Zod, no solo en la UI.

**Files:**
- Create: `packages/core/src/validators/program.ts`
- Test: `packages/core/src/validators/program.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { describe, expect, it } from 'vitest'
import { assignmentSchema, blockExerciseSchema, programSchema } from './program'

const base = { exerciseId: 'e1', sets: 4, reps: '8', order: 0 }

describe('blockExerciseSchema', () => {
  it('WEIGHT con weight es válido', () => {
    expect(blockExerciseSchema.safeParse({ ...base, loadType: 'WEIGHT', weight: 80 }).success).toBe(true)
  })

  it('WEIGHT sin weight falla', () => {
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

  it('PERCENTAGE sin percentage falla', () => {
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

  it('targetRpe fuera de 1..10 falla', () => {
    expect(blockExerciseSchema.safeParse({ ...base, loadType: 'NONE', targetRpe: 11 }).success).toBe(false)
  })

  it('reps vacío falla', () => {
    expect(blockExerciseSchema.safeParse({ ...base, reps: '', loadType: 'NONE' }).success).toBe(false)
  })
})

describe('programSchema', () => {
  it('acepta un nombre válido', () => {
    expect(programSchema.safeParse({ name: 'Mesociclo 1' }).success).toBe(true)
  })

  it('rechaza nombre vacío', () => {
    expect(programSchema.safeParse({ name: '  ' }).success).toBe(false)
  })
})

describe('assignmentSchema', () => {
  it('acepta exactamente un target', () => {
    expect(assignmentSchema.safeParse({ playerId: 'pl1', priority: 0 }).success).toBe(true)
  })

  it('rechaza dos targets a la vez', () => {
    expect(assignmentSchema.safeParse({ playerId: 'pl1', positionId: 'wing', priority: 0 }).success).toBe(false)
  })

  it('rechaza cero targets', () => {
    expect(assignmentSchema.safeParse({ priority: 0 }).success).toBe(false)
  })

  it('rechaza un positionId que no es una de las 8', () => {
    expect(assignmentSchema.safeParse({ positionId: 'hooker', priority: 0 }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Correr para ver que falla** → FAIL.

- [ ] **Step 3: Implementar**

`packages/core/src/validators/program.ts`:

```ts
import { z } from 'zod'
import { isPositionId } from '../domain/positions'

export const programSchema = z.object({
  name: z.string().trim().min(1, 'Poné un nombre').max(120),
})

export const weekSchema = z.object({
  name: z.string().trim().min(1, 'Poné un nombre').max(60),
  order: z.number().int().min(0),
})

export const daySchema = weekSchema

export const blockSchema = z
  .object({
    type: z.enum(['SINGLE', 'CIRCUIT']),
    rounds: z.number().int().min(1).max(20).nullish(),
    order: z.number().int().min(0),
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

/** CLAUDE.md §3, "Coherencia LoadType": validado acá, no solo en la UI. */
export const blockExerciseSchema = z
  .object({
    exerciseId: z.string().min(1, 'Elegí un ejercicio'),
    sets: z.number().int().min(1, 'Mínimo 1 serie').max(20),
    reps: z.string().trim().min(1, 'Poné las repeticiones').max(20),
    loadType: z.enum(['WEIGHT', 'PERCENTAGE', 'NONE']),
    weight: z.number().positive('El peso tiene que ser mayor a 0').max(500).nullish(),
    percentage: z.number().int().min(1).max(100).nullish(),
    targetRpe: z.number().int().min(1).max(10).nullish(),
    note: z.string().trim().max(500).nullish(),
    order: z.number().int().min(0),
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

export const assignmentSchema = z
  .object({
    playerId: z.string().min(1).nullish(),
    positionId: z.string().refine(isPositionId, 'Puesto inválido').nullish(),
    positionGroupId: z.string().min(1).nullish(),
    priority: z.number().int().min(-100).max(500).default(0),
  })
  .superRefine((data, ctx) => {
    const targets = [data.playerId, data.positionId, data.positionGroupId].filter(Boolean)
    if (targets.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['playerId'],
        message: 'Elegí exactamente un destino: jugador, puesto o grupo',
      })
    }
  })

export type AssignmentInput = z.infer<typeof assignmentSchema>
```

- [ ] **Step 4: Correr para ver que pasa** → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/validators/program*
git commit -m "feat(validators): add program schemas with loadtype coherence rules"
```

---

### Task 4: Entidades del programa

**Files:**
- Create: `packages/core/src/entities/program.ts`, `assignment.ts`, `group.ts`, `oneRm.ts`
- Modify: `packages/core/src/entities/index.ts`

- [ ] **Step 1: `Program` y `Week`**

```ts
import { Entity } from 'electrodb'
import { entityConfig } from './client'

export const ProgramEntity = new Entity(
  {
    model: { entity: 'program', version: '1', service: 'coachlab' },
    attributes: {
      programId: { type: 'string', required: true },
      coachId: { type: 'string', required: true },
      name: { type: 'string', required: true },
      currentWeekId: { type: 'string' },
      createdAt: { type: 'string', required: true, readOnly: true, default: () => new Date().toISOString() },
      updatedAt: { type: 'string', required: true, default: () => new Date().toISOString(), set: () => new Date().toISOString() },
    },
    indexes: {
      byId: {
        pk: { field: 'pk', composite: ['programId'] },
        sk: { field: 'sk', composite: [] },
      },
      byCoach: {
        index: 'gsi1',
        pk: { field: 'gsi1pk', composite: ['coachId'] },
        sk: { field: 'gsi1sk', composite: ['programId'] },
      },
    },
  },
  entityConfig,
)

/**
 * El árbol se corta acá (CLAUDE.md §3): una Week contiene sus días → bloques →
 * ejercicios como maps indexados por id. El jugador lee UNA semana con un GetItem.
 */
export const WeekEntity = new Entity(
  {
    model: { entity: 'week', version: '1', service: 'coachlab' },
    attributes: {
      programId: { type: 'string', required: true },
      weekId: { type: 'string', required: true },
      name: { type: 'string', required: true },
      order: { type: 'number', required: true },
      days: {
        type: 'map',
        required: true,
        default: () => ({}),
        properties: {
          '*': {
            type: 'any', // la forma real la garantiza Zod en el borde de la API
          },
        },
      },
      updatedAt: { type: 'string', required: true, default: () => new Date().toISOString(), set: () => new Date().toISOString() },
    },
    indexes: {
      byProgram: {
        pk: { field: 'pk', composite: ['programId'] },
        sk: { field: 'sk', composite: ['weekId'] },
      },
    },
  },
  entityConfig,
)
```

> `days` va como map abierto porque ElectroDB no expresa bien tres niveles de anidamiento variable.
> **La forma la garantiza Zod en la ruta**, que es donde entra el dato del cliente. Si en algún
> momento el tipo se afloja de más, el síntoma va a ser un `undefined` en el editor — por eso los
> helpers de `tree.ts` tienen tests.

- [ ] **Step 2: `ProgramAssignment` con GSI2**

```ts
export const AssignmentEntity = new Entity(
  {
    model: { entity: 'assignment', version: '1', service: 'coachlab' },
    attributes: {
      assignmentId: { type: 'string', required: true },
      programId: { type: 'string', required: true },
      coachId: { type: 'string', required: true },
      /**
       * Destino derivado: PLAYER#<id> | POSITION#<slug> | GROUP#<id>.
       * Es lo que hace que resolveProgram necesite una sola query por destino,
       * y de paso hace imposible tener dos destinos en el mismo item.
       */
      targetKey: { type: 'string', required: true },
      priority: { type: 'number', required: true, default: 0 },
      createdAt: { type: 'string', required: true, readOnly: true, default: () => new Date().toISOString() },
    },
    indexes: {
      byProgram: {
        pk: { field: 'pk', composite: ['programId'] },
        sk: { field: 'sk', composite: ['assignmentId'] },
      },
      byTarget: {
        index: 'gsi2',
        pk: { field: 'gsi2pk', composite: ['targetKey'] },
        sk: { field: 'gsi2sk', composite: ['assignmentId'] },
      },
    },
  },
  entityConfig,
)
```

- [ ] **Step 3: `PositionGroup` y `OneRM`**

`PositionGroup` (solo custom): pk `groupId`, GSI1 `coachId`/`groupId`, atributo `positionIds` como
lista de strings. `OneRM`: pk `playerId`, sk `exerciseId`, atributos `kg` y `normalizedName`
(desnormalizado para que `rmFor` no tenga que leer el catálogo).

- [ ] **Step 4: Ampliar el Service** en `entities/index.ts` con las cuatro entidades nuevas.

- [ ] **Step 5: Verificar** → `pnpm typecheck`.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/entities
git commit -m "feat(db): add program, week, assignment, group and 1rm entities"
```

---

### Task 5: Candidatos de assignment

**Files:**
- Create: `packages/core/src/access/programs.ts`

- [ ] **Step 1: Escribir el helper**

```ts
import { AssignmentEntity, GroupEntity, ProgramEntity, UserEntity } from '../entities'
import { systemGroupForPosition } from '../domain/positions'
import { resolveProgram, type AssignmentKind, type CandidateAssignment } from '../domain/resolveProgram'
import { assertFound, type Role } from './rbac'

export function targetKeyForPlayer(playerId: string) {
  return `PLAYER#${playerId}`
}
export function targetKeyForPosition(positionId: string) {
  return `POSITION#${positionId}`
}
export function targetKeyForGroup(groupId: string) {
  return `GROUP#${groupId}`
}

function kindOf(targetKey: string, systemGroupIds: Set<string>): AssignmentKind {
  if (targetKey.startsWith('PLAYER#')) return 'PLAYER'
  if (targetKey.startsWith('POSITION#')) return 'POSITION'
  return systemGroupIds.has(targetKey.slice('GROUP#'.length)) ? 'GROUP_SYSTEM' : 'GROUP_CUSTOM'
}

/**
 * Los assignments que le aplican a un jugador: uno por destino posible.
 * Son hasta 4 queries a GSI2, todas por partición exacta — no hay scan.
 */
export async function candidateAssignmentsFor(playerId: string): Promise<CandidateAssignment[]> {
  const player = await UserEntity.get({ userId: playerId }).go()
  if (!player.data || player.data.role !== 'PLAYER') return []

  const positionId = player.data.positionId ?? null
  const systemGroup = systemGroupForPosition(positionId)

  // Grupos custom del coach que contienen el puesto del jugador.
  const customGroups = positionId
    ? (await GroupEntity.query.byCoach({ coachId: player.data.coachId! }).go()).data.filter((g) =>
        g.positionIds.includes(positionId),
      )
    : []

  const targetKeys = [
    targetKeyForPlayer(playerId),
    ...(positionId ? [targetKeyForPosition(positionId)] : []),
    ...(systemGroup ? [targetKeyForGroup(systemGroup.id)] : []),
    ...customGroups.map((g) => targetKeyForGroup(g.groupId)),
  ]

  const systemGroupIds = new Set(systemGroup ? [systemGroup.id] : [])

  const results = await Promise.all(
    targetKeys.map((targetKey) => AssignmentEntity.query.byTarget({ targetKey }).go()),
  )

  return results.flatMap((result) =>
    result.data.map((row) => ({
      assignmentId: row.assignmentId,
      programId: row.programId,
      kind: kindOf(row.targetKey, systemGroupIds),
      priority: row.priority,
      createdAt: new Date(row.createdAt),
    })),
  )
}

export async function activeProgramIdFor(playerId: string): Promise<string | null> {
  return resolveProgram(await candidateAssignmentsFor(playerId))?.programId ?? null
}

/** Capa 3: un programa visible para el actor, o 404. */
export async function scopedProgram(actor: { id: string; role: Role }, programId: string) {
  const program = assertFound((await ProgramEntity.get({ programId }).go()).data)
  if (actor.role === 'ADMIN') return program
  if (actor.role === 'COACH') {
    // En DynamoDB el get trae el item sin importar de quién es: la comparación
    // de ownership es explícita, no una cláusula que alguien asuma que está.
    assertFound(program.coachId === actor.id ? program : null)
    return program
  }
  // PLAYER: solo el programa que le resolvió su coach.
  assertFound((await activeProgramIdFor(actor.id)) === programId ? program : null)
  return program
}
```

- [ ] **Step 2: Verificar** → `pnpm typecheck`.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/access/programs.ts
git commit -m "feat(access): add assignment candidate resolution and program scoping"
```

---

### Task 6: Plantel — puesto, medidas y 1RM

**Files:**
- Create: `packages/core/src/validators/player.ts`
- Create: `packages/core/src/access/players.ts`
- Create: `packages/api/src/routes/coach/players.ts`
- Create: `packages/web/app/pages/coach/players/[playerId].vue`
- Create: `packages/web/app/components/ExerciseTypeahead.vue`

- [ ] **Step 1: Validadores**

```ts
import { z } from 'zod'
import { isPositionId } from '../domain/positions'

export const playerProfileSchema = z.object({
  positionId: z.string().refine(isPositionId, 'Puesto inválido').nullish(),
  heightCm: z.number().int().min(120).max(230).nullish(),
  weightKg: z.number().min(30).max(220).nullish(),
})

export const oneRmSchema = z.object({
  exerciseId: z.string().min(1, 'Elegí un ejercicio'),
  kg: z.number().positive('Tiene que ser mayor a 0').max(500),
})
```

> `playerProfileSchema` **no acepta `role` ni `coachId`**. Es deliberado: el perfil vive en el mismo
> item `User` que el rol, y un update armado con spread del body sería una escalada de privilegios.
> La ruta escribe campo por campo desde el objeto validado.

- [ ] **Step 2: `scopedPlayer` y `scopedPlayers`**

En `packages/core/src/access/players.ts`. `scopedPlayers(actor)`: COACH → `UserEntity.query.byCoach({ coachId: actor.id })`;
PLAYER → solo él; ADMIN → requiere listar por coach, así que recibe el `coachId`. `scopedPlayer(actor, playerId)`:
get + comparación explícita de `coachId`, 404 si no coincide.

- [ ] **Step 3: Rutas**

| Método | Path | Comportamiento |
|---|---|---|
| GET | `/coach/players` | `scopedPlayers` |
| GET | `/coach/players/:playerId` | `scopedPlayer` + sus 1RM |
| PATCH | `/coach/players/:playerId` | `playerProfileSchema`, campos explícitos |
| PUT | `/coach/players/:playerId/one-rm` | `oneRmSchema`, upsert por `playerId+exerciseId` |
| DELETE | `/coach/players/:playerId/one-rm/:exerciseId` | |

Todas cuelgan del grupo `/coach/*`, que ya lleva `requireRole(['COACH','ADMIN'])` desde F1.

- [ ] **Step 4: `ExerciseTypeahead.vue`**

Client component compartido por F2 y F3. Props: `exercises` (catálogo completo), `modelValue`
(exerciseId o null). Filtra con `normName(query)` incluido en `normName(exercise.name)` — reusa la
función del dominio, no reimplementa el filtro. Agrupa por `category`, muestra hasta 8, navegación con
flechas + Enter. Sobre `UInputMenu` de Nuxt UI.

- [ ] **Step 5: Ficha del jugador**

Encabezado con nombre y email; select de puesto con las 8; inputs de altura y peso con autosave al
blur; tabla de 1RM con fecha de actualización y botón borrar; fila de alta con el typeahead + kg.

- [ ] **Step 6: Probar**

1. Asignar puesto Wing, altura 182, peso 88. Recargar → persiste.
2. Cargar 1RM Press Banca 140. Cargar de nuevo con 145 → **actualiza**, no duplica.
3. Entrar por URL al `playerId` de otro coach → **404**, no 403.
4. `PATCH /coach/players/:id` con `{"role":"ADMIN"}` en el body → el rol no cambia.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(coach): add player detail with position, measures and 1RM"
```

---

### Task 7: Grupos custom

**Files:**
- Create: `packages/core/src/validators/group.ts`
- Create: `packages/api/src/routes/coach/groups.ts`
- Create: `packages/web/app/pages/coach/groups.vue`

- [ ] **Step 1: Validador**

```ts
import { z } from 'zod'
import { isPositionId } from '../domain/positions'

export const positionGroupSchema = z.object({
  name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(60),
  positionIds: z
    .array(z.string().refine(isPositionId, 'Puesto inválido'))
    .min(1, 'Elegí al menos un puesto')
    .max(8)
    .refine((ids) => new Set(ids).size === ids.length, 'Hay puestos repetidos'),
})
```

- [ ] **Step 2: Rutas** — `GET/POST/PATCH/DELETE /coach/groups`. `GET` devuelve los grupos system
(desde las constantes de `positions.ts`, marcados `isSystem: true`) **más** los custom del coach.
`PATCH` y `DELETE` verifican `coachId === actor.id` explícitamente, y rechazan cualquier id que
coincida con un grupo system.

- [ ] **Step 3: Pantalla** — cards con nombre y chips de puestos. Los system llevan badge "Del
sistema" y no muestran botones de editar/borrar. "Nuevo grupo" abre un form inline con input de
nombre y 8 checkboxes.

- [ ] **Step 4: Probar**

1. Crear "Primeras y Segundas" con dos puestos → aparece.
2. Editarlo agregando un tercero → 3 chips.
3. Intentar `DELETE /coach/groups/forwards` → 404.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(coach): add custom position group management"
```

---

### Task 8: Editor de programas

**Files:**
- Create: `packages/api/src/routes/coach/programs.ts`
- Create: `packages/web/app/pages/coach/programs/index.vue` (listado)
- Create: `packages/web/app/pages/coach/programs/[programId].vue` (**padre con tabs**)
- Create: `packages/web/app/pages/coach/programs/[programId]/index.vue` (el editor)
- Create: `packages/web/app/components/program/*`
- Create: `packages/web/app/composables/useDebouncedSave.ts`

> **El anidamiento acá es a propósito.** Un programa tiene tres vistas —editor, asignaciones,
> import— que comparten el mismo encabezado y el mismo `GET /coach/programs/:id`. En Nuxt eso se
> resuelve con ruta anidada: `[programId].vue` es el padre, carga el programa una sola vez, renderiza
> nombre + tabs + `<NuxtPage />`, y `index.vue` / `assign.vue` / `import.vue` son sus hijos. Cambiar
> de tab no recarga el programa.
>
> Es la misma mecánica que en `players` había que **evitar** (F1, Task 10): ahí el listado y el
> detalle no comparten nada y van como hermanos con `index.vue`. La diferencia no es de sintaxis,
> es si las vistas comparten estado y encabezado o no.

- [ ] **Step 1: Rutas del programa**

| Método | Path | Nota |
|---|---|---|
| GET | `/coach/programs` | GSI1 por coach |
| POST | `/coach/programs` | Crea con Semana 1 / Día 1 ya listos: un programa vacío no sirve |
| GET | `/coach/programs/:id` | Program + todas sus Weeks en **un query** por `pk = programId` |
| PATCH | `/coach/programs/:id` | Renombrar, setear `currentWeekId` (validando que la week sea de ese programa) |
| DELETE | `/coach/programs/:id` | Borra program + weeks + assignments |
| POST/PATCH/DELETE | `/coach/programs/:id/weeks/...` | Alta/renombre/baja de semana |

- [ ] **Step 2: El update anidado — la ruta que más se ejecuta**

`PATCH /coach/programs/:programId/weeks/:weekId/exercises/:blockExerciseId` recibe un
`blockExerciseSchema` completo y escribe **solo esa rama**:

```ts
await WeekEntity.patch({ programId, weekId })
  .set({ [`days.${dayId}.blocks.${blockId}.exercises.${beId}`]: validated })
  .go()
```

Tres cosas que no se pueden saltear:
1. `scopedProgram(actor, programId)` antes de tocar nada.
2. Verificar que `weekId` pertenece a `programId` (viene del path, no del token).
3. Verificar que la ruta `days.<dayId>.blocks.<blockId>.exercises.<beId>` **ya existe** en el item.
   Sin ese chequeo, un `set` sobre una ruta inventada crea basura dentro del árbol de un programa
   legítimo — el ítem es del coach, pero el contenido no lo escribió él.

- [ ] **Step 3: `useDebouncedSave`**

```ts
export function useDebouncedSave<T>(
  save: (value: T) => Promise<{ ok: boolean; error?: string }>,
  delayMs = 800,
) {
  const state = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const error = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null

  onScopeDispose(() => { if (timer) clearTimeout(timer) })

  function trigger(value: T) {
    if (timer) clearTimeout(timer)
    state.value = 'saving'
    timer = setTimeout(async () => {
      const result = await save(value)
      state.value = result.ok ? 'saved' : 'error'
      error.value = result.ok ? null : (result.error ?? 'No se pudo guardar')
    }, delayMs)
  }

  return { trigger, state, error }
}
```

- [ ] **Step 4: El editor**

Vive en `[programId]/index.vue`; el encabezado y los tabs los pone el padre. Tres niveles:
- **Tabs de semanas**: nombre editable inline; la marcada como `currentWeekId` lleva badge "Semana
  actual", las demás un botón "Marcar como actual". "+ Semana" al final.
- **Columnas de días** en la semana activa; cada una con "+ Bloque" (SINGLE o CIRCUIT).
- **Bloques**: un CIRCUIT muestra input de vueltas. Cada bloque lista sus filas de ejercicio y tiene
  "+ Ejercicio".

Estado local inicializado desde props, mutación optimista, revert + toast si la ruta falla. Indicador
global "Guardando… / Guardado / Error al guardar" arriba a la derecha.

- [ ] **Step 5: Fila de ejercicio con carga dinámica**

| Campo | Control |
|---|---|
| Ejercicio | `ExerciseTypeahead` |
| Series | number 1–20 |
| Reps | text — acepta "10", "8-10", "AMRAP" |
| Modo de carga | Select: "Kg" / "% del 1RM" / "Sin peso" |
| Carga | **condicional** según el modo |
| RPE objetivo | number 1–10, opcional |
| Nota | text, opcional |

Al cambiar el modo, **limpiar el campo del modo anterior antes de guardar**: si no,
`blockExerciseSchema` rechaza el update por incoherencia y el autosave falla en silencio.

```ts
function onLoadTypeChange(next: LoadType) {
  const cleaned = { ...row.value, loadType: next, weight: null, percentage: null }
  row.value = cleaned
  trigger(cleaned)
}
```

- [ ] **Step 6: Probar**

1. Bloque SINGLE con "Press Banca", 4×5, "% del 1RM" 80, RPE 8. Recargar → persiste.
2. Cambiar a "Kg" 100. Recargar → `percentage` quedó null.
3. Bloque CIRCUIT con 3 vueltas y dos ejercicios. Recargar → persiste.
4. Agregar Semana 2, marcarla actual → el badge se mueve.
5. `PATCH` con un `dayId` inventado → 404, y el item del programa **no** queda con basura.
6. Editor de un programa de otro coach por URL → 404.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(coach): add program editor with debounced nested autosave"
```

---

### Task 9: Assignments con prioridad

**Files:**
- Create: `packages/api/src/routes/coach/assignments.ts`
- Create: `packages/web/app/pages/coach/programs/[programId]/assign.vue`

- [ ] **Step 1: Rutas**

`POST /coach/programs/:programId/assignments` valida con `assignmentSchema`, deriva el `targetKey`
del único destino presente, y **verifica que el destino también sea del coach**: un `playerId` pasa
por `scopedPlayer`, un `positionGroupId` custom por su `coachId`. Sin eso, un coach asigna su programa
al plantel de otro. `DELETE /coach/programs/:programId/assignments/:assignmentId` sube al programa
antes de borrar.

- [ ] **Step 2: Pantalla**

- Form de alta: select "Asignar a" con tres modos (Jugador / Puesto / Grupo) que cambia el segundo
  select; input "prioridad extra" con default 0 y ayuda inline con las bases (100 / 50 / 30 / 10).
- Tabla: destino, tipo, base + override = total, botón borrar.
- **Vista previa de impacto**: la lista del plantel con el programa que le queda vigente a cada uno
  según `activeProgramIdFor`. Es lo que evita que el coach descubra un conflicto de prioridades recién
  cuando un jugador se queja.

- [ ] **Step 3: Probar la resolución completa**

Con dos programas (A y B) y un jugador Wing:
1. A al puesto Wing → la vista previa muestra A.
2. B al grupo system Backs → pasa a B (30 > 10).
3. Grupo custom con Wing, asignarle A → vuelve a A (50 > 30).
4. B al jugador directo → B (100 > 50).
5. Prioridad extra 60 al de puesto (70) → sigue B.
6. Prioridad extra 200 al de puesto (210) → pasa a A.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(coach): add program assignments with priority and impact preview"
```

---

### Task 10: Import de Excel y texto

⚠ **NECESITA PROTOTIPO** — leer la sección al inicio de este documento antes de empezar.

**Files:**
- Create: `packages/core/src/domain/parsedProgram.ts`, `parseGrid.ts`, `parseText.ts` (+ tests)
- Create: `packages/api/src/routes/coach/import.ts`
- Create: `packages/web/app/pages/coach/programs/[programId]/import.vue`

- [ ] **Step 1: Tipo compartido**

```ts
import type { LoadType } from './calcLoad'

export type ParsedExercise = {
  exerciseName: string
  sets: number
  reps: string
  loadType: LoadType
  weight: number | null
  percentage: number | null
  targetRpe: number | null
  note: string | null
}

export type ParsedBlock = { type: 'SINGLE' | 'CIRCUIT'; rounds: number | null; exercises: ParsedExercise[] }
export type ParsedDay = { name: string; blocks: ParsedBlock[] }
export type ParsedWeek = { name: string; days: ParsedDay[] }
export type ParseIssue = { row: number; message: string }

export type ParsedProgram = {
  weeks: ParsedWeek[]
  /** Filas que no se pudieron interpretar. El import se aplica igual, salteándolas. */
  issues: ParseIssue[]
}
```

- [ ] **Step 2: Formato asumido**

**Excel (`parseGrid`)** — primera fila de encabezados, columnas por nombre (case-insensitive vía
`normName`): `semana`, `dia`, `bloque`, `vueltas`, `ejercicio`, `series`, `reps`, `carga`, `rpe`,
`nota`. La columna `carga`: `"80%"` → PERCENTAGE 80; `"100"` / `"100kg"` → WEIGHT 100; vacío o `"-"` → NONE.

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

- [ ] **Step 3: Tests de `parseText` primero**

```ts
import { describe, expect, it } from 'vitest'
import { parseText } from './parseText'

describe('parseText', () => {
  it('devuelve un programa vacío con entrada vacía', () => {
    expect(parseText('')).toEqual({ weeks: [], issues: [] })
  })

  it('parsea un ejercicio con porcentaje y RPE', () => {
    const result = parseText('Semana 1\nDía 1\nPress Banca 4x5 @80% RPE8')
    expect(result.weeks[0]!.days[0]!.blocks[0]!.exercises[0]!).toEqual({
      exerciseName: 'Press Banca',
      sets: 4,
      reps: '5',
      loadType: 'PERCENTAGE',
      weight: null,
      percentage: 80,
      targetRpe: 8,
      note: null,
    })
  })

  it('parsea kg fijos', () => {
    const e = parseText('Semana 1\nDía 1\nRemo con Barra 3x10 @60kg').weeks[0]!.days[0]!.blocks[0]!.exercises[0]!
    expect(e.loadType).toBe('WEIGHT')
    expect(e.weight).toBe(60)
    expect(e.percentage).toBeNull()
  })

  it('sin carga usa NONE', () => {
    const e = parseText('Semana 1\nDía 1\nPlancha 3x30s').weeks[0]!.days[0]!.blocks[0]!.exercises[0]!
    expect(e.loadType).toBe('NONE')
    expect(e.reps).toBe('30s')
  })

  it('acepta rangos de reps', () => {
    const e = parseText('Semana 1\nDía 1\nSentadilla 4x8-10').weeks[0]!.days[0]!.blocks[0]!.exercises[0]!
    expect(e.reps).toBe('8-10')
  })

  it('abre un circuito con #', () => {
    const b = parseText('Semana 1\nDía 1\n# Core circuito x3\nPlancha 3x30s').weeks[0]!.days[0]!.blocks[0]!
    expect(b.type).toBe('CIRCUIT')
    expect(b.rounds).toBe(3)
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

  it('reporta una línea de ejercicio sin sets x reps como issue', () => {
    const r = parseText('Semana 1\nDía 1\nPress Banca')
    expect(r.issues).toHaveLength(1)
    expect(r.issues[0]!.row).toBe(3)
  })

  it('reporta un ejercicio antes de cualquier Semana', () => {
    const r = parseText('Press Banca 4x5')
    expect(r.weeks).toHaveLength(0)
    expect(r.issues[0]!.message).toContain('Semana')
  })
})
```

- [ ] **Step 4: Correr, implementar `parseText`, correr de nuevo** → FAIL, implementar usando
`normName` para reconocer `semana`/`dia` con y sin tilde, PASS.

- [ ] **Step 5: Tests e implementación de `parseGrid`**

Firma `parseGrid(rows: unknown[][]): ParsedProgram` — recibe la matriz que devuelve
`XLSX.utils.sheet_to_json(sheet, { header: 1 })`, así queda pura y testeable sin archivos. Casos
mínimos: encabezados en cualquier orden; falta `ejercicio` → issue en fila 1 y `weeks: []`; celda
numérica vs. string en `series`; `carga` en los 3 formatos; filas vacías salteadas sin issue.

- [ ] **Step 6: SheetJS en el frontend**

```powershell
pnpm --filter @coachlab/web add xlsx
```

Corre en el browser, igual que el prototipo: el archivo no sube al servidor.

- [ ] **Step 7: Ruta de import**

`POST /coach/programs/:programId/import` recibe el `ParsedProgram` (el cliente parsea, **el server no
confía**: revalida con un `parsedProgramSchema` de Zod). Comportamiento:

1. `scopedProgram`.
2. Por cada `exerciseName`, buscar en el catálogo por `normalizedName`; si no existe, crearlo y
   devolver la lista de creados para avisarle al coach.
3. **Reemplazar** las weeks del programa: borrar las existentes y escribir las nuevas con `order`
   secuencial y los maps `days`/`blocks`/`exercises` bien formados.
4. Reasignar `currentWeekId` a la primera semana nueva.

Es un reemplazo, no un merge, y la pantalla lo tiene que decir antes de confirmar.

- [ ] **Step 8: Pantalla**

Dos pestañas: "Pegar texto" (textarea) y "Subir Excel" (`accept=".xlsx,.xls"`). Vista previa del árbol
resultante y lista de `issues` con su número de fila. Botón "Reemplazar programa" deshabilitado si
`weeks.length === 0`, con confirmación explícita. Toast final con "N semanas, N días, N ejercicios" y,
si hubo, "Se agregaron al catálogo: …".

- [ ] **Step 9: Probar**

1. Pegar el ejemplo del Step 2 → vista previa con 1 semana, 1 día, circuito de 3 vueltas, 3 ejercicios.
2. Confirmar → el editor muestra ese árbol.
3. Subir un `.xlsx` con esas columnas → mismo resultado.
4. Importar "Remo Pendlay" (inexistente) → se crea en el catálogo y el toast lo avisa.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(coach): add excel and text program import"
```

---

### Task 11: Cierre de fase

- [ ] **Step 1: Auditoría**

Dispatch `rbac-auditor` sobre `packages/api/src/routes/coach/` y `packages/core/src/access/`. Foco:
el update anidado de la Task 8 Step 2 (los tres chequeos), y que `createAssignment` valide el destino
además del programa.

- [ ] **Step 2: Verificación**

Run: `pnpm typecheck && pnpm test`

- [ ] **Step 3: Marcar en CLAUDE.md**

```markdown
- [x] **F2 — Panel coach**: plantel, grupos custom, editor de programas (…), assignments con prioridad, **import Excel/texto**.
```

Si la Task 10 corrió con el formato asumido, agregar bajo §6:

```markdown
> **Pendiente de validación:** el formato de import Excel/texto se implementó sin `coach.html` a la vista. Confirmar contra el prototipo o con un coach real antes de F4.
```

- [ ] **Step 4: Commit y merge**

```bash
git add CLAUDE.md
git commit -m "docs: mark F2 complete"
git checkout main
git merge --no-ff feature/f2-coach-panel -m "feat: F2 coach panel"
```

---

## Definición de terminado

- El coach edita puesto/medidas/1RM de su plantel y no ve plantel ajeno (404).
- Un `PATCH` de perfil con `role` en el body no escala privilegios.
- Crea grupos custom; Forwards/Backs aparecen de solo lectura.
- Construye un programa con los 3 modos de carga y RPE objetivo, con autosave anidado.
- Un update con una ruta de árbol inventada devuelve 404 y no ensucia el item.
- Asigna con prioridad y la vista previa muestra los 4 niveles correctamente.
- Importa un programa desde texto y desde Excel.
- `pnpm typecheck && pnpm test` en verde.
