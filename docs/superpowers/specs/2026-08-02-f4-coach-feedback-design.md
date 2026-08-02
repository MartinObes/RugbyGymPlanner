# F4 — La vista de feedback del coach

> Diseño validado con el dueño del repo el **2026-08-02**. Cierra el loop del producto: hoy el jugador
> puede completar un día y **el coach no tiene dónde verlo**.
>
> Es la otra mitad de F4. La primera mitad ejecutable es
> [`2026-07-31-f4b-assignment-model-design.md`](./2026-07-31-f4b-assignment-model-design.md), que va
> **primero** — la razón está en §2.

---

## 1. El problema

`pages/coach/feedback/` tiene sólo un `.gitkeep` y ninguna ruta de la API menciona feedback. El
jugador cierra el día, el toast le dice "Tu entrenador ya lo puede ver", y esa pantalla no existe.

Lo que pide `CLAUDE.md` §6:

> vista coach con progreso "2/3 días" y **el RPE del día (`session_logs.perceived_rpe`) contra los
> `target_rpe` del día**, con notas

---

## 2. El orden: F4-B primero

No es el orden del handoff, y la razón no es de gusto.

F4-B §2.4 decide que **el coach ve el programa que el jugador está viendo de verdad**, no el resuelto
por el sistema. Después de F4-B, "el programa vigente de un jugador" pasa a ser
`profiles.selected_program_id` con fallback a la última asignada — una regla distinta de la resolución
por prioridad de hoy.

La agregación del feedback necesita exactamente ese dato: sobre qué programa mido "2/3 días". Si se
construye contra el `activeProgramIdFor` actual, se reescribe apenas entra F4-B. **F4-B primero, y el
feedback consume la resolución final una sola vez.**

---

## 3. La corrección que obliga a rediseñar

El plan viejo (`docs/superpowers/plans/2026-07-27-f4-feedback-deploy.md`) modela el RPE **por
ejercicio**: `summarizeRpe` promedia pares `{ targetRpe, rpe }` sacados de cada `exercise_entry`.

**Eso ya no describe el producto.** F3.5 movió el RPE percibido a una pregunta **por día**
(`CLAUDE.md` §1: "doce preguntas por sesión garantizan que nadie las conteste").
`pages/player/week/[dayId].vue` sólo captura `perceivedRpe`; la columna `exercise_entries.rpe` sigue
en el schema pero **ninguna pantalla la escribe**.

> **Dato equivocado en el handoff:** `docs/HANDOFF-F4.md` línea 78 dice que `rpeDelta` "ya existe en
> `packages/core/src/domain/` y está testeada", y le pide a la próxima sesión que no lo escriba. **No
> existe.** El spec de F3 lo dice bien: "`rpeDelta` se escribe en F4, donde se usa". Se corrige el
> handoff en el mismo PR.

### La regla de reducción

Un RPE percibido contra N `target_rpe` del día necesita reducir esos N a uno.

> **El objetivo del día es el promedio de los `target_rpe` no nulos de sus ejercicios.**
> Si ninguno tiene target, el objetivo es `null` y no se compara.

Las alternativas que se consideraron:

| | Qué hacía | Por qué no |
|---|---|---|
| El máximo del día | "Lo más duro que le pediste" | Compara contra el pico y marca casi todo como "en el objetivo": pierde la señal |
| Rango min–max | Sólo marca desvío fuera del rango ±1 | Más honesto con el dato, pero no ordena: una tabla de plantel necesita un número por jugador |
| **Promedio (elegida)** | Media de los targets no nulos | Es la lectura natural de "el RPE del día contra los `target_rpe` del día", y degrada solo cuando sólo algunos ejercicios tienen target |

La tolerancia se mantiene en **±1 punto**: es ruido de percepción, no una carga mal calibrada.

---

## 4. Las funciones puras

`packages/core/src/domain/rpeDelta.ts`. Van en `domain/` porque son la regla de "cuándo una carga
está mal calibrada", que es una decisión de producto y no puede vivir repartida en templates de Vue
(`CLAUDE.md` §5).

```ts
export type RpeSeverity = 'ok' | 'heavy' | 'light' | 'unknown'

export type RpeComparison = {
  /** percibido - objetivo. Positivo = costó más de lo pedido. */
  delta: number | null
  severity: RpeSeverity
  label: string
}

/** El objetivo del día: promedio de los target no nulos. null si no hay ninguno. */
export function dayTargetRpe(targets: readonly (number | null)[]): number | null

/** ±1 es ruido; a partir de 2 el coach debería mirar la carga. */
export function rpeDelta(targetRpe: number | null, perceivedRpe: number | null): RpeComparison

/** Agrega DÍAS, no ejercicios: un par comparable por día cerrado. */
export function summarizeRpe(pairs: readonly RpePair[]): RpeSummary
```

`summarizeRpe` conserva la forma del plan viejo (`comparable`, `averageDelta`, `ok`, `heavy`,
`light`) — lo que cambia es la **unidad**: un par por día, no por ejercicio.

Casos borde que van a tests: en el objetivo, ±1, ±2 en las dos direcciones, sin objetivo, sin
percibido, lista vacía, y un día donde ningún ejercicio tiene `target_rpe`. `dayTargetRpe` redondea a
1 decimal para no mostrar `7.333333`.

---

## 5. La agregación

`packages/api/src/access/coachFeedback.ts`. Va en `api/src/access/` y no en `core`, igual que
`playerWeek.ts`: toca Supabase, así que no es dominio puro.

```ts
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

export type PlayerFeedbackDetail = PlayerFeedback & {
  days: FeedbackDay[]
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
```

- El "2/3 días" sale de **`weekProgress`, que ya existe y está testeado** — no se recuenta a mano.
- Todas las queries van con el cliente creado de la sesión del coach. **Nunca `service_role`**
  (`CLAUDE.md` §4). RLS es la que garantiza que no vea plantel ajeno.
- Resolver el programa por jugador en un loop es aceptable a 40–60 jugadores: son queries por índice,
  no scans (`CLAUDE.md` §2, no optimizar prematuramente). Si un plantel pasa de 100, lo primero es
  cachear por grupo dentro del request — **antes** de tocar cualquier otra cosa.

### Las rutas

`packages/api/src/routes/coach/feedback.ts`, montada bajo el grupo que ya lleva
`requireRole(['COACH','ADMIN'])` — nace protegida por la capa 2 de `CLAUDE.md` §4.

| Ruta | Devuelve |
|---|---|
| `GET /coach/feedback` | `PlayerFeedback[]` — el plantel con su "2/3 días" |
| `GET /coach/feedback/:playerId` | `PlayerFeedbackDetail` — el detalle por día |

Un `playerId` de otro coach devuelve **404, nunca 403** (`CLAUDE.md` §4 capa 4: no revelar
existencia). Es el test de scoping obligatorio.

---

## 6. Las pantallas

`pages/coach/feedback/index.vue` y `pages/coach/feedback/[playerId].vue` van como **hermanas**, con
`index.vue`. No comparten estado ni encabezado, así que la regla de nombres de `CLAUDE.md` §5 dice
hermanas y no padre/hijo — si se hicieran `feedback.vue` + `feedback/`, el detalle no renderizaría sin
un `<NuxtPage />`.

### `RpeBadge.vue`

Recibe `targetRpe` y `perceivedRpe`, llama `rpeDelta` y pinta según `severity`: `ok` verde (`pitch`,
el verde botella que estrenó F4-A), `heavy` rojo, `light` celeste, `unknown` gris.

> **El color no es la única señal.** El texto siempre dice los dos números (`8 → 10`), para que sirva
> con daltonismo y en una captura en blanco y negro.

### El listado

Columnas: Jugador (link al detalle), Puesto, Semana, **Días** (`2/3`), **RPE**
(`+1.5 promedio · 2 pesados`), Última nota (truncada). Estado vacío si el plantel está vacío.

En mobile la tabla colapsa a cards: una por jugador, con los días y el RPE arriba y la nota abajo. Una
tabla de 6 columnas a 380 px no se lee.

### El detalle

Por cada día de la semana vigente:

- Encabezado con el nombre del día, si está cerrado y cuándo.
- **La nota del día destacada en una card** si existe. Es la mitad del valor de esta pantalla: el RPE
  dice cuánto costó, la nota dice por qué.
- **El `<RpeBadge>` una vez por día**, no por ejercicio.
- Tabla de ejercicios: nombre, lo planificado (`sets × reps` + etiqueta de carga) y lo hecho
  (`peso · reps`).

> **Cambio contra el plan viejo:** ese plan ponía un badge en cada fila de ejercicio. Con el RPE por
> día eso es imposible — no hay un percibido por ejercicio contra el cual comparar. El badge sube al
> encabezado del día y la tabla de ejercicios queda mostrando planificado vs. hecho.

### El sidebar

Primer ítem de `NAV.COACH`:

```ts
{ to: '/coach/feedback', label: 'Cómo viene el plantel', icon: 'i-lucide-activity' },
```

Va primero porque es la pantalla a la que el coach entra a **mirar**, no a editar.

> Cada ícono nuevo va también a la lista de `nuxt.config.ts` o `tests/icons.test.ts` falla — y falla
> en los dos sentidos.

---

## 7. Verificación

En orden de "qué pasa si esto está mal":

1. **Scoping** (capa 4). `GET /coach/feedback/:playerId` con un jugador de otro coach → **404**. Que
   el listado de un coach no incluya jugadores ajenos.
2. **`rpeDelta` y `dayTargetRpe`** como funciones puras, con los casos borde de §4.
3. **El día sin `target_rpe` en ningún ejercicio** no rompe: severidad `unknown`, no `NaN`. Es el caso
   que más fácil se cuela, porque `target_rpe` es nullable y las planillas reales lo dejan vacío.
4. **El jugador sin programa asignado** aparece en el listado con `0/0` y sin RPE, no desaparece ni
   tira 500.
5. **`rbac-auditor` antes de mergear**: es una ruta nueva que toca datos de jugador.

---

## 8. Lo que este spec NO resuelve

- **`programs.current_week_id` sigue siendo global al programa.** Si el coach avanza la semana, el
  "2/3" de todo el plantel se reinicia junto. Es la deuda de F0, anotada en `IMPLEMENTATION-F3.5.md`
  §6.5 y en el spec de F4-B §6.
- **`exercise_entries.rpe` queda huérfana.** La columna sigue en el schema y `playerWeek.ts` la lee,
  pero ninguna pantalla la escribe desde F3.5. **No se dropea acá**: sacar una columna es una
  migración con su propio riesgo y no bloquea nada. Queda anotado.
- **El E2E del loop completo** (coach → programa → jugador → 1RM → "80% → 112 kg" → registro →
  feedback) sigue pendiente. `CLAUDE.md` §5 lo pide recién cuando el flujo esté completo — que es
  justamente después de esto, así que es el próximo candidato.
- **Los pasos 1, 3, 4 y 6 del handoff** no son de esta rama: el keepalive de UptimeRobot y el borrado
  de datos de prueba los hace el dueño del repo, la recuperación de contraseña es una decisión suya, y
  terminar el click-through necesita browser con sesión real.
