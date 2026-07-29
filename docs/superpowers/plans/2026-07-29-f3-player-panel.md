# F3 — Panel del jugador Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Reemplaza `docs/superpowers/plans/2026-07-27-f3-player-panel.md`, escrito contra el stack descartado
> (DynamoDB + ElectroDB). El spec aprobado es
> `docs/superpowers/specs/2026-07-29-f3-player-panel-design.md`.

**Goal:** Que el jugador vea su rutina con los kg ya calculados según su 1RM personal ("80% → 112 kg"),
con "última vez" al lado de cada ejercicio, y que registre peso real, reps, RPE percibido y nota del
día, cerrando el día cuando termina.

**Architecture:** Cuatro funciones puras en `packages/core/src/domain/` hacen todo el trabajo de
negocio (`calcLoad`, `rmFor`, `lastPerf` y `buildPlayerDay` que las compone). La capa
`packages/api/src/access/playerWeek.ts` solo carga datos con el cliente de Supabase del usuario y se
las pasa. Las rutas viven bajo `/player/*`, que ya tiene el guard de rol desde F1, y toda escritura
pasa por `assertOwnedDay`, respaldado en la base por la migración `0015`.

**Tech Stack:** Nuxt 4 (SSR) + Vue 3 + Nuxt UI, Hono + `@hono/zod-openapi`, `supabase-js` con RLS, Zod,
Vitest.

**Precondición:** estar en `feature/f3` (ya creada, con el spec commiteado) y F2 mergeado a `main`.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `packages/core/src/domain/calcLoad.ts` | **Modificar** — agrega el cuarto modo `LABEL` |
| `packages/core/src/domain/lastPerf.ts` | **Crear** — busca y formatea "última vez" |
| `packages/core/src/domain/buildPlayerDay.ts` | **Crear** — compone lo que la vista renderiza |
| `packages/core/src/validators/session.ts` | **Crear** — entry y nota del día |
| `packages/core/src/validators/auth.ts` | **Modificar** — `changePasswordSchema` |
| `supabase/migrations/0015_session_logs_day_scope.sql` | **Crear** — RLS con el día scopeado |
| `packages/api/src/access/embedded.ts` | **Crear** — `firstOf` para embeds de PostgREST |
| `packages/api/src/access/playerWeek.ts` | **Crear** — carga la semana y compone |
| `packages/api/src/access/playerDay.ts` | **Crear** — `assertOwnedDay`, `ensureSessionLog` |
| `packages/api/src/routes/player/week.ts` | **Crear** — GET semana, PUT entry, complete, reopen |
| `packages/api/src/routes/player/profile.ts` | **Crear** — perfil, 1RM, canje de código |
| `packages/api/src/app.ts` | **Modificar** — montar las dos sub-apps |
| `packages/web/app/composables/usePlayerApi.ts` | **Crear** — cliente de `/player/*` |
| `packages/web/app/composables/useAuth.ts` | **Modificar** — `changePassword` |
| `packages/web/app/pages/player/week.vue` | **Modificar** — reemplaza el placeholder |
| `packages/web/app/pages/player/profile.vue` | **Crear** |
| `packages/web/app/components/player/DayCard.vue` | **Crear** |
| `packages/web/app/components/player/PlayerExerciseRow.vue` | **Crear** |
| `packages/web/app/components/AppSidebar.vue` | **Modificar** — link a "Mi perfil" |

**Nota de schema verificada antes de escribir este plan** (no inventar campos que no existen):

- `blocks` **no tiene `name`**: solo `id, day_id, type, rounds, order_index`. El parser tampoco produce
  uno (`parsedBlockSchema` no lo tiene). Los bloques son anónimos: un `CIRCUIT` se rotula por sus
  vueltas y un `SINGLE` no lleva encabezado.
- `block_exercises` **no tiene `note`**. El plan viejo mostraba una "nota del coach" por ejercicio que
  nunca existió en el schema. No va.
- `block_exercises.sets` y `.reps` son **nullable** (`smallint` y `text`).

---

### Task 1: `calcLoad` gana el cuarto modo `LABEL`

Hoy un ejercicio con `loadType = 'LABEL'` cae al `return` final y sale como
`{ kind: 'none', label: 'Sin peso' }`. Importar la hoja `14.15.16` produjo 35 cargas con etiqueta sobre
108 ejercicios (`docs/IMPLEMENTATION-F2.md` §3.5): un tercio de lo que el jugador ve diría "Sin peso".

**Files:**
- Modify: `packages/core/src/domain/calcLoad.ts`
- Test: `packages/core/src/domain/calcLoad.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `packages/core/src/domain/calcLoad.test.ts`, dentro del `describe('calcLoad')`
existente (si el archivo cierra el describe antes, agregar un `describe` nuevo al final del archivo):

```ts
describe('calcLoad con LABEL', () => {
  it('muestra la etiqueta tal cual', () => {
    const result = calcLoad(
      { loadType: 'LABEL', weight: null, percentage: null, loadLabel: 'p.corp' },
      { exerciseName: 'Dominadas' },
    )
    expect(result.kind).toBe('label')
    expect(result.label).toBe('p.corp')
  })

  it('no interpreta la etiqueta: "60 . 120" viaja entera', () => {
    const result = calcLoad(
      { loadType: 'LABEL', weight: null, percentage: null, loadLabel: '60 . 120' },
      { exerciseName: 'Cuadriceps 1p - 2p' },
    )
    expect(result.label).toBe('60 . 120')
  })

  it('recorta los espacios de la etiqueta', () => {
    const result = calcLoad(
      { loadType: 'LABEL', weight: null, percentage: null, loadLabel: '  barra  ' },
      { exerciseName: 'Press Banca' },
    )
    expect(result.label).toBe('barra')
  })

  // El CHECK block_exercises_load_shape (0013) lo impide, pero la función es
  // defensiva: una etiqueta ausente o vacía no puede quedar como "undefined".
  it('sin etiqueta cae a none', () => {
    const result = calcLoad(
      { loadType: 'LABEL', weight: null, percentage: null, loadLabel: null },
      { exerciseName: 'Press Banca' },
    )
    expect(result.kind).toBe('none')
    expect(result.label).toBe('Sin peso')
  })

  it('con etiqueta en blanco cae a none', () => {
    const result = calcLoad(
      { loadType: 'LABEL', weight: null, percentage: null, loadLabel: '   ' },
      { exerciseName: 'Press Banca' },
    )
    expect(result.kind).toBe('none')
  })
})
```

- [ ] **Step 2: Correr para ver que falla**

Run: `pnpm --filter @coachlab/core test -- calcLoad`
Expected: FAIL. Los tres primeros fallan con `expected 'none' to be 'label'`; también puede fallar el
typecheck del test porque `LoadSpec` todavía no tiene `loadLabel`.

- [ ] **Step 3: Implementar**

En `packages/core/src/domain/calcLoad.ts`, reemplazar el bloque de tipos del principio:

```ts
export type LoadType = 'WEIGHT' | 'PERCENTAGE' | 'NONE' | 'LABEL'

export type LoadSpec = {
  loadType: LoadType
  weight?: number | null
  percentage?: number | null
  /**
   * Cuarto modo (migración 0013): carga que no es número ni porcentaje.
   * `p.corp`, `barra`, `goma`, `m.band`, `med 9`, `60 . 120`.
   */
  loadLabel?: string | null
}

export type LoadContext = {
  exerciseName: string
  oneRmKg?: number | null
}

export type LoadResult =
  | { kind: 'weight'; kg: number; label: string }
  | { kind: 'percentage'; kg: number; percentage: number; label: string }
  | { kind: 'missing-1rm'; percentage: number; exerciseName: string; label: string }
  | { kind: 'label'; label: string }
  | { kind: 'none'; label: string }
```

Y agregar la rama de `LABEL` **antes** del `return` final de `calcLoad`:

```ts
  /**
   * La etiqueta se muestra CRUDA. `p.corp`, `barra`, `med 9` son las
   * abreviaturas que los jugadores ya leen en las planillas impresas del
   * preparador; expandirlas exigiría inventar un diccionario y adivinar.
   */
  if (spec.loadType === 'LABEL') {
    const label = spec.loadLabel?.trim()
    if (label) return { kind: 'label', label }
  }

  return { kind: 'none', label: 'Sin peso' }
```

- [ ] **Step 4: Correr para ver que pasa**

Run: `pnpm --filter @coachlab/core test -- calcLoad`
Expected: PASS, incluidos los tests que ya existían de `WEIGHT`, `PERCENTAGE`, `missing-1rm` y `NONE`.

- [ ] **Step 5: Verificar que no rompí a nadie**

Run: `pnpm typecheck`
Expected: verde. Si algún `switch` sobre `LoadResult['kind']` quedó no exhaustivo, TS lo marca acá —
arreglarlo antes de commitear.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/domain/calcLoad.ts packages/core/src/domain/calcLoad.test.ts
git commit -m "fix(domain): support the LABEL load mode in calcLoad"
```

---

### Task 2: `lastPerf` — "última vez"

**Files:**
- Create: `packages/core/src/domain/lastPerf.ts`
- Test: `packages/core/src/domain/lastPerf.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

`packages/core/src/domain/lastPerf.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatLastPerf, hasData, lastPerf, type PerfRecord } from './lastPerf'

const at = (iso: string) => new Date(iso)

const history: PerfRecord[] = [
  {
    normalizedName: 'press banca',
    dayId: 'day-w1',
    weekName: 'Semana 1',
    dayName: 'Día 1',
    weight: 100,
    reps: 5,
    rpe: 7,
    performedAt: at('2026-01-05T10:00:00Z'),
  },
  {
    normalizedName: 'press banca',
    dayId: 'day-w2',
    weekName: 'Semana 2',
    dayName: 'Día 1',
    weight: 105,
    reps: 5,
    rpe: 8,
    performedAt: at('2026-01-12T10:00:00Z'),
  },
  {
    normalizedName: 'sentadilla',
    dayId: 'day-w2b',
    weekName: 'Semana 2',
    dayName: 'Día 2',
    weight: 160,
    reps: 3,
    rpe: 9,
    performedAt: at('2026-01-13T10:00:00Z'),
  },
]

describe('hasData', () => {
  it('es false con los tres campos nulos', () => {
    expect(hasData({ weight: null, reps: null, rpe: null })).toBe(false)
  })

  it('es true con cualquiera de los tres', () => {
    expect(hasData({ weight: 100, reps: null, rpe: null })).toBe(true)
    expect(hasData({ weight: null, reps: 8, rpe: null })).toBe(true)
    expect(hasData({ weight: null, reps: null, rpe: 7 })).toBe(true)
  })

  it('cuenta un 0 como dato', () => {
    expect(hasData({ weight: 0, reps: null, rpe: null })).toBe(true)
  })
})

describe('lastPerf', () => {
  it('devuelve el registro más reciente del ejercicio', () => {
    expect(lastPerf(history, 'Press Banca')?.weight).toBe(105)
  })

  it('no mezcla ejercicios distintos', () => {
    expect(lastPerf(history, 'Sentadilla')?.weight).toBe(160)
  })

  it('matchea ignorando acentos y mayúsculas', () => {
    const withAccents: PerfRecord[] = [{ ...history[0]!, normalizedName: 'sentadilla bulgara' }]
    expect(lastPerf(withAccents, 'Sentadilla Búlgara')).not.toBeNull()
  })

  it('devuelve null si el ejercicio no tiene historial', () => {
    expect(lastPerf(history, 'Remo con Barra')).toBeNull()
  })

  it('devuelve null con historial vacío', () => {
    expect(lastPerf([], 'Press Banca')).toBeNull()
  })

  it('devuelve null con nombre vacío', () => {
    expect(lastPerf(history, '   ')).toBeNull()
  })

  it('ignora los registros sin ningún dato', () => {
    const empty: PerfRecord[] = [
      {
        ...history[1]!,
        dayId: 'day-w3',
        weight: null,
        reps: null,
        rpe: null,
        performedAt: at('2026-02-01T00:00:00Z'),
      },
    ]
    expect(lastPerf([...history, ...empty], 'Press Banca')?.weight).toBe(105)
  })

  it('acepta un registro sin peso pero con reps (ejercicio sin carga)', () => {
    const bodyweight: PerfRecord[] = [
      {
        normalizedName: 'dominadas',
        dayId: 'day-w3',
        weekName: 'Semana 3',
        dayName: 'Día 1',
        weight: null,
        reps: 12,
        rpe: 8,
        performedAt: at('2026-01-20T00:00:00Z'),
      },
    ]
    expect(lastPerf(bodyweight, 'Dominadas')?.reps).toBe(12)
  })

  // El día que se está mostrando no es "última vez": es hoy. Se excluye por
  // dayId y no comparando nombres, porque los ids son exactos y el coach puede
  // llamar "Día 1" a dos días distintos.
  it('descarta el día que se está mostrando', () => {
    expect(lastPerf(history, 'Press Banca', 'day-w2')?.weight).toBe(100)
  })

  it('excluir un día que no está en el historial no cambia nada', () => {
    expect(lastPerf(history, 'Press Banca', 'day-inexistente')?.weight).toBe(105)
  })

  it('no muta el historial recibido', () => {
    const copy = structuredClone(history)
    lastPerf(history, 'Press Banca')
    expect(history).toEqual(copy)
  })
})

describe('formatLastPerf', () => {
  it('arma la línea completa', () => {
    expect(formatLastPerf(history[1]!)).toBe('Semana 2 · Día 1: 105 kg · 5 reps · RPE 8')
  })

  it('omite los kg cuando no hubo peso', () => {
    expect(formatLastPerf({ ...history[1]!, weight: null })).toBe('Semana 2 · Día 1: 5 reps · RPE 8')
  })

  it('omite el RPE cuando no se registró', () => {
    expect(formatLastPerf({ ...history[1]!, rpe: null })).toBe('Semana 2 · Día 1: 105 kg · 5 reps')
  })

  it('muestra decimales solo cuando los hay', () => {
    expect(formatLastPerf({ ...history[1]!, weight: 102.5 })).toContain('102.5 kg')
  })

  it('devuelve null sin registro', () => {
    expect(formatLastPerf(null)).toBeNull()
  })
})
```

- [ ] **Step 2: Correr para ver que falla**

Run: `pnpm --filter @coachlab/core test -- lastPerf`
Expected: FAIL — `Cannot find module './lastPerf'`.

- [ ] **Step 3: Implementar**

`packages/core/src/domain/lastPerf.ts`:

```ts
import { formatKg } from './calcLoad'
import { normName } from './normName'

/**
 * Un registro histórico del jugador, ya aplanado por la capa de acceso.
 *
 * `weekName` y `dayName` viajan acá porque la línea que se muestra los necesita
 * ("Semana 2 · Día 1: …"). No están desnormalizados en la tabla: los llena el
 * join, y así esta función se mantiene pura.
 */
export type PerfRecord = {
  normalizedName: string
  dayId: string
  weekName: string
  dayName: string
  weight: number | null
  reps: number | null
  rpe: number | null
  performedAt: Date
}

/**
 * Si una entry cuenta como registrada. Es la MISMA regla que usa el contador de
 * progreso del día (buildPlayerDay): una sola definición de "esto se registró".
 * Un 0 es un dato, no un vacío — por eso la comparación es contra null.
 */
export function hasData(entry: {
  weight: number | null
  reps: number | null
  rpe: number | null
}): boolean {
  return entry.weight != null || entry.reps != null || entry.rpe != null
}

/**
 * Última vez que el jugador hizo este ejercicio.
 * Portado de `lastPerf` del prototipo coach.html.
 *
 * El match es por `normalizedName` EXACTO, no por inclusión como `rmFor`: acá
 * los dos lados salen de la misma fila de `exercises`, así que no hay nada que
 * tolerar. `excludeDayId` saca el día que se está mostrando (es hoy, no historia).
 */
export function lastPerf(
  history: readonly PerfRecord[],
  exerciseName: string,
  excludeDayId?: string,
): PerfRecord | null {
  const target = normName(exerciseName)
  if (!target) return null

  let best: PerfRecord | null = null
  for (const record of history) {
    if (record.normalizedName !== target) continue
    if (excludeDayId !== undefined && record.dayId === excludeDayId) continue
    if (!hasData(record)) continue
    if (best === null || record.performedAt > best.performedAt) best = record
  }

  return best
}

/** "Semana 2 · Día 1: 105 kg · 5 reps · RPE 8" */
export function formatLastPerf(record: PerfRecord | null): string | null {
  if (!record) return null

  const parts: string[] = []
  if (record.weight != null) parts.push(formatKg(record.weight))
  if (record.reps != null) parts.push(`${record.reps} reps`)
  if (record.rpe != null) parts.push(`RPE ${record.rpe}`)

  return `${record.weekName} · ${record.dayName}: ${parts.join(' · ')}`
}
```

- [ ] **Step 4: Correr para ver que pasa**

Run: `pnpm --filter @coachlab/core test -- lastPerf`
Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/lastPerf.ts packages/core/src/domain/lastPerf.test.ts
git commit -m "feat(domain): add lastPerf lookup and formatting"
```

---

### Task 3: `buildPlayerDay` — la composición

Junta `calcLoad`, `rmFor` y `lastPerf` en la forma exacta que renderiza la vista. Es lo que hace que la
ruta de la API sea solo carga de datos.

**Files:**
- Create: `packages/core/src/domain/buildPlayerDay.ts`
- Test: `packages/core/src/domain/buildPlayerDay.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

`packages/core/src/domain/buildPlayerDay.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildPlayerDay, type PlayerDayInput } from './buildPlayerDay'

function makeInput(): PlayerDayInput {
  return {
    day: {
      id: 'day-w3',
      name: 'Día 1',
      blocks: [
        {
          id: 'b1',
          type: 'SINGLE',
          rounds: null,
          exercises: [
            {
              id: 'be1',
              exerciseName: 'Press Banca',
              sets: 4,
              reps: '5',
              loadType: 'PERCENTAGE',
              weight: null,
              percentage: 80,
              loadLabel: null,
              targetRpe: 8,
            },
            {
              id: 'be2',
              exerciseName: 'Dominadas',
              sets: 3,
              reps: 'AMRAP',
              loadType: 'NONE',
              weight: null,
              percentage: null,
              loadLabel: null,
              targetRpe: null,
            },
          ],
        },
        {
          id: 'b2',
          type: 'CIRCUIT',
          rounds: 3,
          exercises: [
            {
              id: 'be3',
              exerciseName: 'Plancha',
              sets: 1,
              reps: "40''",
              loadType: 'LABEL',
              weight: null,
              percentage: null,
              loadLabel: 'p.corp',
              targetRpe: null,
            },
          ],
        },
      ],
    },
    weekName: 'Semana 3',
    oneRms: [{ normalizedName: 'press banca', kg: 140 }],
    history: [
      {
        normalizedName: 'press banca',
        dayId: 'day-w2',
        weekName: 'Semana 2',
        dayName: 'Día 1',
        weight: 105,
        reps: 5,
        rpe: 8,
        performedAt: new Date('2026-01-12T00:00:00Z'),
      },
    ],
    entries: [{ blockExerciseId: 'be1', weight: 112, reps: 5, rpe: 9 }],
  }
}

describe('buildPlayerDay', () => {
  it('calcula los kg del porcentaje con el 1RM del jugador', () => {
    const row = buildPlayerDay(makeInput()).blocks[0]!.exercises[0]!
    expect(row.load.kind).toBe('percentage')
    expect(row.load.label).toBe('80% → 112 kg')
  })

  it('marca el ejercicio sin 1RM en vez de ocultarlo', () => {
    const row = buildPlayerDay({ ...makeInput(), oneRms: [] }).blocks[0]!.exercises[0]!
    expect(row.load.kind).toBe('missing-1rm')
    expect(row.load.label).toContain('falta tu 1RM de Press Banca')
  })

  it('expone la lista de 1RM faltantes del día', () => {
    expect(buildPlayerDay({ ...makeInput(), oneRms: [] }).missingOneRms).toEqual(['Press Banca'])
  })

  it('no repite un ejercicio en missingOneRms', () => {
    const input = makeInput()
    input.oneRms = []
    input.day.blocks[0]!.exercises.push({
      ...input.day.blocks[0]!.exercises[0]!,
      id: 'be4',
    })
    expect(buildPlayerDay(input).missingOneRms).toEqual(['Press Banca'])
  })

  it('muestra la etiqueta de una carga LABEL', () => {
    const row = buildPlayerDay(makeInput()).blocks[1]!.exercises[0]!
    expect(row.load.kind).toBe('label')
    expect(row.load.label).toBe('p.corp')
  })

  it('conserva el tipo y las vueltas del bloque', () => {
    const block = buildPlayerDay(makeInput()).blocks[1]!
    expect(block.type).toBe('CIRCUIT')
    expect(block.rounds).toBe(3)
  })

  it('adjunta la última vez formateada', () => {
    expect(buildPlayerDay(makeInput()).blocks[0]!.exercises[0]!.lastPerfLabel).toBe(
      'Semana 2 · Día 1: 105 kg · 5 reps · RPE 8',
    )
  })

  it('deja lastPerfLabel en null sin historial', () => {
    expect(buildPlayerDay(makeInput()).blocks[0]!.exercises[1]!.lastPerfLabel).toBeNull()
  })

  it('no se autorreferencia: descarta el historial del propio día', () => {
    const input = makeInput()
    input.history[0]!.dayId = input.day.id
    expect(buildPlayerDay(input).blocks[0]!.exercises[0]!.lastPerfLabel).toBeNull()
  })

  it('adjunta la entrada ya registrada', () => {
    expect(buildPlayerDay(makeInput()).blocks[0]!.exercises[0]!.entry).toEqual({
      blockExerciseId: 'be1',
      weight: 112,
      reps: 5,
      rpe: 9,
    })
  })

  it('deja entry en null cuando no se registró', () => {
    expect(buildPlayerDay(makeInput()).blocks[0]!.exercises[1]!.entry).toBeNull()
  })

  it('cuenta el progreso del día sobre todos los bloques', () => {
    const day = buildPlayerDay(makeInput())
    expect(day.loggedCount).toBe(1)
    expect(day.totalCount).toBe(3)
  })

  it('una entry sin ningún dato no cuenta como registrada', () => {
    const input = makeInput()
    input.entries = [{ blockExerciseId: 'be1', weight: null, reps: null, rpe: null }]
    expect(buildPlayerDay(input).loggedCount).toBe(0)
  })

  it('una entry con solo RPE cuenta como registrada', () => {
    const input = makeInput()
    input.entries = [{ blockExerciseId: 'be1', weight: null, reps: null, rpe: 7 }]
    expect(buildPlayerDay(input).loggedCount).toBe(1)
  })

  it('un ejercicio sin peso queda en kind none', () => {
    expect(buildPlayerDay(makeInput()).blocks[0]!.exercises[1]!.load.kind).toBe('none')
  })

  it('pasa el nombre de la semana al día', () => {
    expect(buildPlayerDay(makeInput()).weekName).toBe('Semana 3')
  })

  it('no muta la entrada', () => {
    const input = makeInput()
    const copy = structuredClone(input)
    buildPlayerDay(input)
    expect(input).toEqual(copy)
  })
})
```

- [ ] **Step 2: Correr para ver que falla**

Run: `pnpm --filter @coachlab/core test -- buildPlayerDay`
Expected: FAIL — `Cannot find module './buildPlayerDay'`.

- [ ] **Step 3: Implementar**

`packages/core/src/domain/buildPlayerDay.ts`:

```ts
import { calcLoad, type LoadResult, type LoadType } from './calcLoad'
import { formatLastPerf, hasData, lastPerf, type PerfRecord } from './lastPerf'
import { normName } from './normName'
import { rmFor, type OneRmRecord } from './rmFor'

/**
 * Un ejercicio del programa, como lo planificó el coach.
 *
 * No lleva `note`: `block_exercises` no tiene esa columna. Tampoco hay nombre de
 * bloque: `blocks` es (id, day_id, type, rounds, order_index).
 */
export type PlannedExercise = {
  id: string
  exerciseName: string
  sets: number | null
  reps: string | null
  loadType: LoadType
  weight: number | null
  percentage: number | null
  loadLabel: string | null
  targetRpe: number | null
}

export type PlannedBlock = {
  id: string
  type: 'SINGLE' | 'CIRCUIT'
  rounds: number | null
  exercises: PlannedExercise[]
}

/**
 * Lo que el jugador ya registró. Sin flag `done`: no hay checkbox por ejercicio
 * (decisión del spec §3.1). "Registrado" se deriva con `hasData`.
 */
export type LoggedEntry = {
  blockExerciseId: string
  weight: number | null
  reps: number | null
  rpe: number | null
}

export type PlayerDayInput = {
  day: { id: string; name: string; blocks: PlannedBlock[] }
  weekName: string
  oneRms: OneRmRecord[]
  history: PerfRecord[]
  entries: LoggedEntry[]
}

export type PlayerExerciseRow = PlannedExercise & {
  load: LoadResult
  lastPerfLabel: string | null
  entry: LoggedEntry | null
}

export type PlayerBlock = Omit<PlannedBlock, 'exercises'> & { exercises: PlayerExerciseRow[] }

export type PlayerDay = {
  id: string
  name: string
  weekName: string
  blocks: PlayerBlock[]
  /** Nombres de ejercicio en % sin 1RM cargado. Alimenta el banner ámbar. */
  missingOneRms: string[]
  loggedCount: number
  totalCount: number
}

/**
 * Compone lo que el jugador ve para un día: carga calculada, última vez y lo ya
 * registrado. Pura — los datos los carga packages/api/src/access/playerWeek.ts.
 */
export function buildPlayerDay(input: PlayerDayInput): PlayerDay {
  const entriesById = new Map(input.entries.map((entry) => [entry.blockExerciseId, entry]))
  // Map y no Set para deduplicar por normName pero mostrar el nombre lindo.
  const missing = new Map<string, string>()
  let loggedCount = 0
  let totalCount = 0

  const blocks = input.day.blocks.map(
    (block): PlayerBlock => ({
      ...block,
      exercises: block.exercises.map((planned): PlayerExerciseRow => {
        totalCount += 1

        const load = calcLoad(planned, {
          exerciseName: planned.exerciseName,
          oneRmKg: rmFor(input.oneRms, planned.exerciseName),
        })
        if (load.kind === 'missing-1rm') {
          missing.set(normName(planned.exerciseName), planned.exerciseName)
        }

        const entry = entriesById.get(planned.id) ?? null
        if (entry && hasData(entry)) loggedCount += 1

        return {
          ...planned,
          load,
          lastPerfLabel: formatLastPerf(
            lastPerf(input.history, planned.exerciseName, input.day.id),
          ),
          entry,
        }
      }),
    }),
  )

  return {
    id: input.day.id,
    name: input.day.name,
    weekName: input.weekName,
    blocks,
    missingOneRms: [...missing.values()],
    loggedCount,
    totalCount,
  }
}
```

- [ ] **Step 4: Correr para ver que pasa**

Run: `pnpm --filter @coachlab/core test -- buildPlayerDay`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/buildPlayerDay.ts packages/core/src/domain/buildPlayerDay.test.ts
git commit -m "feat(domain): add buildPlayerDay composing load, history and entries"
```

---

### Task 4: Validadores — entry, nota del día y cambio de contraseña

**Files:**
- Create: `packages/core/src/validators/session.ts`
- Create: `packages/core/src/validators/session.test.ts`
- Modify: `packages/core/src/validators/auth.ts`
- Modify: `packages/core/src/validators/auth.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

`packages/core/src/validators/session.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { dayNoteSchema, exerciseEntrySchema } from './session'

describe('exerciseEntrySchema', () => {
  it('acepta una entry completa', () => {
    const result = exerciseEntrySchema.safeParse({ weight: 112.5, reps: 5, rpe: 9 })
    expect(result.success).toBe(true)
  })

  // Los tres en null es válido: significa "borrá la fila".
  it('acepta los tres campos en null', () => {
    expect(exerciseEntrySchema.safeParse({ weight: null, reps: null, rpe: null }).success).toBe(true)
  })

  it('acepta un objeto vacío', () => {
    expect(exerciseEntrySchema.safeParse({}).success).toBe(true)
  })

  it('acepta peso 0 (la columna permite >= 0)', () => {
    expect(exerciseEntrySchema.safeParse({ weight: 0 }).success).toBe(true)
  })

  it('rechaza peso negativo', () => {
    expect(exerciseEntrySchema.safeParse({ weight: -1 }).success).toBe(false)
  })

  it('rechaza un peso absurdo', () => {
    expect(exerciseEntrySchema.safeParse({ weight: 501 }).success).toBe(false)
  })

  it('rechaza reps con decimales', () => {
    expect(exerciseEntrySchema.safeParse({ reps: 5.5 }).success).toBe(false)
  })

  it('rechaza reps negativas', () => {
    expect(exerciseEntrySchema.safeParse({ reps: -1 }).success).toBe(false)
  })

  // Espeja el CHECK rpe between 1 and 10.
  it('rechaza RPE 0 y RPE 11', () => {
    expect(exerciseEntrySchema.safeParse({ rpe: 0 }).success).toBe(false)
    expect(exerciseEntrySchema.safeParse({ rpe: 11 }).success).toBe(false)
  })

  // La columna es numeric(3,1): medio punto es válido.
  it('acepta RPE con un decimal', () => {
    expect(exerciseEntrySchema.safeParse({ rpe: 7.5 }).success).toBe(true)
  })

  it('descarta campos que no son del schema', () => {
    const result = exerciseEntrySchema.parse({ weight: 100, sessionLogId: 'ajeno' })
    expect(result).not.toHaveProperty('sessionLogId')
  })
})

describe('dayNoteSchema', () => {
  it('acepta una nota', () => {
    expect(dayNoteSchema.parse({ note: '  Me sentí bien  ' }).note).toBe('Me sentí bien')
  })

  it('acepta null', () => {
    expect(dayNoteSchema.safeParse({ note: null }).success).toBe(true)
  })

  it('acepta la ausencia de nota', () => {
    expect(dayNoteSchema.safeParse({}).success).toBe(true)
  })

  it('rechaza una nota kilométrica', () => {
    expect(dayNoteSchema.safeParse({ note: 'a'.repeat(1001) }).success).toBe(false)
  })
})
```

Agregar al final de `packages/core/src/validators/auth.test.ts`:

```ts
describe('changePasswordSchema', () => {
  const valid = { current: 'vieja123', next: 'nueva1234', confirm: 'nueva1234' }

  it('acepta un cambio válido', () => {
    expect(changePasswordSchema.safeParse(valid).success).toBe(true)
  })

  it('exige la contraseña actual', () => {
    expect(changePasswordSchema.safeParse({ ...valid, current: '' }).success).toBe(false)
  })

  it('exige mínimo 8 en la nueva', () => {
    const result = changePasswordSchema.safeParse({ ...valid, next: 'corta', confirm: 'corta' })
    expect(result.success).toBe(false)
  })

  it('exige que las dos nuevas coincidan', () => {
    const result = changePasswordSchema.safeParse({ ...valid, confirm: 'otra12345' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]!.path).toEqual(['confirm'])
    }
  })

  it('exige que la nueva sea distinta de la actual', () => {
    const result = changePasswordSchema.safeParse({
      current: 'misma1234',
      next: 'misma1234',
      confirm: 'misma1234',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]!.path).toEqual(['next'])
    }
  })
})
```

Y agregar `changePasswordSchema` al import que ya está arriba de ese archivo.

- [ ] **Step 2: Correr para ver que falla**

Run: `pnpm --filter @coachlab/core test -- session auth`
Expected: FAIL — `Cannot find module './session'` y `changePasswordSchema is not defined`.

- [ ] **Step 3: Implementar**

`packages/core/src/validators/session.ts`:

```ts
import { z } from 'zod'

/**
 * Lo que el jugador registra de un ejercicio.
 *
 * Espeja los CHECK de `exercise_entries` (migración 0001), que es la regla de
 * CLAUDE.md §5: Zod da el mensaje lindo, la base da la garantía.
 *
 *   weight numeric(5,1) check (weight >= 0)
 *   reps   smallint     check (reps >= 0)
 *   rpe    numeric(3,1) check (rpe between 1 and 10)
 *
 * Los tres son nullish y los TRES EN NULL ES VÁLIDO: significa "borrá la fila".
 * El tope de 500 kg es más estricto que la columna a propósito — arriba de eso
 * es un error de tipeo, no un levantamiento.
 */
export const exerciseEntrySchema = z.object({
  weight: z.number().min(0, 'No puede ser negativo').max(500, 'Revisá el peso').nullish(),
  reps: z.number().int('Tienen que ser reps enteras').min(0).max(999).nullish(),
  rpe: z.number().min(1, 'El RPE va de 1 a 10').max(10, 'El RPE va de 1 a 10').nullish(),
})

export type ExerciseEntryInput = z.infer<typeof exerciseEntrySchema>

/** La nota del día: "¿Cómo te fue hoy?". */
export const dayNoteSchema = z.object({
  note: z.string().trim().max(1000, 'Quedó muy larga').nullish(),
})

export type DayNoteInput = z.infer<typeof dayNoteSchema>
```

En `packages/core/src/validators/auth.ts`, agregar al final:

```ts
/**
 * Cambio de la contraseña PROPIA (spec §4.1 / IMPLEMENTATION-F2.md §5.5 A).
 *
 * No necesita ruta en la API: Supabase Auth deja que una sesión válida cambie su
 * propia contraseña desde el cliente. `current` se pide porque updateUser NO la
 * exige, y sin eso cualquiera con el dispositivo desbloqueado cambia la clave.
 */
export const changePasswordSchema = z
  .object({
    current: z.string().min(1, 'Ingresá tu contraseña actual'),
    // Misma regla que registerSchema: una sola fuente para el mínimo.
    next: z.string().min(8, 'Mínimo 8 caracteres').max(200),
    confirm: z.string().min(1, 'Repetí la contraseña nueva'),
  })
  .superRefine((data, ctx) => {
    if (data.next !== data.confirm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirm'],
        message: 'Las dos contraseñas nuevas no coinciden',
      })
    }
    if (data.next === data.current) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['next'],
        message: 'La nueva tiene que ser distinta de la actual',
      })
    }
  })

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
```

- [ ] **Step 4: Correr para ver que pasa**

Run: `pnpm --filter @coachlab/core test`
Expected: PASS, todo el paquete verde.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/validators
git commit -m "feat(validators): add session entry, day note and change-password schemas"
```

---

### Task 5: Migración `0015` — RLS de `session_logs` con el día scopeado

`session_logs_write` (migración `0003`) es solo `player_id = auth.uid()`: la base **no verifica que
`day_id` sea de un programa que le llegue al jugador**. Un jugador reasignado sigue pudiendo escribir
contra los días del programa anterior, y una ruta futura que escriba `session_logs` sin pasar por el
guard de la API no encontraría ninguna red debajo.

**Files:**
- Create: `supabase/migrations/0015_session_logs_day_scope.sql`
- Modify: `packages/web/types/database.ts` (regenerado, no editado a mano)

- [ ] **Step 1: Escribir la migración**

`supabase/migrations/0015_session_logs_day_scope.sql`:

```sql
-- La RLS de session_logs no scopeaba el día.
--
-- session_logs_write (0003) era solo `player_id = auth.uid()`. Es correcto en
-- cuanto a DE QUIÉN es el log, pero no dice nada de CONTRA QUÉ se registra: el
-- day_id podía ser de cualquier día de cualquier programa. Un jugador que el
-- coach reasignó seguía pudiendo escribir contra los días del programa viejo, y
-- una ruta nueva que escribiera session_logs sin pasar por assertOwnedDay no
-- tenía ninguna red debajo.
--
-- Es la misma clase de agujero que las tres pasadas de auditoría de F2
-- encontraron una y otra vez: un guard que solo vive en el código. CLAUDE.md §4
-- es explícito en que la capa 1 es la única que un bug de aplicación no puede
-- saltear, así que se cierra en la base ADEMÁS de en la API.

-- El programa al que pertenece un día. security definer para que la política no
-- dependa de que el actor pueda leer `days` por su cuenta.
--
-- Qué expone: dado el uuid de un día, el uuid de su programa. Los dos son uuids
-- opacos y no revelan datos de negocio.
create or replace function public.program_of_day(d uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select w.program_id
  from public.days dd
  join public.weeks w on w.id = dd.week_id
  where dd.id = d
$$;

-- `from public, anon`, NO solo `from anon`: Postgres otorga EXECUTE a PUBLIC al
-- crear una función, y revocar solo a anon deja ese grant en pie. Es la lección
-- de IMPLEMENTATION-F2.md §4.2, donde la forma incompleta se copió tres veces y
-- dejó tres RPCs alcanzables con la anon key.
revoke execute on function public.program_of_day(uuid) from public, anon;
grant  execute on function public.program_of_day(uuid) to authenticated;

-- Solo se endurece el WITH CHECK, no el USING:
--   * USING gobierna qué filas ves para modificar y BORRAR. Dejarlo abierto a
--     tus propios logs permite borrar los viejos y no bloquea un DELETE (que no
--     evalúa WITH CHECK).
--   * WITH CHECK gobierna la fila RESULTANTE de un INSERT/UPDATE: ahí es donde
--     el día tiene que ser de un programa que te alcance.
--
-- No aplica la trampa del 42501 de CLAUDE.md §3: esa muerde cuando un UPDATE
-- saca la fila del alcance de su política de SELECT, y acá session_logs_select
-- NO se toca, así que la fila resultante sigue visible para su dueño.
drop policy session_logs_write on public.session_logs;

create policy session_logs_write on public.session_logs for all to authenticated
  using (player_id = auth.uid())
  with check (
    player_id = auth.uid()
    and public.can_read_program(public.program_of_day(day_id))
  );

-- exercise_entries NO necesita cambios: su política de escritura ya exige que el
-- session_log_id sea de un log propio, y ese log ahora está scopeado por día.
```

- [ ] **Step 2: Aplicar**

Run: `pnpm db:push`
Expected: `Applying migration 0015_session_logs_day_scope.sql...` y termina sin error.

- [ ] **Step 3: Regenerar los tipos**

Run: `pnpm gen:types`
Expected: `packages/web/types/database.ts` reescrito. No cambia nada de estructura (la migración solo
toca políticas y una función), pero se regenera igual para no dejar el archivo desfasado.

- [ ] **Step 4: Verificar el efecto en vivo**

Efecto lateral esperado y aceptado (spec §4.2): si el coach reasigna al jugador, sus logs viejos quedan
de **solo lectura** — los sigue viendo, no los puede modificar.

Run: con el jugador de prueba logueado, desde la consola del browser en `/player/week`:

```js
const { error } = await window.$nuxt.$supabase
  .from('session_logs')
  .insert({ player_id: (await window.$nuxt.$supabase.auth.getUser()).data.user.id,
            day_id: '00000000-0000-0000-0000-000000000000' })
console.log(error?.code, error?.message)
```

Expected: `42501 new row violates row-level security policy for table "session_logs"`.
Un `day_id` inexistente ahora corta en la política, no en la FK.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0015_session_logs_day_scope.sql packages/web/types/database.ts
git commit -m "fix(security): scope session_logs writes to the player's own program"
```

---

### Task 6: Capa de acceso — cargar la semana y guardar el día

**Files:**
- Create: `packages/api/src/access/embedded.ts`
- Create: `packages/api/src/access/playerWeek.ts`
- Create: `packages/api/src/access/playerDay.ts`

- [ ] **Step 1: El helper de embeds**

El cliente de `packages/api` **no** está tipado con `Database` (los tipos generados viven en
`packages/web`, deuda conocida de F2 §6), así que TS infiere los embeds many-to-one como arrays cuando
en runtime son objetos. `coach/players.ts` ya normaliza las dos formas inline; F3 lo necesita en cinco
lugares, así que se extrae.

`packages/api/src/access/embedded.ts`:

```ts
/**
 * Normaliza un embed de PostgREST.
 *
 * Una relación many-to-one vuelve como OBJETO en runtime, pero el cliente de
 * este paquete no está tipado con `Database` —los tipos generados viven en
 * packages/web (deuda de IMPLEMENTATION-F2.md §6)— así que TS la infiere como
 * array. Se normalizan las dos formas en vez de castear: un cast mentiría sobre
 * lo que llega.
 */
export function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}
```

- [ ] **Step 2: Cargar la semana**

`packages/api/src/access/playerWeek.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildPlayerDay,
  type LoggedEntry,
  type PlannedBlock,
  type PlayerDay,
} from '@coachlab/core/domain/buildPlayerDay'
import type { LoadType } from '@coachlab/core/domain/calcLoad'
import type { PerfRecord } from '@coachlab/core/domain/lastPerf'
import type { OneRmRecord } from '@coachlab/core/domain/rmFor'
import { sortByOrderIndex } from '@coachlab/core/domain/tree'
import { activeProgramIdFor } from './assignments'
import { firstOf } from './embedded'

export type PlayerWeek = {
  programId: string
  programName: string
  weekId: string
  weekName: string
  days: PlayerDay[]
  completedDayIds: string[]
}

type ExerciseRow = {
  id: string
  load_type: LoadType
  weight: number | null
  percentage: number | null
  load_label: string | null
  sets: number | null
  reps: string | null
  target_rpe: number | null
  order_index: number | null
  exercises: { name: string; normalized_name: string } | { name: string; normalized_name: string }[] | null
}

type BlockRow = {
  id: string
  type: string
  rounds: number | null
  order_index: number | null
  block_exercises: ExerciseRow[] | null
}

type DayRow = {
  id: string
  name: string
  order_index: number | null
  blocks: BlockRow[] | null
}

type LogRow = {
  id: string
  day_id: string
  note: string | null
  completed_at: string | null
  updated_at: string
  days: { name: string; weeks: { name: string } | { name: string }[] } | Array<{ name: string; weeks: { name: string } | { name: string }[] }> | null
}

type EntryRow = {
  session_log_id: string
  block_exercise_id: string
  weight: number | null
  reps: number | null
  rpe: number | null
  block_exercises:
    | { exercises: { normalized_name: string } | { normalized_name: string }[] }
    | Array<{ exercises: { normalized_name: string } | { normalized_name: string }[] }>
    | null
}

/**
 * La semana vigente del jugador, lista para renderizar.
 *
 * Todas las queries van con el cliente creado a partir de la sesión del usuario
 * (CLAUDE.md §4): RLS es la que garantiza que no vea nada ajeno. NUNCA
 * service_role.
 */
export async function playerWeekFor(
  db: SupabaseClient,
  player: { id: string; positionId: string | null },
): Promise<PlayerWeek | null> {
  const programId = await activeProgramIdFor(db, player)
  if (!programId) return null

  // `weeks!weeks_program_id_fkey` NO es opcional: hay dos caminos FK entre
  // programs y weeks (weeks.program_id y programs.current_week_id) y PostgREST
  // devuelve 500 "more than one relationship was found" si no se desambigua.
  // Es el bug de IMPLEMENTATION-F2.md §4.3.
  const { data: program, error: programError } = await db
    .from('programs')
    .select('id, name, current_week_id, weeks!weeks_program_id_fkey(id, name, order_index)')
    .eq('id', programId)
    .maybeSingle()
  if (programError) throw new Error(programError.message)
  if (!program) return null

  const weeks = sortByOrderIndex(
    (program.weeks ?? []) as { id: string; name: string; order_index: number | null }[],
  )
  // La semana vigente es la del programa; si el coach no la fijó, la primera.
  const week = weeks.find((w) => w.id === program.current_week_id) ?? weeks[0]
  if (!week) return null

  const [tree, oneRms, history] = await Promise.all([
    loadTree(db, week.id),
    loadOneRms(db, player.id),
    loadHistory(db, player.id),
  ])

  const days = tree.map((day) =>
    buildPlayerDay({
      day: { id: day.id, name: day.name, blocks: day.blocks },
      weekName: week.name,
      oneRms,
      history: history.records,
      entries: history.entriesByDay.get(day.id) ?? [],
    }),
  )

  return {
    programId: program.id,
    programName: program.name,
    weekId: week.id,
    weekName: week.name,
    days,
    completedDayIds: history.completedDayIds,
  }
}

/** El árbol de la semana en un request. Ordenado por order_index explícito. */
async function loadTree(
  db: SupabaseClient,
  weekId: string,
): Promise<{ id: string; name: string; blocks: PlannedBlock[] }[]> {
  const { data, error } = await db
    .from('days')
    .select(
      `id, name, order_index,
       blocks (
         id, type, rounds, order_index,
         block_exercises (
           id, load_type, weight, percentage, load_label, sets, reps, target_rpe, order_index,
           exercises ( name, normalized_name )
         )
       )`,
    )
    .eq('week_id', weekId)
  if (error) throw new Error(error.message)

  // CLAUDE.md §3: el orden NUNCA sale del orden en que vuelven las filas.
  return sortByOrderIndex((data ?? []) as DayRow[]).map((day) => ({
    id: day.id,
    name: day.name,
    blocks: sortByOrderIndex(day.blocks ?? []).map((block) => ({
      id: block.id,
      type: block.type === 'CIRCUIT' ? ('CIRCUIT' as const) : ('SINGLE' as const),
      rounds: block.rounds,
      exercises: sortByOrderIndex(block.block_exercises ?? []).map((be) => ({
        id: be.id,
        exerciseName: firstOf(be.exercises)?.name ?? 'Ejercicio',
        sets: be.sets,
        reps: be.reps,
        loadType: be.load_type,
        weight: be.weight,
        percentage: be.percentage,
        loadLabel: be.load_label,
        targetRpe: be.target_rpe,
      })),
    })),
  }))
}

async function loadOneRms(db: SupabaseClient, playerId: string): Promise<OneRmRecord[]> {
  const { data, error } = await db
    .from('one_rms')
    .select('kg, exercises(normalized_name)')
    .eq('player_id', playerId)
  if (error) throw new Error(error.message)

  return (data ?? []).flatMap((row) => {
    const normalizedName = firstOf(
      row.exercises as { normalized_name: string } | { normalized_name: string }[] | null,
    )?.normalized_name
    return normalizedName ? [{ normalizedName, kg: row.kg as number }] : []
  })
}

/**
 * El historial completo del jugador, más lo que registró en cada día.
 *
 * DOS queries simples en vez de una anidada ingeniosa, a propósito: un string de
 * select no lo ve el typecheck y solo lo agarra un smoke con sesión real
 * (IMPLEMENTATION-F2.md §4.3). A 40–60 jugadores dos requests son gratis
 * (CLAUDE.md §2: no optimizar prematuramente).
 */
async function loadHistory(
  db: SupabaseClient,
  playerId: string,
): Promise<{
  records: PerfRecord[]
  entriesByDay: Map<string, LoggedEntry[]>
  completedDayIds: string[]
}> {
  const { data: logs, error: logsError } = await db
    .from('session_logs')
    .select('id, day_id, note, completed_at, updated_at, days!inner(name, weeks!inner(name))')
    .eq('player_id', playerId)
  if (logsError) throw new Error(logsError.message)

  const logRows = (logs ?? []) as LogRow[]
  if (logRows.length === 0) {
    return { records: [], entriesByDay: new Map(), completedDayIds: [] }
  }

  const { data: entries, error: entriesError } = await db
    .from('exercise_entries')
    .select(
      'session_log_id, block_exercise_id, weight, reps, rpe, block_exercises!inner(exercises!inner(normalized_name))',
    )
    .in(
      'session_log_id',
      logRows.map((log) => log.id),
    )
  if (entriesError) throw new Error(entriesError.message)

  const logById = new Map(logRows.map((log) => [log.id, log]))
  const records: PerfRecord[] = []
  const entriesByDay = new Map<string, LoggedEntry[]>()

  for (const row of (entries ?? []) as EntryRow[]) {
    const log = logById.get(row.session_log_id)
    if (!log) continue

    const entry: LoggedEntry = {
      blockExerciseId: row.block_exercise_id,
      weight: row.weight,
      reps: row.reps,
      rpe: row.rpe,
    }
    const forDay = entriesByDay.get(log.day_id)
    if (forDay) forDay.push(entry)
    else entriesByDay.set(log.day_id, [entry])

    const day = firstOf(log.days)
    const normalizedName = firstOf(firstOf(row.block_exercises)?.exercises)?.normalized_name
    if (!day || !normalizedName) continue

    records.push({
      normalizedName,
      dayId: log.day_id,
      weekName: firstOf(day.weeks)?.name ?? '',
      dayName: day.name,
      weight: row.weight,
      reps: row.reps,
      rpe: row.rpe,
      // Un día registrado y todavía no cerrado igual es "la última vez".
      performedAt: new Date(log.completed_at ?? log.updated_at),
    })
  }

  return {
    records,
    entriesByDay,
    completedDayIds: logRows.filter((log) => log.completed_at !== null).map((log) => log.day_id),
  }
}

/** La nota que el jugador dejó en un día, para prellenar el textarea. */
export async function dayNotesFor(
  db: SupabaseClient,
  playerId: string,
  dayIds: readonly string[],
): Promise<Map<string, string | null>> {
  if (dayIds.length === 0) return new Map()

  const { data, error } = await db
    .from('session_logs')
    .select('day_id, note')
    .eq('player_id', playerId)
    .in('day_id', [...dayIds])
  if (error) throw new Error(error.message)

  return new Map((data ?? []).map((row) => [row.day_id as string, row.note as string | null]))
}
```

- [ ] **Step 3: El guard de escritura**

`packages/api/src/access/playerDay.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { NotFoundError } from '@coachlab/core/access/rbac'
import { assertRow } from '../routes/coach/_scope'
import { activeProgramIdFor } from './assignments'
import { firstOf } from './embedded'

export type SessionLog = { id: string; completed_at: string | null }

/**
 * Confirma que el día es del programa VIGENTE del jugador y —si se pasa— que el
 * blockExerciseId vive en ESE día.
 *
 * Sin esto, un jugador registra contra el programa de cualquier otro coach
 * conociendo un dayId. La migración 0015 lo respalda en la base; este guard
 * existe para dar 404 con el status correcto en vez de un error de RLS que
 * llegaría como 500 poco informativo (CLAUDE.md §4, capa 4).
 *
 * Recurso ajeno → 404, nunca 403: no se revela existencia.
 */
export async function assertOwnedDay(
  db: SupabaseClient,
  player: { id: string; positionId: string | null },
  dayId: string,
  blockExerciseId?: string,
): Promise<void> {
  const programId = await activeProgramIdFor(db, player)
  if (!programId) throw new NotFoundError()

  const { data: dayRow, error: dayError } = await db
    .from('days')
    .select('id, weeks!inner(program_id)')
    .eq('id', dayId)
    .maybeSingle()
  const day = assertRow(dayRow, dayError)

  if (firstOf(day.weeks as { program_id: string } | { program_id: string }[])?.program_id !== programId) {
    throw new NotFoundError()
  }

  if (blockExerciseId === undefined) return

  const { data: beRow, error: beError } = await db
    .from('block_exercises')
    .select('id, blocks!inner(day_id)')
    .eq('id', blockExerciseId)
    .maybeSingle()
  const blockExercise = assertRow(beRow, beError)

  if (firstOf(blockExercise.blocks as { day_id: string } | { day_id: string }[])?.day_id !== dayId) {
    throw new NotFoundError()
  }
}

/**
 * El log del día, creándolo si falta.
 *
 * `upsert` y no select-después-insert: dos requests casi simultáneos del mismo
 * jugador (dos inputs con autosave venciendo juntos) chocarían con el UNIQUE
 * (player_id, day_id). El upsert es atómico e idempotente.
 *
 * Bumpear updated_at es correcto acá: solo se llama desde escrituras.
 */
export async function ensureSessionLog(
  db: SupabaseClient,
  playerId: string,
  dayId: string,
): Promise<SessionLog> {
  const { data, error } = await db
    .from('session_logs')
    .upsert({ player_id: playerId, day_id: dayId }, { onConflict: 'player_id,day_id' })
    .select('id, completed_at')
    .maybeSingle()

  return assertRow(data, error) as SessionLog
}
```

- [ ] **Step 4: Verificar**

Run: `pnpm typecheck`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/access
git commit -m "feat(access): load the player week and guard day ownership"
```

---

### Task 7: Rutas de la semana del jugador

**Files:**
- Create: `packages/api/src/routes/player/week.ts`
- Test: `packages/api/src/routes/player/week.test.ts`
- Modify: `packages/api/src/app.ts`

- [ ] **Step 1: Que el actor traiga la posición**

`candidateAssignmentsFor` necesita el puesto para resolver assignments por posición y por grupo, pero el
`Actor` que arma `withActor` no lo trae (su select es `id, email, name, role, invite_code, coach_id`).
**Esto va primero**: sin el puesto, un jugador solo vería programas asignados a él individualmente, y
los tres niveles de prioridad restantes quedarían muertos en silencio.

En `packages/core/src/access/rbac.ts`, extender el actor sin tocar `SessionUser` (que es el contrato de
la sesión del frontend y no necesita el puesto):

```ts
/**
 * El actor de un request autenticado.
 *
 * Es el SessionUser más `positionId`, que la API necesita para resolver el
 * programa del jugador (los assignments scopean por puesto y por grupo) y que el
 * frontend no usa. El rol NUNCA sale del JWT (CLAUDE.md §4).
 */
export type Actor = SessionUser & { positionId: string | null }
```

En `packages/api/src/middleware/auth.ts`, agregar `position_id` al select y al actor:

```ts
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, name, role, invite_code, coach_id, position_id')
    .eq('id', user.id)
    .single()

  if (profile) {
    c.set('actor', {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: profile.role as Role,
      inviteCode: profile.invite_code,
      coachId: profile.coach_id,
      positionId: profile.position_id,
    })
  }
```

Run: `pnpm typecheck`
Expected: puede fallar en `packages/api/src/middleware/auth.test.ts` si construye un `Actor` literal —
agregarle `positionId: null` a esos fixtures. Verde antes de seguir.

- [ ] **Step 2: La ruta**

`packages/api/src/routes/player/week.ts`:

```ts
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { dayNoteSchema, exerciseEntrySchema } from '@coachlab/core/validators/session'
import { assertOwnedDay, ensureSessionLog } from '../../access/playerDay'
import { dayNotesFor, playerWeekFor } from '../../access/playerWeek'
import type { AuthVariables } from '../../middleware/auth'
import { ErrorResponse } from '../schemas'
import { assertRow } from '../coach/_scope'

const DayIdParam = z.object({
  dayId: z.string().uuid().openapi({ param: { name: 'dayId', in: 'path' } }),
})

const EntryParams = DayIdParam.extend({
  blockExerciseId: z.string().uuid().openapi({ param: { name: 'blockExerciseId', in: 'path' } }),
})

const LoadResult = z
  .object({
    kind: z.enum(['weight', 'percentage', 'missing-1rm', 'label', 'none']),
    label: z.string(),
    kg: z.number().optional(),
    percentage: z.number().optional(),
  })
  .openapi('LoadResult')

const PlayerExercise = z
  .object({
    id: z.string(),
    exerciseName: z.string(),
    sets: z.number().nullable(),
    reps: z.string().nullable(),
    targetRpe: z.number().nullable(),
    load: LoadResult,
    lastPerfLabel: z.string().nullable(),
    entry: z
      .object({
        blockExerciseId: z.string(),
        weight: z.number().nullable(),
        reps: z.number().nullable(),
        rpe: z.number().nullable(),
      })
      .nullable(),
  })
  .openapi('PlayerExercise')

const PlayerBlock = z
  .object({
    id: z.string(),
    type: z.enum(['SINGLE', 'CIRCUIT']),
    rounds: z.number().nullable(),
    exercises: z.array(PlayerExercise),
  })
  .openapi('PlayerBlock')

const PlayerDay = z
  .object({
    id: z.string(),
    name: z.string(),
    weekName: z.string(),
    blocks: z.array(PlayerBlock),
    missingOneRms: z.array(z.string()),
    loggedCount: z.number(),
    totalCount: z.number(),
    note: z.string().nullable(),
    completed: z.boolean(),
  })
  .openapi('PlayerDay')

const WeekResponse = z
  .object({
    ok: z.literal(true),
    /** null cuando el jugador todavía no tiene programa asignado. */
    week: z
      .object({
        programName: z.string(),
        weekName: z.string(),
        days: z.array(PlayerDay),
      })
      .nullable(),
  })
  .openapi('PlayerWeekResponse')

const OkResponse = z.object({ ok: z.literal(true) }).openapi('OkResponse')

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

const CLOSED_DAY = 'Este día ya está cerrado. Reabrilo si querés cambiar algo.'

export const playerWeek = new OpenAPIHono<{ Variables: AuthVariables }>()

// --- ver la semana -----------------------------------------------------------

playerWeek.openapi(
  createRoute({
    method: 'get',
    path: '/player/week',
    summary: 'La semana vigente del jugador con las cargas ya calculadas',
    responses: {
      200: { description: 'La semana', content: { 'application/json': { schema: WeekResponse } } },
      401: errors[401],
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const db = c.get('db')

    const week = await playerWeekFor(db, { id: actor.id, positionId: actor.positionId })
    if (!week) return c.json({ ok: true as const, week: null }, 200)

    const notes = await dayNotesFor(
      db,
      actor.id,
      week.days.map((day) => day.id),
    )
    const completed = new Set(week.completedDayIds)

    return c.json(
      {
        ok: true as const,
        week: {
          programName: week.programName,
          weekName: week.weekName,
          days: week.days.map((day) => ({
            ...day,
            note: notes.get(day.id) ?? null,
            completed: completed.has(day.id),
          })),
        },
      },
      200,
    )
  },
)

// --- registrar un ejercicio --------------------------------------------------

playerWeek.openapi(
  createRoute({
    method: 'put',
    path: '/player/days/{dayId}/entries/{blockExerciseId}',
    summary: 'Registrar peso, reps y RPE de un ejercicio',
    request: {
      params: EntryParams,
      body: { content: { 'application/json': { schema: exerciseEntrySchema } } },
    },
    responses: {
      200: { description: 'Guardado', content: { 'application/json': { schema: OkResponse } } },
      409: {
        description: 'El día está cerrado',
        content: { 'application/json': { schema: ErrorResponse } },
      },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const { dayId, blockExerciseId } = c.req.valid('param')
    const input = c.req.valid('json')
    const db = c.get('db')

    await assertOwnedDay(db, { id: actor.id, positionId: actor.positionId }, dayId, blockExerciseId)

    const log = await ensureSessionLog(db, actor.id, dayId)
    if (log.completed_at !== null) {
      return c.json({ ok: false as const, error: CLOSED_DAY }, 409)
    }

    const weight = input.weight ?? null
    const reps = input.reps ?? null
    const rpe = input.rpe ?? null

    // Los tres en null significa "no registré nada": se borra la fila en vez de
    // dejar una entry vacía, que sería indistinguible de un registro a medias y
    // rompería el contador de progreso.
    if (weight === null && reps === null && rpe === null) {
      const { error } = await db
        .from('exercise_entries')
        .delete()
        .eq('session_log_id', log.id)
        .eq('block_exercise_id', blockExerciseId)
      if (error) throw new Error(error.message)
      return c.json({ ok: true as const }, 200)
    }

    const { data, error } = await db
      .from('exercise_entries')
      .upsert(
        { session_log_id: log.id, block_exercise_id: blockExerciseId, weight, reps, rpe },
        { onConflict: 'session_log_id,block_exercise_id' },
      )
      .select('id')
      .maybeSingle()
    assertRow(data, error)

    return c.json({ ok: true as const }, 200)
  },
)

// --- cerrar y reabrir el día -------------------------------------------------

playerWeek.openapi(
  createRoute({
    method: 'post',
    path: '/player/days/{dayId}/complete',
    summary: 'Completar el día con una nota',
    request: {
      params: DayIdParam,
      body: { content: { 'application/json': { schema: dayNoteSchema } } },
    },
    responses: {
      200: { description: 'Completado', content: { 'application/json': { schema: OkResponse } } },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const { dayId } = c.req.valid('param')
    const { note } = c.req.valid('json')
    const db = c.get('db')

    await assertOwnedDay(db, { id: actor.id, positionId: actor.positionId }, dayId)
    const log = await ensureSessionLog(db, actor.id, dayId)

    const { data, error } = await db
      .from('session_logs')
      .update({ note: note ?? null, completed_at: new Date().toISOString() })
      .eq('id', log.id)
      .select('id')
      .maybeSingle()
    assertRow(data, error)

    return c.json({ ok: true as const }, 200)
  },
)

playerWeek.openapi(
  createRoute({
    method: 'post',
    path: '/player/days/{dayId}/reopen',
    summary: 'Reabrir un día cerrado',
    request: { params: DayIdParam },
    responses: {
      200: { description: 'Reabierto', content: { 'application/json': { schema: OkResponse } } },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const { dayId } = c.req.valid('param')
    const db = c.get('db')

    await assertOwnedDay(db, { id: actor.id, positionId: actor.positionId }, dayId)

    const { data, error } = await db
      .from('session_logs')
      .update({ completed_at: null })
      .eq('player_id', actor.id)
      .eq('day_id', dayId)
      .select('id')
      .maybeSingle()
    assertRow(data, error)

    return c.json({ ok: true as const }, 200)
  },
)
```

- [ ] **Step 3: Montar en la app**

En `packages/api/src/app.ts`, agregar el import y la ruta:

```ts
import { playerWeek } from './routes/player/week'
```

```ts
app.route('/', playerWeek)
```

- [ ] **Step 4: Tests de scoping**

`packages/api/src/routes/player/week.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { app } from '../../app'

const DAY = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const BE = '3fa85f64-5717-4562-b3fc-2c963f66afa6'

describe('rutas de la semana del jugador sin sesión', () => {
  const cases: [string, RequestInit | undefined][] = [
    ['/api/player/week', undefined],
    [`/api/player/days/${DAY}/entries/${BE}`, { method: 'PUT', body: '{}' }],
    [`/api/player/days/${DAY}/complete`, { method: 'POST', body: '{}' }],
    [`/api/player/days/${DAY}/reopen`, { method: 'POST' }],
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

describe('el guard de /player/* no admite otros roles', () => {
  it('el prefijo está montado con requireRole(["PLAYER"])', async () => {
    // Sin sesión el guard corta con 401 antes de tocar la base. Que el guard
    // exista es lo que este test fija: una ruta nueva bajo /player/* nace
    // protegida (CLAUDE.md §4, capa 2).
    const res = await app.request('/api/player/week')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false, error: 'No autorizado' })
  })
})

describe('spec de la semana del jugador', () => {
  it('incluye las rutas', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as { paths: Record<string, unknown> }
    expect(spec.paths).toHaveProperty('/api/player/week')
    expect(spec.paths).toHaveProperty('/api/player/days/{dayId}/entries/{blockExerciseId}')
    expect(spec.paths).toHaveProperty('/api/player/days/{dayId}/complete')
    expect(spec.paths).toHaveProperty('/api/player/days/{dayId}/reopen')
  })

  it('el PUT de una entry declara el 409 del día cerrado', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as {
      paths: Record<string, Record<string, { responses: Record<string, unknown> }>>
    }
    const put = spec.paths['/api/player/days/{dayId}/entries/{blockExerciseId}']!.put!
    expect(put.responses).toHaveProperty('409')
  })
})
```

- [ ] **Step 5: Correr**

Run: `pnpm --filter @coachlab/api test`
Expected: PASS. Los tests de F2 siguen verdes.

- [ ] **Step 6: Verificar**

Run: `pnpm typecheck`
Expected: verde. Si `Actor` rompió algún consumidor, se ve acá.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/routes/player/week.ts packages/api/src/routes/player/week.test.ts \
        packages/api/src/app.ts packages/api/src/middleware/auth.ts packages/core/src/access/rbac.ts
git commit -m "feat(api): add player week routes with day ownership checks"
```

---

### Task 8: Rutas del perfil del jugador

**Files:**
- Create: `packages/api/src/routes/player/profile.ts`
- Test: `packages/api/src/routes/player/profile.test.ts`
- Modify: `packages/core/src/validators/player.ts`
- Modify: `packages/api/src/app.ts`

- [ ] **Step 1: `name` al schema del perfil**

Decisión del spec §3.2: jugador y coach editan los mismos campos. Hoy `playerProfileSchema` no incluye
`name`, así que el nombre no lo edita nadie después del signup — lo que hace falsa la afirmación de
`IMPLEMENTATION-F2.md` §6.

En `packages/core/src/validators/player.ts`, agregar `name` al objeto:

```ts
export const playerProfileSchema = z.object({
  // Mismo mínimo que registerSchema. El jugador puede corregir su propio nombre
  // y el coach también (spec §3.2: los dos editan, el último que escribe gana).
  name: z.string().trim().min(2, 'Poné tu nombre (mínimo 2 letras)').max(80).optional(),
  positionId: z.string().refine(isPositionId, 'Puesto inválido').nullish(),
  heightCm: z.number().int().min(100, 'Muy poco').max(250, 'Demasiado').nullish(),
  weightKg: z.number().min(30, 'Muy poco').max(250, 'Demasiado').nullish(),
})
```

Y agregar a `packages/core/src/validators/player.test.ts`:

```ts
describe('playerProfileSchema con name', () => {
  it('acepta un nombre', () => {
    expect(playerProfileSchema.parse({ name: '  Juan Pérez  ' }).name).toBe('Juan Pérez')
  })

  it('rechaza un nombre de una letra', () => {
    expect(playerProfileSchema.safeParse({ name: 'J' }).success).toBe(false)
  })

  it('sigue descartando role y coachId', () => {
    const result = playerProfileSchema.parse({ role: 'ADMIN', coachId: 'otro', name: 'Juan' })
    expect(result).not.toHaveProperty('role')
    expect(result).not.toHaveProperty('coachId')
  })
})
```

> El PATCH del coach (`/coach/players/{playerId}`) usa el mismo schema, así que pasa a poder corregir
> el nombre de sus jugadores. Es exactamente lo que la decisión §3.2 pide.

- [ ] **Step 2: La ruta**

`packages/api/src/routes/player/profile.ts`:

```ts
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { SupabaseClient } from '@supabase/supabase-js'
import { oneRmSchema, playerProfileSchema } from '@coachlab/core/validators/player'
import { firstOf } from '../../access/embedded'
import type { AuthVariables } from '../../middleware/auth'
import { assertRow, assertRpcOk } from '../coach/_scope'
import { ErrorResponse } from '../schemas'

const ExerciseIdParam = z.object({
  exerciseId: z.string().uuid().openapi({ param: { name: 'exerciseId', in: 'path' } }),
})

const OneRm = z
  .object({
    exerciseId: z.string(),
    exerciseName: z.string(),
    kg: z.number(),
    updatedAt: z.string(),
  })
  .openapi('PlayerOneRm')

const Profile = z
  .object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    positionId: z.string().nullable(),
    heightCm: z.number().nullable(),
    weightKg: z.number().nullable(),
    coachName: z.string().nullable(),
  })
  .openapi('PlayerProfile')

const ProfileResponse = z
  .object({ ok: z.literal(true), profile: Profile, oneRms: z.array(OneRm) })
  .openapi('PlayerProfileResponse')

const OkResponse = z.object({ ok: z.literal(true) }).openapi('PlayerOkResponse')

const redeemSchema = z.object({ code: z.string().trim().min(1, 'Ingresá el código') })

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

type ProfileRow = {
  id: string
  email: string
  name: string
  position_id: string | null
  height_cm: number | null
  weight_kg: number | null
  coach_id: string | null
}

export const playerProfile = new OpenAPIHono<{ Variables: AuthVariables }>()

/**
 * El perfil y los 1RM, que devuelven las cuatro rutas de abajo.
 *
 * Recibe `db` y `playerId` en vez del contexto de Hono: así no depende de los
 * genéricos de OpenAPIHono, que son incómodos de nombrar y no aportan nada acá.
 */
async function readProfile(db: SupabaseClient, playerId: string) {
  const { data, error } = await db
    .from('profiles')
    .select('id, email, name, position_id, height_cm, weight_kg, coach_id')
    .eq('id', playerId)
    .maybeSingle()
  const profile = assertRow(data as ProfileRow | null, error)

  // RLS (profiles_select) deja al jugador leer la fila de SU coach: `id = my_coach_id()`.
  let coachName: string | null = null
  if (profile.coach_id) {
    const { data: coach } = await db
      .from('profiles')
      .select('name')
      .eq('id', profile.coach_id)
      .maybeSingle()
    coachName = (coach?.name as string | undefined) ?? null
  }

  const { data: rms, error: rmsError } = await db
    .from('one_rms')
    .select('exercise_id, kg, updated_at, exercises(name)')
    .eq('player_id', playerId)
  if (rmsError) throw new Error(rmsError.message)

  const oneRms = (rms ?? []).map((r) => ({
    exerciseId: r.exercise_id as string,
    exerciseName: firstOf(r.exercises as { name: string } | { name: string }[] | null)?.name ?? '—',
    kg: r.kg as number,
    updatedAt: r.updated_at as string,
  }))
  oneRms.sort((a, b) => a.exerciseName.localeCompare(b.exerciseName))

  return {
    profile: {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      positionId: profile.position_id,
      heightCm: profile.height_cm,
      weightKg: profile.weight_kg,
      coachName,
    },
    oneRms,
  }
}

// --- ver y editar el perfil --------------------------------------------------

playerProfile.openapi(
  createRoute({
    method: 'get',
    path: '/player/profile',
    summary: 'Mi perfil y mis 1RM',
    responses: {
      200: { description: 'Perfil', content: { 'application/json': { schema: ProfileResponse } } },
      ...errors,
    },
  }),
  async (c) => c.json({ ok: true as const, ...(await readProfile(c.get('db'), c.get('actor')!.id)) }, 200),
)

playerProfile.openapi(
  createRoute({
    method: 'patch',
    path: '/player/profile',
    summary: 'Editar mi nombre, puesto y medidas',
    request: { body: { content: { 'application/json': { schema: playerProfileSchema } } } },
    responses: {
      200: { description: 'Actualizado', content: { 'application/json': { schema: ProfileResponse } } },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const input = c.req.valid('json')
    const db = c.get('db')

    // Campo por campo desde el objeto ya validado, nunca un spread del body:
    // profiles vive en la misma tabla que el rol. Zod ya descartó lo que no es
    // del schema y guard_profile_changes lo frena en la base (tres capas, §4).
    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) patch.name = input.name
    if (input.positionId !== undefined) patch.position_id = input.positionId ?? null
    if (input.heightCm !== undefined) patch.height_cm = input.heightCm ?? null
    if (input.weightKg !== undefined) patch.weight_kg = input.weightKg ?? null

    if (Object.keys(patch).length > 0) {
      const { data, error } = await db
        .from('profiles')
        .update(patch)
        .eq('id', actor.id)
        .select('id')
        .maybeSingle()
      assertRow(data, error)
    }

    return c.json({ ok: true as const, ...(await readProfile(c.get('db'), c.get('actor')!.id)) }, 200)
  },
)

// --- 1RM ---------------------------------------------------------------------

playerProfile.openapi(
  createRoute({
    method: 'put',
    path: '/player/one-rms',
    summary: 'Cargar o actualizar uno de mis 1RM',
    request: { body: { content: { 'application/json': { schema: oneRmSchema } } } },
    responses: {
      200: { description: 'Guardado', content: { 'application/json': { schema: OkResponse } } },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const input = c.req.valid('json')

    // El jugador ELIGE del catálogo; no lo escribe. ensure_exercise (0012/0014)
    // rechaza a PLAYER a propósito: "un jugador no tiene por qué tocar el
    // catálogo global". El exerciseId viene del typeahead de /catalog/exercises,
    // y si no existe la FK lo rechaza y assertRow lo traduce a 404.
    const { data, error } = await c
      .get('db')
      .from('one_rms')
      .upsert(
        { player_id: actor.id, exercise_id: input.exerciseId, kg: input.kg },
        { onConflict: 'player_id,exercise_id' },
      )
      .select('exercise_id')
      .maybeSingle()
    assertRow(data, error)

    return c.json({ ok: true as const }, 200)
  },
)

playerProfile.openapi(
  createRoute({
    method: 'delete',
    path: '/player/one-rms/{exerciseId}',
    summary: 'Borrar uno de mis 1RM',
    request: { params: ExerciseIdParam },
    responses: {
      200: { description: 'Borrado', content: { 'application/json': { schema: OkResponse } } },
      ...errors,
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const { exerciseId } = c.req.valid('param')

    const { data, error } = await c
      .get('db')
      .from('one_rms')
      .delete()
      .eq('player_id', actor.id)
      .eq('exercise_id', exerciseId)
      .select('exercise_id')
      .maybeSingle()
    assertRow(data, error)

    return c.json({ ok: true as const }, 200)
  },
)

// --- canjear el código del entrenador ----------------------------------------

playerProfile.openapi(
  createRoute({
    method: 'post',
    path: '/player/redeem-invite',
    summary: 'Vincularme a un entrenador con su código',
    request: { body: { content: { 'application/json': { schema: redeemSchema } } } },
    responses: {
      200: { description: 'Vinculado', content: { 'application/json': { schema: ProfileResponse } } },
      ...errors,
    },
  }),
  async (c) => {
    const { code } = c.req.valid('json')

    // El coach_id NUNCA llega por un PATCH: guard_profile_changes solo lo acepta
    // con el flag transaction-local que setea esta RPC (migración 0005, escrita
    // para esta pantalla).
    const { error } = await c.get('db').rpc('redeem_invite_code', { code })
    assertRpcOk(error)

    return c.json({ ok: true as const, ...(await readProfile(c.get('db'), c.get('actor')!.id)) }, 200)
  },
)
```

- [ ] **Step 3: Montar en la app**

En `packages/api/src/app.ts`:

```ts
import { playerProfile } from './routes/player/profile'
```

```ts
app.route('/', playerProfile)
```

- [ ] **Step 4: Tests**

`packages/api/src/routes/player/profile.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { playerProfileSchema } from '@coachlab/core/validators/player'
import { app } from '../../app'

const EXERCISE = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

describe('rutas del perfil del jugador sin sesión', () => {
  const cases: [string, RequestInit | undefined][] = [
    ['/api/player/profile', undefined],
    ['/api/player/profile', { method: 'PATCH', body: '{}' }],
    ['/api/player/one-rms', { method: 'PUT', body: '{}' }],
    [`/api/player/one-rms/${EXERCISE}`, { method: 'DELETE' }],
    ['/api/player/redeem-invite', { method: 'POST', body: '{}' }],
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

describe('el PATCH del perfil no acepta escalada de privilegios', () => {
  it('el schema descarta role, coachId, email e inviteCode', () => {
    const result = playerProfileSchema.parse({
      name: 'Juan',
      role: 'ADMIN',
      coachId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      email: 'otro@example.com',
      inviteCode: 'ABCDEF',
    })
    expect(Object.keys(result)).toEqual(['name'])
  })
})

describe('spec del perfil del jugador', () => {
  it('incluye las rutas', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as { paths: Record<string, unknown> }
    expect(spec.paths).toHaveProperty('/api/player/profile')
    expect(spec.paths).toHaveProperty('/api/player/one-rms')
    expect(spec.paths).toHaveProperty('/api/player/one-rms/{exerciseId}')
    expect(spec.paths).toHaveProperty('/api/player/redeem-invite')
  })
})
```

- [ ] **Step 5: Correr**

Run: `pnpm --filter @coachlab/api test && pnpm --filter @coachlab/core test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routes/player/profile.ts packages/api/src/routes/player/profile.test.ts \
        packages/api/src/app.ts packages/core/src/validators/player.ts \
        packages/core/src/validators/player.test.ts
git commit -m "feat(api): add player profile, one-rm and invite redemption routes"
```

---

### Task 9: "Mi semana" — la pantalla

**Files:**
- Create: `packages/web/app/composables/usePlayerApi.ts`
- Create: `packages/web/app/components/player/PlayerExerciseRow.vue`
- Create: `packages/web/app/components/player/DayCard.vue`
- Modify: `packages/web/app/pages/player/week.vue`
- Modify: `packages/web/nuxt.config.ts` (iconos nuevos)

- [ ] **Step 1: El composable**

`packages/web/app/composables/usePlayerApi.ts`:

```ts
/**
 * Llamadas a la API del jugador. Misma forma que useCoachApi: en SSR el fetch
 * interno no arrastra la cookie de sesión, así que se reenvía explícita.
 */
type Body = Record<string, unknown> | undefined

export function usePlayerApi() {
  async function call<T>(
    path: string,
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    body?: Body,
  ): Promise<T> {
    try {
      return (await $fetch(path, {
        method,
        body,
        headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
      })) as T
    } catch (error) {
      const data = (error as { data?: { error?: string } }).data
      throw new Error(data?.error ?? 'No se pudo completar la operación')
    }
  }

  return {
    get: <T>(path: string) => call<T>(path, 'GET'),
    post: <T>(path: string, body?: Body) => call<T>(path, 'POST', body),
    patch: <T>(path: string, body?: Body) => call<T>(path, 'PATCH', body),
    put: <T>(path: string, body?: Body) => call<T>(path, 'PUT', body),
    del: <T>(path: string) => call<T>(path, 'DELETE'),
  }
}

/** El shape que devuelve GET /api/player/week. */
export type PlayerLoad = {
  kind: 'weight' | 'percentage' | 'missing-1rm' | 'label' | 'none'
  label: string
  kg?: number
  percentage?: number
}

export type PlayerEntry = {
  blockExerciseId: string
  weight: number | null
  reps: number | null
  rpe: number | null
}

export type PlayerExercise = {
  id: string
  exerciseName: string
  sets: number | null
  reps: string | null
  targetRpe: number | null
  load: PlayerLoad
  lastPerfLabel: string | null
  entry: PlayerEntry | null
}

export type PlayerBlock = {
  id: string
  type: 'SINGLE' | 'CIRCUIT'
  rounds: number | null
  exercises: PlayerExercise[]
}

export type PlayerDay = {
  id: string
  name: string
  weekName: string
  blocks: PlayerBlock[]
  missingOneRms: string[]
  loggedCount: number
  totalCount: number
  note: string | null
  completed: boolean
}

export type PlayerWeekPayload = {
  ok: true
  week: { programName: string; weekName: string; days: PlayerDay[] } | null
}
```

- [ ] **Step 2: La fila de ejercicio**

`packages/web/app/components/player/PlayerExerciseRow.vue`:

```vue
<script setup lang="ts">
import type { PlayerExercise } from '~/composables/usePlayerApi'

/**
 * El orden de esta fila está pensado para leerse PARADO ENTRE SERIES, del
 * celular: primero qué ejercicio, después con cuánto peso (grande, es lo que
 * vino a buscar), después el contexto, y al final los inputs.
 */
const props = defineProps<{ exercise: PlayerExercise; dayId: string; disabled: boolean }>()

const api = usePlayerApi()

const weight = ref<number | null>(
  props.exercise.entry?.weight ??
    // Prellenar con la carga calculada: el jugador solo la cambia si levantó
    // otra cosa. LABEL y NONE no tienen kg que sugerir.
    (props.exercise.load.kind === 'weight' || props.exercise.load.kind === 'percentage'
      ? (props.exercise.load.kg ?? null)
      : null),
)
const reps = ref<number | null>(props.exercise.entry?.reps ?? null)
const rpe = ref<number | null>(props.exercise.entry?.rpe ?? null)

const { trigger, state, error } = useDebouncedSave(async () => {
  await api.put(`/api/player/days/${props.dayId}/entries/${props.exercise.id}`, {
    weight: weight.value,
    reps: reps.value,
    rpe: rpe.value,
  })
})

const RPE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

const loadClass = computed(() =>
  props.exercise.load.kind === 'missing-1rm'
    ? 'text-lg font-semibold text-warning'
    : 'text-lg font-semibold',
)
</script>

<template>
  <div class="space-y-2 border-t border-default py-3 first:border-t-0">
    <div class="flex items-baseline justify-between gap-2">
      <p class="font-medium">{{ exercise.exerciseName }}</p>
      <p v-if="exercise.sets || exercise.reps" class="shrink-0 text-sm text-muted">
        {{ exercise.sets ?? 1 }} × {{ exercise.reps ?? '—' }}
      </p>
    </div>

    <p :class="loadClass">{{ exercise.load.label }}</p>

    <div class="flex flex-wrap items-center gap-2">
      <UBadge v-if="exercise.targetRpe != null" color="neutral" variant="subtle">
        RPE objetivo {{ exercise.targetRpe }}
      </UBadge>
      <p v-if="exercise.lastPerfLabel" class="flex items-center gap-1 text-xs text-muted">
        <UIcon name="i-lucide-history" class="size-3" />
        {{ exercise.lastPerfLabel }}
      </p>
    </div>

    <div class="flex flex-wrap items-end gap-2">
      <UFormField label="Peso" class="w-24">
        <UInput
          v-model.number="weight"
          type="number"
          step="0.5"
          min="0"
          :disabled="disabled"
          @update:model-value="trigger(undefined)"
        />
      </UFormField>
      <UFormField label="Reps" class="w-20">
        <UInput
          v-model.number="reps"
          type="number"
          min="0"
          :disabled="disabled"
          @update:model-value="trigger(undefined)"
        />
      </UFormField>
      <UFormField label="RPE" class="w-24">
        <USelect
          v-model="rpe"
          :items="RPE_OPTIONS"
          :disabled="disabled"
          @update:model-value="trigger(undefined)"
        />
      </UFormField>

      <p v-if="state === 'saving'" class="pb-2 text-xs text-muted">Guardando…</p>
      <p v-else-if="state === 'saved'" class="pb-2 text-xs text-muted">Guardado</p>
      <p v-else-if="state === 'error'" class="pb-2 text-xs text-error">{{ error }}</p>
    </div>
  </div>
</template>
```

- [ ] **Step 3: La tarjeta del día**

`packages/web/app/components/player/DayCard.vue`:

```vue
<script setup lang="ts">
import type { PlayerDay } from '~/composables/usePlayerApi'

const props = defineProps<{ day: PlayerDay }>()
const emit = defineEmits<{ changed: [] }>()

const api = usePlayerApi()
const toast = useToast()

const note = ref(props.day.note ?? '')
const busy = ref(false)

async function complete() {
  busy.value = true
  try {
    await api.post(`/api/player/days/${props.day.id}/complete`, { note: note.value || null })
    toast.add({ title: 'Día completado', description: 'Tu entrenador ya lo puede ver.' })
    emit('changed')
  } catch (error) {
    toast.add({
      title: 'No se pudo completar',
      description: error instanceof Error ? error.message : undefined,
      color: 'error',
    })
  } finally {
    busy.value = false
  }
}

async function reopen() {
  busy.value = true
  try {
    await api.post(`/api/player/days/${props.day.id}/reopen`)
    emit('changed')
  } catch (error) {
    toast.add({
      title: 'No se pudo reabrir',
      description: error instanceof Error ? error.message : undefined,
      color: 'error',
    })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-lg font-semibold">{{ day.name }}</h2>
        <div class="flex items-center gap-2">
          <UBadge color="neutral" variant="subtle">
            {{ day.loggedCount }}/{{ day.totalCount }} registrados
          </UBadge>
          <UBadge v-if="day.completed" color="success" variant="subtle">Completado</UBadge>
        </div>
      </div>
    </template>

    <div v-for="block in day.blocks" :key="block.id" class="mb-4 last:mb-0">
      <p v-if="block.type === 'CIRCUIT'" class="mb-1 text-sm font-medium text-primary">
        Circuito · {{ block.rounds }} vueltas
      </p>
      <PlayerPlayerExerciseRow
        v-for="exercise in block.exercises"
        :key="exercise.id"
        :exercise="exercise"
        :day-id="day.id"
        :disabled="day.completed"
      />
    </div>

    <template #footer>
      <div class="space-y-3">
        <UFormField label="¿Cómo te fue hoy?">
          <UTextarea
            v-model="note"
            :rows="2"
            :disabled="day.completed"
            placeholder="Cómo te sentiste, si algo molestó, lo que quieras contarle a tu entrenador"
          />
        </UFormField>
        <UButton v-if="!day.completed" :loading="busy" @click="complete">Completar día</UButton>
        <UButton v-else color="neutral" variant="subtle" :loading="busy" @click="reopen">
          Reabrir
        </UButton>
      </div>
    </template>
  </UCard>
</template>
```

> **Nombre del componente:** en `components/player/PlayerExerciseRow.vue`, el auto-import de Nuxt lo
> expone como `<PlayerPlayerExerciseRow>` (directorio + nombre de archivo). Si molesta, renombrar el
> archivo a `components/player/ExerciseRow.vue` → `<PlayerExerciseRow>`. **Elegir uno y ser
> consistente**; el plan usa `PlayerExerciseRow.vue` con la etiqueta `<PlayerPlayerExerciseRow>` para
> que compile tal cual está escrito.

- [ ] **Step 4: La página**

Reemplazar `packages/web/app/pages/player/week.vue` completo:

```vue
<script setup lang="ts">
import type { PlayerWeekPayload } from '~/composables/usePlayerApi'

const { user } = useAuth()
const api = usePlayerApi()

const { data, refresh } = await useAsyncData('player-week', () =>
  api.get<PlayerWeekPayload>('/api/player/week'),
)

const week = computed(() => data.value?.week ?? null)

/** Los 1RM que faltan en toda la semana, no solo en un día. */
const missingOneRms = computed(() => [
  ...new Set((week.value?.days ?? []).flatMap((day) => day.missingOneRms)),
])
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h1 class="text-2xl font-bold">Mi semana</h1>
      <p v-if="week" class="text-sm text-muted">
        {{ week.programName }} · {{ week.weekName }}
      </p>
    </div>

    <!-- Jugador sin coach: el trigger no vincula si el código no matcheó. -->
    <UAlert
      v-if="user && !user.coachId"
      color="warning"
      variant="subtle"
      title="Tu cuenta no está vinculada a un entrenador"
      description="Pedile el código a tu entrenador y cargalo en Mi perfil."
    />

    <UAlert
      v-else-if="missingOneRms.length > 0"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="`Faltan tus 1RM de ${missingOneRms.join(', ')}`"
      description="Cargalos en Mi perfil para ver los kg de cada serie."
    />

    <UCard v-if="week === null && user?.coachId">
      <p class="text-muted">
        Todavía no tenés un programa asignado. Cuando tu entrenador te asigne uno, lo vas a ver acá.
      </p>
    </UCard>

    <div v-if="week" class="space-y-4">
      <PlayerDayCard
        v-for="day in week.days"
        :key="day.id"
        :day="day"
        @changed="refresh()"
      />
    </div>
  </div>
</template>
```

- [ ] **Step 5: Los iconos nuevos**

`i-lucide-history` es nuevo. Agregarlo a `clientBundle.icons` en `packages/web/nuxt.config.ts`, en
orden alfabético (entre `dumbbell` y `layout-grid`):

```ts
        'lucide:history',
```

- [ ] **Step 6: Verificar**

Run: `pnpm --filter @coachlab/web test`
Expected: PASS — `tests/icons.test.ts` confirma que la lista de iconos y el uso están sincronizados. Si
falla con "Faltan en clientBundle.icons", agregar el que reporta.

Run: `pnpm typecheck && pnpm --filter @coachlab/web build`
Expected: `Build complete`.

- [ ] **Step 7: Commit**

```bash
git add packages/web/app/composables/usePlayerApi.ts packages/web/app/components/player \
        packages/web/app/pages/player/week.vue packages/web/nuxt.config.ts
git commit -m "feat(player): add my week view with computed loads and session logging"
```

---

### Task 10: Perfil del jugador y cambio de contraseña

**Files:**
- Modify: `packages/web/app/composables/useAuth.ts`
- Create: `packages/web/app/pages/player/profile.vue`
- Modify: `packages/web/app/components/AppSidebar.vue`

- [ ] **Step 1: `changePassword` en `useAuth`**

Agregar la función dentro de `useAuth` y exponerla en el `return`:

```ts
  /**
   * Cambia la contraseña propia. No pasa por la API ni necesita la secret key:
   * Supabase Auth deja que una sesión válida cambie su propia contraseña
   * (decisión #1 de F1: la web es dueña del ciclo de vida de la sesión).
   */
  async function changePassword(current: string, next: string): Promise<void> {
    const email = user.value?.email
    if (!email) throw new Error('No hay sesión activa')

    // updateUser NO pide la contraseña actual, así que se re-autentica primero.
    // Sin esto, cualquiera con el dispositivo desbloqueado cambia la clave.
    const { error: reauth } = await $supabase.auth.signInWithPassword({
      email,
      password: current,
    })
    if (reauth) throw new Error('La contraseña actual no es correcta')

    const { error } = await $supabase.auth.updateUser({ password: next })
    if (error) {
      throw new Error(
        /at least|length|weak/i.test(error.message)
          ? 'La nueva contraseña tiene que tener al menos 8 caracteres'
          : 'No se pudo cambiar la contraseña',
      )
    }

    // signInWithPassword emitió una sesión nueva y pisó la cookie: hay que
    // resincronizar el estado o el shell queda con el usuario viejo.
    await refresh()
  }
```

Y en el `return`:

```ts
  return { user, refresh, login, register, logout, changePassword }
```

- [ ] **Step 2: La página**

`packages/web/app/pages/player/profile.vue`:

```vue
<script setup lang="ts">
import { changePasswordSchema } from '@coachlab/core/validators/auth'
import { playerProfileSchema } from '@coachlab/core/validators/player'
import { POSITIONS } from '@coachlab/core/domain/positions'

type OneRm = { exerciseId: string; exerciseName: string; kg: number; updatedAt: string }
type ProfilePayload = {
  ok: true
  profile: {
    id: string
    email: string
    name: string
    positionId: string | null
    heightCm: number | null
    weightKg: number | null
    coachName: string | null
  }
  oneRms: OneRm[]
}

const api = usePlayerApi()
const toast = useToast()
const { user, refresh: refreshSession, changePassword } = useAuth()

const { data, refresh } = await useAsyncData('player-profile', () =>
  api.get<ProfilePayload>('/api/player/profile'),
)

const positionItems = POSITIONS.map((p) => ({ label: p.name, value: p.id }))

const profileForm = reactive({
  name: data.value?.profile.name ?? '',
  positionId: data.value?.profile.positionId ?? null,
  heightCm: data.value?.profile.heightCm ?? null,
  weightKg: data.value?.profile.weightKg ?? null,
})

async function saveProfile() {
  try {
    await api.patch('/api/player/profile', { ...profileForm })
    await Promise.all([refresh(), refreshSession()])
    toast.add({ title: 'Perfil guardado' })
  } catch (error) {
    toast.add({
      title: 'No se pudo guardar',
      description: error instanceof Error ? error.message : undefined,
      color: 'error',
    })
  }
}

// --- 1RM ---
const rmForm = reactive<{ exerciseId: string | null; kg: number | null }>({
  exerciseId: null,
  kg: null,
})

async function saveOneRm() {
  if (!rmForm.exerciseId || rmForm.kg == null) return
  try {
    await api.put('/api/player/one-rms', { exerciseId: rmForm.exerciseId, kg: rmForm.kg })
    rmForm.exerciseId = null
    rmForm.kg = null
    await refresh()
    toast.add({ title: '1RM guardado' })
  } catch (error) {
    toast.add({
      title: 'No se pudo guardar el 1RM',
      description: error instanceof Error ? error.message : undefined,
      color: 'error',
    })
  }
}

async function removeOneRm(exerciseId: string) {
  await api.del(`/api/player/one-rms/${exerciseId}`)
  await refresh()
}

// --- canje del código ---
const inviteCode = ref('')

async function redeem() {
  try {
    await api.post('/api/player/redeem-invite', { code: inviteCode.value })
    inviteCode.value = ''
    await Promise.all([refresh(), refreshSession()])
    toast.add({ title: 'Listo', description: 'Ya estás vinculado a tu entrenador.' })
  } catch (error) {
    toast.add({
      title: 'No se pudo canjear el código',
      description: error instanceof Error ? error.message : undefined,
      color: 'error',
    })
  }
}

// --- contraseña ---
const passwordForm = reactive({ current: '', next: '', confirm: '' })
const changingPassword = ref(false)

async function submitPassword() {
  changingPassword.value = true
  try {
    await changePassword(passwordForm.current, passwordForm.next)
    passwordForm.current = ''
    passwordForm.next = ''
    passwordForm.confirm = ''
    toast.add({ title: 'Contraseña cambiada' })
  } catch (error) {
    toast.add({
      title: 'No se pudo cambiar',
      description: error instanceof Error ? error.message : undefined,
      color: 'error',
    })
  } finally {
    changingPassword.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl space-y-6">
    <h1 class="text-2xl font-bold">Mi perfil</h1>

    <!-- Sin coach: canje del código. La RPC redeem_invite_code es el ÚNICO
         camino para vincularse (el coach_id nunca llega por un PATCH). -->
    <UCard v-if="user && !user.coachId">
      <template #header>
        <h2 class="font-semibold">Vinculate a tu entrenador</h2>
      </template>
      <div class="flex items-end gap-2">
        <UFormField label="Código del entrenador" class="flex-1">
          <UInput v-model="inviteCode" placeholder="6 letras o números" />
        </UFormField>
        <UButton :disabled="!inviteCode" @click="redeem">Canjear</UButton>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold">Mis datos</h2>
      </template>
      <UForm :schema="playerProfileSchema" :state="profileForm" class="space-y-4" @submit="saveProfile">
        <UFormField label="Mi nombre" name="name">
          <UInput v-model="profileForm.name" />
        </UFormField>
        <UFormField label="Mi puesto" name="positionId">
          <USelect v-model="profileForm.positionId" :items="positionItems" placeholder="Elegí tu puesto" />
        </UFormField>
        <div class="flex gap-4">
          <UFormField label="Altura (cm)" name="heightCm" class="flex-1">
            <UInput v-model.number="profileForm.heightCm" type="number" />
          </UFormField>
          <UFormField label="Peso (kg)" name="weightKg" class="flex-1">
            <UInput v-model.number="profileForm.weightKg" type="number" step="0.1" />
          </UFormField>
        </div>
        <UButton type="submit">Guardar</UButton>
      </UForm>
      <p v-if="data?.profile.coachName" class="mt-4 text-sm text-muted">
        Tu entrenador: {{ data.profile.coachName }}
      </p>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold">Mis 1RM</h2>
      </template>
      <p class="mb-4 text-sm text-muted">
        Tus 1RM son lo que convierte los porcentajes del programa en kilos concretos.
      </p>

      <div class="mb-4 flex items-end gap-2">
        <div class="flex-1">
          <ExerciseTypeahead v-model="rmForm.exerciseId" label="Ejercicio" />
        </div>
        <UFormField label="Kg" class="w-24">
          <UInput v-model.number="rmForm.kg" type="number" step="0.5" min="0" />
        </UFormField>
        <UButton :disabled="!rmForm.exerciseId || rmForm.kg == null" @click="saveOneRm">
          Guardar
        </UButton>
      </div>

      <p v-if="(data?.oneRms.length ?? 0) === 0" class="text-sm text-muted">
        Todavía no cargaste ningún 1RM.
      </p>
      <ul v-else class="divide-y divide-default">
        <li
          v-for="rm in data!.oneRms"
          :key="rm.exerciseId"
          class="flex items-center justify-between py-2"
        >
          <span>{{ rm.exerciseName }}</span>
          <span class="flex items-center gap-3">
            <span class="font-medium">{{ rm.kg }} kg</span>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-trash-2"
              size="xs"
              @click="removeOneRm(rm.exerciseId)"
            />
          </span>
        </li>
      </ul>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold">Cambiar mi contraseña</h2>
      </template>
      <UForm
        :schema="changePasswordSchema"
        :state="passwordForm"
        class="space-y-4"
        @submit="submitPassword"
      >
        <UFormField label="Contraseña actual" name="current">
          <UInput v-model="passwordForm.current" type="password" />
        </UFormField>
        <UFormField label="Contraseña nueva" name="next">
          <UInput v-model="passwordForm.next" type="password" />
        </UFormField>
        <UFormField label="Repetí la nueva" name="confirm">
          <UInput v-model="passwordForm.confirm" type="password" />
        </UFormField>
        <UButton type="submit" :loading="changingPassword">Cambiar contraseña</UButton>
      </UForm>
    </UCard>
  </div>
</template>
```

> **`ExerciseTypeahead`:** verificar su contrato real (`packages/web/app/components/ExerciseTypeahead.vue`)
> antes de usarlo. Si su `v-model` emite el nombre en vez del `exerciseId`, adaptar el binding acá — el
> jugador **tiene que** mandar un `exerciseId`, porque `ensure_exercise` lo rechaza y no puede crear
> ejercicios nuevos.

- [ ] **Step 3: El link en el sidebar**

En `packages/web/app/components/AppSidebar.vue`, reemplazar la línea de `PLAYER` y borrar el comentario
que decía que "Mi perfil se suma en F3":

```ts
// Solo páginas que existen.
const NAV: Record<SessionUser['role'], NavItem[]> = {
  COACH: [
    { to: '/coach/players', label: 'Plantel', icon: 'i-lucide-users' },
    { to: '/coach/groups', label: 'Grupos', icon: 'i-lucide-layout-grid' },
    { to: '/coach/programs', label: 'Programas', icon: 'i-lucide-clipboard-list' },
  ],
  PLAYER: [
    { to: '/player/week', label: 'Mi semana', icon: 'i-lucide-calendar-days' },
    { to: '/player/profile', label: 'Mi perfil', icon: 'i-lucide-user' },
  ],
  ADMIN: [{ to: '/admin', label: 'Administración', icon: 'i-lucide-shield' }],
}
```

`lucide:user` ya está en `clientBundle.icons`, así que no hay que tocar `nuxt.config.ts`.

- [ ] **Step 4: Verificar**

Run: `pnpm --filter @coachlab/web test && pnpm typecheck && pnpm --filter @coachlab/web build`
Expected: PASS y `Build complete`.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/pages/player/profile.vue packages/web/app/composables/useAuth.ts \
        packages/web/app/components/AppSidebar.vue
git commit -m "feat(player): add profile with position, measures, 1RM and password change"
```

---

### Task 11: Verificación en vivo y cierre de fase

**Files:**
- Modify: `scripts/verify-setup.mjs`
- Create: `docs/IMPLEMENTATION-F3.md`
- Modify: `CLAUDE.md`
- Modify: `docs/IMPLEMENTATION-F2.md`

- [ ] **Step 1: Checks nuevos en `verify-setup.mjs`**

El archivo usa `check(name, pass, detail)`, que empuja a `results` e imprime `OK`/`FAIL`. Agregar una
función nueva y llamarla desde el flujo principal, al lado de los checks de RLS que ya existen.

```js
/**
 * F3 — la RLS de session_logs con el día scopeado (migración 0015) y el cambio
 * de contraseña propia.
 *
 * `asPlayer` es un cliente ya logueado como el jugador de prueba; `foreignDayId`
 * es un día de un programa de OTRO coach, creado con la secret key.
 */
async function checkPlayerLogScope(asPlayer, playerId, ownDayId, foreignDayId) {
  // 1. Un day_id de otro programa se rechaza en la BASE, no solo en la API.
  const { error: foreign } = await asPlayer
    .from('session_logs')
    .insert({ player_id: playerId, day_id: foreignDayId })
  check(
    'session_logs rechaza un day_id de otro programa',
    foreign?.code === '42501',
    // Mirar el CÓDIGO, no solo que falle: un 23503 sería la FK, no la política.
    foreign ? `${foreign.code} ${foreign.message}` : 'NO falló (agujero abierto)',
  )

  // 2. El día propio sí entra: la política no rompió el caso legítimo.
  const { error: own } = await asPlayer
    .from('session_logs')
    .upsert({ player_id: playerId, day_id: ownDayId }, { onConflict: 'player_id,day_id' })
  check('session_logs acepta un día del programa propio', !own, own?.message ?? '')

  // 3. Un day_id inexistente tampoco pasa (program_of_day devuelve null).
  const { error: ghost } = await asPlayer
    .from('session_logs')
    .insert({ player_id: playerId, day_id: '00000000-0000-0000-0000-000000000000' })
  check('session_logs rechaza un day_id inexistente', !!ghost, ghost?.code ?? 'NO falló')
}

/**
 * Cambio de contraseña propia. Lo que importa es el DATO, no el error: después
 * de un intento fallido, la contraseña vieja tiene que seguir sirviendo.
 */
async function checkPasswordChange(email, oldPassword) {
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  await client.auth.signInWithPassword({ email, password: oldPassword })

  // Con la actual correcta: cambia.
  const nextPassword = 'NuevaPassw0rd!x9'
  const { error: changed } = await client.auth.updateUser({ password: nextPassword })
  check('el usuario puede cambiar su propia contraseña', !changed, changed?.message ?? '')

  // Instancia nueva a propósito: un cliente que ya se autenticó guarda la sesión
  // y daría un falso positivo (la trampa de IMPLEMENTATION-F2.md §4.2).
  const fresh = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error: withNew } = await fresh.auth.signInWithPassword({
    email,
    password: nextPassword,
  })
  check('la contraseña nueva sirve para entrar', !withNew, withNew?.message ?? '')

  const stale = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error: withOld } = await stale.auth.signInWithPassword({
    email,
    password: oldPassword,
  })
  check('la contraseña vieja dejó de servir', !!withOld, withOld ? '' : 'la vieja sigue entrando')

  return nextPassword
}

/**
 * ensure_exercise sigue cerrado a PLAYER (0012/0014).
 *
 * Expected P0001 con el mensaje de la función, NO 42501: el grant a
 * `authenticated` es intencional y el corte es por rol adentro de la RPC.
 */
async function checkPlayerCannotWriteCatalog(asPlayer) {
  const { error } = await asPlayer.rpc('ensure_exercise', {
    p_name: 'Ejercicio De Prueba F3',
    p_normalized: 'ejercicio de prueba f3',
  })
  check(
    'un PLAYER no puede escribir el catálogo',
    error?.code === 'P0001',
    error ? `${error.code} ${error.message}` : 'ESCRIBIÓ EL CATÁLOGO',
  )
}
```

Llamarlas desde el flujo principal donde ya existen el jugador de prueba y su cliente logueado, y
**agregar el ejercicio de prueba a `createdExercises`** si por algún motivo llegara a crearse, para que
el cleanup lo borre (F2 §4.2: un check mal escrito metió basura en el catálogo global).

- [ ] **Step 2: Correr la verificación**

Run: `pnpm verify:setup`
Expected: todos los checks en verde, incluidos los 69 de F2.

- [ ] **Step 3: El smoke con sesión real — NO OPCIONAL**

Es el único nivel donde el seam Nuxt → Hono → PostgREST se ejercita completo, y el que agarró el bug de
los dos FK (`IMPLEMENTATION-F2.md` §4.3) que los tests de API, el typecheck y `verify:setup` **no
vieron**. F3 mete varios selects anidados nuevos (`weeks!weeks_program_id_fkey`, `days!inner(weeks!inner)`,
`block_exercises!inner(exercises!inner)`), así que el riesgo es el mismo.

Run: `pnpm dev`, y con un programa importado real y un jugador asignado:

1. `/player/week` como jugador → la semana con sus días, sin 500 en la consola del server.
2. Un ejercicio en `PERCENTAGE` con el 1RM cargado → **"80% → 112 kg"**.
3. Un ejercicio en `LABEL` → **"p.corp"**, no "Sin peso".
4. Borrar ese 1RM desde `/player/profile` y recargar → banner ámbar y "80% — falta tu 1RM de X".
5. Volver a cargarlo. Registrar peso, reps y RPE → el badge pasa a "1/8 registrados".
6. Escribir la nota y "Completar día" → badge "Completado" e inputs deshabilitados.
7. Reabrir, cambiar un valor, completar de nuevo → persiste.
8. Desde el coach, mover `current_week_id` a la semana siguiente con el mismo ejercicio → aparece
   "Semana 1 · Día 1: 112 kg · 5 reps · RPE 9" como última vez.
9. Cambiar la contraseña → **sigue logueado** (no lo escupe a `/login`) y la nueva sirve para entrar de
   cero.
10. A 380 px de ancho: los inputs son tocables sin zoom.
11. Como coach, verificar que el 1RM que cargó el jugador se ve en la ficha del plantel.

- [ ] **Step 4: Auditoría de las rutas nuevas**

Revisar `packages/api/src/routes/player/` y `packages/api/src/access/player*.ts` contra `CLAUDE.md` §4:

- ¿Alguna ruta acepta un `playerId` del cliente? (No debería: siempre `actor.id`.)
- ¿`assertOwnedDay` se puede esquivar en algún camino de escritura?
- ¿El `blockExerciseId` se valida contra el día, no solo contra el programa?
- ¿Alguna query usa `service_role`? (Prohibido en un request, `CLAUDE.md` §4.)
- ¿Algún recurso ajeno devuelve 403 en vez de 404?

- [ ] **Step 5: El gate de `CLAUDE.md` §5**

Run: `pnpm typecheck && pnpm test`
Expected: verde.

**Baseline medido el 2026-07-29 sobre `feature/f3`, antes de empezar F3:**

| Paquete | Tests |
|---|---|
| `@coachlab/core` | 183 (15 archivos) |
| `@coachlab/api` | 68 (8 archivos) |
| `@coachlab/web` | 3 (1 archivo) |
| **Total** | **254** |

Si al terminar F3 el total no subió, algún test nuevo no se está corriendo.

> **Dos problemas del gate mismo, medidos, que F3 no crea pero sí sufre.**
> Están fuera del alcance de F3: **planteárselos al dueño del repo** en vez de arreglarlos de callado.
>
> **1. `pnpm lint` no existe.** El gate de `CLAUDE.md` §5 es
> `pnpm lint && pnpm typecheck && pnpm test`, pero el script del root hace `pnpm -r lint` y **ningún
> package define `lint`**. Falla con `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT` y exit 1. Nunca fue ejecutable.
>
> **2. `packages/web typecheck` no typecheckea nada y reporta éxito.** `nuxt typecheck` → `vue-tsc`
> crashea con `[Vue] Failed to create plugin TypeError: plugin is not a function`
> (`@vue/language-core@2.2.12`), imprime el stack, escribe `Done` y **sale con código 0**. O sea que
> `pnpm typecheck` da verde sin haber mirado una sola línea de `.vue`.
>
> **Por qué importa justo en F3:** esta fase es la que más código Vue agrega de todo el proyecto (dos
> páginas y dos componentes, con props tipadas contra `PlayerDay`/`PlayerExercise`). Mientras el
> typecheck de web esté roto, **el único que agarra un error de tipos en un `.vue` es
> `pnpm --filter @coachlab/web build`** — por eso está en los pasos de verificación de las tasks 9 y 10,
> y no alcanza con `pnpm typecheck`.

- [ ] **Step 6: Documentar la fase**

Crear `docs/IMPLEMENTATION-F3.md` con el mismo formato que F0–F2: resumen con la tabla de estado,
decisiones de diseño, mapa de archivos nuevos, los problemas que valieron la pena, y la deuda conocida
(la del spec §7 más lo que aparezca al implementar).

Actualizar `docs/IMPLEMENTATION-F2.md`:

- §6: corregir la afirmación de que el coach puede editar `name` (no podía; ahora sí, por Task 8).
- §5.5 A: marcar como implementado, apuntando a F3.

- [ ] **Step 7: Marcar el roadmap**

En `CLAUDE.md` §6:

```markdown
- [x] **F3 — Panel jugador**: perfil (puesto, altura, peso, 1RM con typeahead), **cambiar su propia contraseña**, Mi semana con kg calculados y "última vez", registro de peso/reps/RPE/nota, completar día. → `docs/IMPLEMENTATION-F3.md`
```

Y en §3, agregar `LABEL` a la descripción del cálculo de carga si quedó incompleta, y documentar que
`session_logs` tiene el día scopeado por RLS (migración `0015`).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "docs: mark F3 complete with live verification evidence"
```

---

## Notas de ejecución

**Orden.** Las tasks 1–4 son puras y se pueden hacer en cualquier orden. La 5 (migración) tiene que ir
antes de la 7 para que el smoke pruebe la política de verdad. La 6 depende de 1–3. La 9 y la 10
dependen de 7 y 8.

**Lo que más riesgo tiene.** Los strings de select de la Task 6. No los ve el typecheck y no los
ejercita ningún test de `app.request()`. Si el smoke del Step 3 de la Task 11 tira un 500 con
`more than one relationship was found` o `could not find a relationship`, el problema está ahí y se
arregla desambiguando el FK por nombre, igual que `weeks!weeks_program_id_fkey`.

**Lo que NO hay que hacer:**

- No agregar una columna `done` a `exercise_entries` (decisión del spec §3.1).
- No llamar a `ensure_exercise` desde ninguna ruta de `/player/*`: la RPC rechaza a PLAYER a propósito.
- No usar `service_role` en ningún camino de request (`CLAUDE.md` §4).
- No re-parentar filas con un `UPDATE` que cambie la columna por la que scopea una política: falla con
  42501 (`CLAUDE.md` §3).
- No editar `packages/web/types/database.ts` a mano: se regenera con `pnpm gen:types`.
