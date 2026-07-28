# F3 — Panel del jugador Implementation Plan

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

**Goal:** Que el jugador vea su rutina con **los kg ya calculados según su 1RM** ("80% → 112 kg"), con
"última vez" al lado de cada ejercicio, y que registre peso real, reps, RPE percibido y nota del día,
cerrando el día cuando termina.

**Architecture:** `GET /player/week` resuelve el programa vigente con `activeProgramIdFor` (F2), lee la
semana actual con **un solo `GetItem`** —el árbol está embebido— y compone la respuesta con tres
funciones puras: `rmFor` busca el 1RM, `calcLoad` produce la etiqueta de carga, `lastPerf` el
histórico. El registro escribe dentro del map `entries` del `SessionLog` del jugador.

**Tech Stack:** ElectroDB (updates anidados), Hono + Zod, Nuxt UI, Vitest.

**Precondición:** F2 mergeado en `main`.

---

### Task 1: `lastPerf`

**Files:**
- Create: `packages/core/src/domain/lastPerf.ts`
- Test: `packages/core/src/domain/lastPerf.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { describe, expect, it } from 'vitest'
import { formatLastPerf, lastPerf, type PerfRecord } from './lastPerf'

const at = (iso: string) => new Date(iso)

const history: PerfRecord[] = [
  { normalizedName: 'press banca', weekName: 'Semana 1', dayName: 'Día 1', weight: 100, reps: 5, rpe: 7, performedAt: at('2026-01-05T10:00:00Z') },
  { normalizedName: 'press banca', weekName: 'Semana 2', dayName: 'Día 1', weight: 105, reps: 5, rpe: 8, performedAt: at('2026-01-12T10:00:00Z') },
  { normalizedName: 'sentadilla', weekName: 'Semana 2', dayName: 'Día 2', weight: 160, reps: 3, rpe: 9, performedAt: at('2026-01-13T10:00:00Z') },
]

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

  it('ignora registros sin peso Y sin reps', () => {
    const empty: PerfRecord[] = [
      { ...history[0]!, weight: null, reps: null, performedAt: at('2026-02-01T00:00:00Z') },
    ]
    expect(lastPerf([...history, ...empty], 'Press Banca')?.weight).toBe(105)
  })

  it('acepta un registro sin peso pero con reps (ejercicio sin carga)', () => {
    const bodyweight: PerfRecord[] = [
      { normalizedName: 'dominadas', weekName: 'Semana 3', dayName: 'Día 1', weight: null, reps: 12, rpe: 8, performedAt: at('2026-01-20T00:00:00Z') },
    ]
    expect(lastPerf(bodyweight, 'Dominadas')?.reps).toBe(12)
  })

  it('no muta el historial recibido', () => {
    const copy = [...history]
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

- [ ] **Step 2: Correr para ver que falla** → FAIL.

- [ ] **Step 3: Implementar**

`packages/core/src/domain/lastPerf.ts`:

```ts
import { formatKg } from './calcLoad'
import { normName } from './normName'

export type PerfRecord = {
  normalizedName: string
  weekName: string
  dayName: string
  weight: number | null
  reps: number | null
  rpe: number | null
  performedAt: Date
}

/**
 * Última vez que el jugador hizo este ejercicio, por normalizedName.
 * Portado de `lastPerf` del prototipo coach.html.
 */
export function lastPerf(history: PerfRecord[], exerciseName: string): PerfRecord | null {
  const target = normName(exerciseName)
  if (!target) return null

  let best: PerfRecord | null = null
  for (const record of history) {
    if (record.normalizedName !== target) continue
    // Una entrada sin peso ni reps es una fila abierta sin completar: no es historial.
    if (record.weight == null && record.reps == null) continue
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

- [ ] **Step 4: Correr para ver que pasa** → PASS.

- [ ] **Step 5: Commit**

```bash
git checkout -b feature/f3-player-panel
git add packages/core/src/domain/lastPerf*
git commit -m "feat(domain): add lastPerf lookup and formatting"
```

---

### Task 2: `buildPlayerDay` — la composición

Junta las tres funciones puras en la forma exacta que la vista necesita. La carga de datos es la
Task 3; esto es puro y por eso se testea sin AWS.

**Files:**
- Create: `packages/core/src/domain/buildPlayerDay.ts`
- Test: `packages/core/src/domain/buildPlayerDay.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { describe, expect, it } from 'vitest'
import { buildPlayerDay, type PlayerDayInput } from './buildPlayerDay'

const input: PlayerDayInput = {
  day: {
    id: 'd1',
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
            targetRpe: 8,
            note: 'Controlá el descenso',
          },
          {
            id: 'be2',
            exerciseName: 'Dominadas',
            sets: 3,
            reps: 'AMRAP',
            loadType: 'NONE',
            weight: null,
            percentage: null,
            targetRpe: null,
            note: null,
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
      weekName: 'Semana 2',
      dayName: 'Día 1',
      weight: 105,
      reps: 5,
      rpe: 8,
      performedAt: new Date('2026-01-12T00:00:00Z'),
    },
  ],
  entries: [{ blockExerciseId: 'be1', weight: 112, reps: 5, rpe: 9, done: true }],
}

describe('buildPlayerDay', () => {
  it('calcula los kg del porcentaje con el 1RM del jugador', () => {
    const row = buildPlayerDay(input).blocks[0]!.exercises[0]!
    expect(row.load.kind).toBe('percentage')
    expect(row.load.label).toBe('80% → 112 kg')
  })

  it('marca el ejercicio sin 1RM en vez de ocultarlo', () => {
    const row = buildPlayerDay({ ...input, oneRms: [] }).blocks[0]!.exercises[0]!
    expect(row.load.kind).toBe('missing-1rm')
    expect(row.load.label).toContain('falta tu 1RM de Press Banca')
  })

  it('expone la lista de 1RM faltantes del día', () => {
    expect(buildPlayerDay({ ...input, oneRms: [] }).missingOneRms).toEqual(['Press Banca'])
  })

  it('no repite un ejercicio en missingOneRms', () => {
    const twice = structuredClone(input)
    twice.oneRms = []
    twice.day.blocks[0]!.exercises.push({ ...input.day.blocks[0]!.exercises[0]!, id: 'be3' })
    expect(buildPlayerDay(twice).missingOneRms).toEqual(['Press Banca'])
  })

  it('adjunta la última vez formateada', () => {
    expect(buildPlayerDay(input).blocks[0]!.exercises[0]!.lastPerfLabel).toBe(
      'Semana 2 · Día 1: 105 kg · 5 reps · RPE 8',
    )
  })

  it('deja lastPerfLabel en null sin historial', () => {
    expect(buildPlayerDay(input).blocks[0]!.exercises[1]!.lastPerfLabel).toBeNull()
  })

  it('adjunta la entrada ya registrada', () => {
    expect(buildPlayerDay(input).blocks[0]!.exercises[0]!.entry).toEqual({
      blockExerciseId: 'be1',
      weight: 112,
      reps: 5,
      rpe: 9,
      done: true,
    })
  })

  it('deja entry en null cuando no se registró', () => {
    expect(buildPlayerDay(input).blocks[0]!.exercises[1]!.entry).toBeNull()
  })

  it('cuenta el progreso del día', () => {
    const day = buildPlayerDay(input)
    expect(day.doneCount).toBe(1)
    expect(day.totalCount).toBe(2)
  })

  it('un ejercicio sin peso queda en kind none', () => {
    expect(buildPlayerDay(input).blocks[0]!.exercises[1]!.load.kind).toBe('none')
  })

  it('no se autorreferencia: descarta el historial del propio día', () => {
    const sameDay = structuredClone(input)
    sameDay.weekName = 'Semana 2'
    sameDay.day.name = 'Día 1'
    expect(buildPlayerDay(sameDay).blocks[0]!.exercises[0]!.lastPerfLabel).toBeNull()
  })
})
```

- [ ] **Step 2: Correr para ver que falla** → FAIL.

- [ ] **Step 3: Implementar**

`packages/core/src/domain/buildPlayerDay.ts`:

```ts
import { calcLoad, type LoadResult, type LoadType } from './calcLoad'
import { formatLastPerf, lastPerf, type PerfRecord } from './lastPerf'
import { normName } from './normName'
import { rmFor, type OneRmRecord } from './rmFor'

export type PlannedExercise = {
  id: string
  exerciseName: string
  sets: number
  reps: string
  loadType: LoadType
  weight: number | null
  percentage: number | null
  targetRpe: number | null
  note: string | null
}

export type PlannedBlock = {
  id: string
  type: 'SINGLE' | 'CIRCUIT'
  rounds: number | null
  exercises: PlannedExercise[]
}

export type LoggedEntry = {
  blockExerciseId: string
  weight: number | null
  reps: number | null
  rpe: number | null
  done: boolean
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

export type PlayerDay = {
  id: string
  name: string
  weekName: string
  blocks: Array<Omit<PlannedBlock, 'exercises'> & { exercises: PlayerExerciseRow[] }>
  missingOneRms: string[]
  doneCount: number
  totalCount: number
}

/**
 * Compone lo que el jugador ve para un día: carga calculada, última vez y lo ya registrado.
 * Pura — los datos los carga la ruta de la API.
 */
export function buildPlayerDay(input: PlayerDayInput): PlayerDay {
  const entriesById = new Map(input.entries.map((entry) => [entry.blockExerciseId, entry]))
  const missing = new Map<string, string>()
  let doneCount = 0
  let totalCount = 0

  // El historial del día que se está mostrando no es "última vez": es hoy.
  const priorHistory = input.history.filter(
    (record) => !(record.weekName === input.weekName && record.dayName === input.day.name),
  )

  const blocks = input.day.blocks.map((block) => ({
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
      if (entry?.done) doneCount += 1

      return {
        ...planned,
        load,
        lastPerfLabel: formatLastPerf(lastPerf(priorHistory, planned.exerciseName)),
        entry,
      }
    }),
  }))

  return {
    id: input.day.id,
    name: input.day.name,
    weekName: input.weekName,
    blocks,
    missingOneRms: [...missing.values()],
    doneCount,
    totalCount,
  }
}
```

- [ ] **Step 4: Correr para ver que pasa** → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/buildPlayerDay*
git commit -m "feat(domain): add buildPlayerDay composing load, history and entries"
```

---

### Task 3: Entidad `SessionLog` y lectura de la semana

**Files:**
- Create: `packages/core/src/entities/sessionLog.ts`
- Create: `packages/core/src/access/playerWeek.ts`
- Modify: `packages/core/src/entities/index.ts`

- [ ] **Step 1: Entidad**

```ts
import { Entity } from 'electrodb'
import { entityConfig } from './client'

/**
 * Las entries viven embebidas (CLAUDE.md §3): se leen y se escriben siempre juntas.
 * Map indexado por blockExerciseId → ruta de update estable.
 */
export const SessionLogEntity = new Entity(
  {
    model: { entity: 'sessionLog', version: '1', service: 'coachlab' },
    attributes: {
      playerId: { type: 'string', required: true },
      dayId: { type: 'string', required: true },
      programId: { type: 'string', required: true },
      weekName: { type: 'string', required: true },
      dayName: { type: 'string', required: true },
      completedAt: { type: 'string' },
      dayNote: { type: 'string' },
      entries: { type: 'any', required: true, default: () => ({}) },
      updatedAt: { type: 'string', required: true, default: () => new Date().toISOString(), set: () => new Date().toISOString() },
    },
    indexes: {
      byPlayer: {
        pk: { field: 'pk', composite: ['playerId'] },
        sk: { field: 'sk', composite: ['dayId'] },
      },
    },
  },
  entityConfig,
)
```

> `weekName` y `dayName` se desnormalizan en el log a propósito. `lastPerf` los necesita para armar
> "Semana 2 · Día 1: …", y sin ellos habría que releer el programa —posiblemente ya editado— para
> etiquetar historial viejo. Un rename de semana no reescribe el historial: es lo correcto, el
> registro dice cómo se llamaba cuando se hizo.

- [ ] **Step 2: Lectura de la semana**

`packages/core/src/access/playerWeek.ts` expone `playerWeekFor(playerId)`:

1. `activeProgramIdFor(playerId)` → si null, devuelve null (el jugador ve el estado vacío).
2. `ProgramEntity.get` → `currentWeekId` (o la primera semana si no está seteado).
3. `WeekEntity.get({ programId, weekId })` — **un solo GetItem trae el árbol entero**.
4. En paralelo: `OneRmEntity.query.byPlayer({ playerId })` y
   `SessionLogEntity.query.byPlayer({ playerId })`.
5. `ordered()` de `tree.ts` para convertir los maps a listas, y `buildPlayerDay` por cada día.

El historial para `lastPerf` sale de los mismos `SessionLog` del paso 4: son decenas de items, se
filtra en memoria (CLAUDE.md §3). No hace falta índice ni query extra.

- [ ] **Step 3: Verificar** → `pnpm typecheck`.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src
git commit -m "feat(access): add session log entity and player week composition"
```

---

### Task 4: Rutas del jugador

**Files:**
- Create: `packages/core/src/validators/session.ts`
- Create: `packages/api/src/routes/player/week.ts`, `profile.ts`

- [ ] **Step 1: Validador**

```ts
import { z } from 'zod'

export const exerciseEntrySchema = z.object({
  blockExerciseId: z.string().min(1),
  weight: z.number().min(0).max(500).nullish(),
  reps: z.number().int().min(0).max(999).nullish(),
  rpe: z.number().int().min(1).max(10).nullish(),
  done: z.boolean(),
})

export const completeDaySchema = z.object({
  dayNote: z.string().trim().max(1000).nullish(),
})
```

- [ ] **Step 2: El guard que sostiene todo**

Antes de escribir cualquier entry, la ruta confirma que **el día pertenece al programa vigente del
jugador**. Sin esto, un jugador registra contra el programa de cualquier otro coach conociendo un
`dayId`:

```ts
async function ownedDay(playerId: string, dayId: string) {
  const programId = await activeProgramIdFor(playerId)
  if (!programId) return null

  const weeks = await WeekEntity.query.byProgram({ programId }).go()
  for (const week of weeks.data) {
    const day = week.days[dayId]
    if (day) return { programId, weekId: week.weekId, weekName: week.name, day }
  }
  return null
}
```

- [ ] **Step 3: Rutas**

| Método | Path | Comportamiento |
|---|---|---|
| GET | `/player/week` | `playerWeekFor(actor.id)`; null → 200 con `{ week: null }` |
| PUT | `/player/week/days/:dayId/entries/:blockExerciseId` | `ownedDay` + verificar que el `blockExerciseId` **existe en ese día**; upsert del map `entries.<beId>`; 409 si el día ya está cerrado |
| POST | `/player/week/days/:dayId/complete` | `completeDaySchema`, sella `completedAt` |
| POST | `/player/week/days/:dayId/reopen` | Limpia `completedAt` |
| GET | `/player/profile` | Su `User` + sus 1RM |
| PATCH | `/player/profile` | `playerProfileSchema` de F2 — **no acepta `role` ni `coachId`** |
| PUT | `/player/profile/one-rm` | `oneRmSchema` de F2, scope a sí mismo |

Todas cuelgan del grupo `/player/*` con `requireRole(['PLAYER'])` desde F1. Un ADMIN no tiene perfil
de jugador, así que no se lo incluye: no es un olvido.

- [ ] **Step 4: Tests de scoping**

En `packages/api/src/routes/player/week.test.ts`:
- `PUT` de una entry con un `dayId` de otro programa → 404.
- `PUT` con un `blockExerciseId` que no está en ese día → 404.
- `PUT` con el día cerrado → 409.
- `PATCH /player/profile` con `{"coachId":"otro"}` → el `coachId` no cambia.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/validators/session.ts packages/api/src/routes/player
git commit -m "feat(api): add player week and profile routes with day ownership checks"
```

---

### Task 5: "Mi semana"

**Files:**
- Modify: `packages/web/app/pages/player/week.vue` (reemplaza el placeholder de F1)
- Create: `packages/web/app/components/player/DayLogger.vue`, `ExerciseRow.vue`

- [ ] **Step 1: La página**

Server-side: llama `GET /player/week`. Si no hay programa, muestra el estado vacío de F1.
Si hay, encabezado con el nombre de la semana y del programa, y —si `missingOneRms` no está vacío— un
**banner ámbar**: "Faltan tus 1RM de X, Y. Cargalos en Mi perfil para ver los kg de cada serie", con
link a `/player/profile`.

- [ ] **Step 2: `ExerciseRow.vue`**

El orden importa: es lo que el jugador mira parado en el gimnasio entre series.

1. **Nombre del ejercicio** + `sets × reps`.
2. **Carga** — `row.load.label`, en tamaño grande y semibold. Es lo que vino a buscar. Si
   `load.kind === 'missing-1rm'`, en ámbar.
3. **RPE objetivo** — badge "RPE objetivo 8" si `targetRpe != null`.
4. **Nota del coach** — texto chico si existe.
5. **Última vez** — `row.lastPerfLabel` en texto chico, con ícono de historial.
6. **Inputs**: peso (number, step 0.5), reps (number), RPE (select 1–10), checkbox "Hecho".

Los inputs arrancan con `row.entry` si existe; si no, el peso se **prellena con `load.kg`** cuando
`load.kind` es `weight` o `percentage`, y el jugador solo lo cambia si levantó otra cosa. Cada cambio
dispara `useDebouncedSave` (F2) contra el `PUT` de la entry. Con el día cerrado, todo `disabled`.

- [ ] **Step 3: `DayLogger.vue`**

- Encabezado: nombre del día, badge `{doneCount}/{totalCount}`, badge "Completado" si corresponde.
- Bloques: un `SINGLE` lista sus ejercicios directo; un `CIRCUIT` los envuelve con el rótulo
  "Circuito · {rounds} vueltas".
- Textarea "¿Cómo te fue hoy?" para `dayNote`.
- Botón **"Completar día"**; si ya está cerrado, pasa a "Reabrir".

- [ ] **Step 4: Probar el loop completo**

Con el programa y assignment de F2, y el jugador con 1RM de Press Banca = 140:

1. `/player/week` como jugador. Expected: **"80% → 112 kg"**.
2. Borrar el 1RM desde el perfil, recargar. Expected: banner ámbar y "80% — falta tu 1RM de Press Banca".
3. Volver a cargarlo. Registrar 112 kg, 5 reps, RPE 9, marcar "Hecho". Expected: el badge pasa a 1/2
   sin recargar.
4. Escribir una nota y "Completar día". Expected: badge "Completado", inputs deshabilitados.
5. Marcar la Semana 2 como actual desde el coach, con el mismo ejercicio. Expected: aparece
   "Semana 1 · Día 1: 112 kg · 5 reps · RPE 9" como última vez.
6. Reabrir el día, cambiar un valor, volver a completar. Expected: persiste.
7. A 380px de ancho: los inputs siguen siendo tocables sin zoom.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(player): add my week view with computed loads and session logging"
```

---

### Task 6: Perfil del jugador

**Files:**
- Create: `packages/web/app/pages/player/profile.vue`

- [ ] **Step 1: La página**

Reutiliza los mismos controles que la ficha del coach (F2, Task 6): select de puesto, altura, peso,
tabla de 1RM y alta con `ExerciseTypeahead`. Copy propio: "Mi puesto", "Mis 1RM", y una línea de
ayuda: *"Tus 1RM son lo que convierte los porcentajes del programa en kilos concretos."*

- [ ] **Step 2: Probar**

1. Cargar el 1RM de Sentadilla. Expected: aparece y `/player/week` recalcula.
2. `PATCH /player/profile` con `{"role":"ADMIN"}` desde la consola. Expected: el rol no cambia.
3. Como coach, verificar que el 1RM cargado por el jugador se ve en la ficha del plantel.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(player): add profile with position, measures and 1RM"
```

---

### Task 7: Cierre de fase

- [ ] **Step 1: Auditoría**

Dispatch `rbac-auditor` sobre `packages/api/src/routes/player/` y `packages/core/src/access/playerWeek.ts`.
Foco: que `ownedDay` no se pueda esquivar, que el `blockExerciseId` se valide contra el día, y que
ninguna ruta acepte un `playerId` que venga del cliente.

- [ ] **Step 2: Verificación**

Run: `pnpm typecheck && pnpm test`
Expected: verde. El conteo de tests de dominio debería estar cerca de 75.

- [ ] **Step 3: Marcar en CLAUDE.md**

```markdown
- [x] **F3 — Panel jugador**: perfil (puesto, altura, peso, 1RM con typeahead), Mi semana con kg calculados y "última vez", registro de peso/reps/RPE/nota, completar día.
```

- [ ] **Step 4: Commit y merge**

```bash
git add CLAUDE.md
git commit -m "docs: mark F3 complete"
git checkout main
git merge --no-ff feature/f3-player-panel -m "feat: F3 player panel"
```

---

## Definición de terminado

- El jugador ve "80% → 112 kg" calculado con su propio 1RM.
- Sin 1RM ve el aviso con el nombre del ejercicio y el banner con link al perfil.
- "Última vez" muestra "Semana X · Día: NN kg · N reps · RPE N" y no se autorreferencia.
- Registra peso/reps/RPE con autosave, escribe la nota del día y cierra el día.
- Un jugador no puede registrar contra un día que no es de su programa vigente.
- La pantalla es usable a 380px.
- `pnpm typecheck && pnpm test` en verde.
