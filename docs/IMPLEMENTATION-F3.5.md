# F3.5 — Qué se implementó, dónde y por qué

> Registro de la sesión del **2026-07-30** sobre la rama `feature/f3`. El plan ejecutado es
> `docs/superpowers/plans/2026-07-30-f35-player-dashboard.md`; las decisiones están en
> `docs/superpowers/specs/2026-07-29-f35-player-dashboard-design.md` y los valores visuales en
> `docs/DESIGN-SYSTEM.md`. La fuente de verdad de lo transversal sigue siendo `CLAUDE.md`.

---

## 1. Resumen

El jugador dejó de entrar a un formulario y entra a un **dashboard**: la rueda "2/3 rutinas de esta
semana" y la tendencia de sus tests de fuerza. "Mi semana" se comprimió a una lista de días, y el día
se presenta **como la planilla del club** —bloques con su nombre, el peso grande— con el registro
detrás de un chip que abre un slideover. El RPE percibido se pide **una vez por día**. Una evaluación
nueva actualiza el 1RM vigente por trigger, así que cargar un test recalcula los kg de la rutina. Y la
paleta del club repinta la app entera desde `main.css` + `app.config.ts`.

| | Estado |
|---|---|
| Dominio: `evaluationTrend`, `nextOneRmFrom`, `weekProgress`, `isLoadType` | ✅ 27 tests nuevos |
| Validadores: `evaluationSchema`, `completeDaySchema` | ✅ incluidos arriba |
| Migraciones `0016`, `0017`, `0018` | ✅ aplicadas y **verificadas en vivo** |
| API: `/player/dashboard`, evaluaciones del jugador y del coach | ✅ 11 tests nuevos |
| Pantallas: dashboard, semana comprimida, el día, 6 componentes | ✅ typecheck de `.vue` en verde |
| Paleta del club + escudo en el shell | ✅ `tests/theme.test.ts`, 17 tests nuevos |
| **`pnpm lint`** | ✅ **existe y corre por primera vez** (§4.1) |
| **`pnpm typecheck`** | ✅ los 3 paquetes |
| **`pnpm test`** | ✅ **394** (baseline 332) |
| **`pnpm verify:setup`** | ✅ **85/85** (baseline 80) |
| **`pnpm smoke:player`** | ✅ **32/32** (baseline 22) |

**Lo que NO está verificado, a ojos abiertos: nadie miró las pantallas en un browser.** Es la misma
deuda que dejó F3 y sigue abierta — la lista exacta está en §6.

---

## 2. Decisiones de diseño

Las cinco del spec §2, sin cambios al implementarlas:

1. **El RPE percibido se pide una vez por día**, al cerrar la sesión, y es opcional (spec §2.1).
   Migración `0017`.
2. **"Va mejorando" es la última medición contra la anterior** (spec §2.2), y **"bajó" nunca es rojo**:
   la regla de color desactiva el riesgo de que un mal día se lea como castigo.
3. **Se rescata el nombre del bloque** de la columna B de la planilla (spec §2.3). Migración `0016`.
4. **Una evaluación nueva actualiza el 1RM vigente**, solo si es la más reciente, y un test más bajo
   lo baja (spec §2.4). Migración `0018`, por **trigger** y no en la ruta: las evaluaciones entran por
   dos caminos y la tercera ruta se olvidaría de la regla.
5. **`pnpm lint` se agrega después de contar** (spec §2.5). Ver §4.1.

---

## 3. Mapa de archivos nuevos

```
supabase/migrations/
  0016_block_name.sql                 # blocks.name + CHECK de largo
  0017_session_log_rpe.sql            # session_logs.perceived_rpe + CHECK de rango
  0018_evaluation_syncs_one_rm.sql    # trigger evaluación → 1RM

scripts/
  gen-types.mjs                       # gen:types, ahora ejecutable en Windows (§4.2)

packages/core/src/
  types/database.ts                   # MUDADO desde packages/web/types/
  domain/evaluationTrend.ts           # evaluationTrend + nextOneRmFrom
  domain/weekProgress.ts              # los números de la rueda
  domain/calcLoad.ts                  # MODIFICADO: guard isLoadType (§4.4)
  domain/{parseCoachSheet,parseGrid,parseText}.ts  # MODIFICADOS: conservan el nombre del bloque
  domain/buildPlayerDay.ts            # MODIFICADO: PlannedBlock.name
  validators/evaluation.ts            # evaluationSchema
  validators/session.ts               # MODIFICADO: completeDaySchema
  validators/parsedProgram.ts         # MODIFICADO: name en parsedBlockSchema

packages/api/src/
  access/evaluations.ts               # evaluationsFor, trendsFrom, assertMyPlayer
  access/playerDashboard.ts           # playerDashboardFor
  routes/player/dashboard.ts          # GET /player/dashboard
  routes/player/evaluations.ts        # GET/POST/DELETE de las propias
  routes/coach/players.ts             # MODIFICADO: GET/POST del plantel
  db/client.ts                        # MODIFICADO: los 3 clientes tipados con Database
  access/embedded.ts                  # BORRADO (firstOf)

packages/web/
  public/escudo-{light,dark}.png      # el escudo del shell
  eslint.config.mjs                   # config flat de @nuxt/eslint
  app/assets/css/main.css             # MODIFICADO: las 4 paletas + bloque .dark
  app/app.config.ts                   # MODIFICADO: el mapeo de alias
  app/pages/player/index.vue          # dashboard
  app/pages/player/week/index.vue     # lista de días
  app/pages/player/week/[dayId].vue   # el día
  app/components/player/{ProgressRing,EvaluationCard,BlockSection,
                         ExerciseLine,LogSlideover,StepperField,
                         EvaluationsForm}.vue
  app/components/player/{DayCard,ExerciseRow}.vue   # BORRADOS
  app/pages/player/week.vue                          # BORRADO
  tests/{theme,autosave}.test.ts
```

---

## 4. Los problemas que valen la pena

### 4.1. ESLint destapó 3 hallazgos, no una avalancha

La Task 3 estaba escrita esperando ruido inmanejable y con un checkpoint para decidir qué reglas
apagar. La cuenta real fue **2 errores y 1 warning**, así que no se apagó ninguna regla:

| Regla | Dónde | Qué era |
|---|---|---|
| `preserve-caught-error` | `usePlayerApi.ts:26`, `useCoachApi.ts:27` | El `catch` traducía el error de red al mensaje lindo de la API y **tiraba el original**. Se agregó `{ cause: error }`: el toast sigue mostrando el texto lindo, pero el status y la URL quedan para debuggear |
| `vue/html-self-closing` | `import.vue:216` | `<input/>` en un elemento void |

`pnpm lint` ahora sale **exit 0**, que es la primera vez en la vida del proyecto. `core` y `api` tienen
un `lint` que solo imprime que no tienen linter propio: son TS puro y los cubre `typecheck`. Meter
ESLint en los tres packages a la vez habría multiplicado el ruido a contar, y es una task propia si
alguna vez se quiere.

### 4.2. `gen:types` nunca había corrido en Windows, y al fallar borraba los tipos

El script era:

```
supabase gen types typescript --project-id $SUPABASE_PROJECT_ID --schema public > packages/.../database.ts
```

Dos fallas encadenadas, y la segunda es la que hace daño:

1. **`$SUPABASE_PROJECT_ID` no se expande.** pnpm corre los scripts con el shell del sistema y cmd.exe
   no conoce esa sintaxis: la CLI recibía el literal `$SUPABASE_PROJECT_ID` como ref.
2. **`>` trunca ANTES de correr el comando.** Con el fallo de (1), el resultado fue `database.ts`
   **vacío**: el generador no había arrancado y el archivo bueno ya no estaba. Se recuperó con
   `git checkout`, pero en una máquina sin el archivo commiteado se habría perdido.

Ahora es `scripts/gen-types.mjs`: resuelve el ref de `SUPABASE_PROJECT_ID` **o** de
`supabase/.temp/project-ref` (que el CLI deja al linkear), genera **a memoria**, valida que la salida
parezca un schema, y recién entonces escribe. Un fallo deja el archivo como estaba.

> Detalle de Windows que costó un intento: no se puede invocar `npx supabase` con `execFileSync` sin
> shell — los shims `.cmd` dan `EINVAL`. Se llama al entry JS del CLI con el mismo `node`.

### 4.3. Tipar el cliente de Supabase destapó 4 errores reales, no ruido

La Task 7 avisaba que podía haber una cascada y traía una salida documentada. Fueron **4**, y los
cuatro eran defectos de verdad:

| Dónde | Qué escondía el tipo suelto |
|---|---|
| `programs.ts:356`, `profile.ts:166` | El patch de un `UPDATE` estaba tipado como `Record<string, unknown>`, así que **cualquier** columna compilaba. Ahora usan el tipo `Update` de la tabla: un `patch.role = …` de más ni siquiera compila, que es justo lo que el comentario de `profile.ts` decía querer |
| `tree.ts:65` | `nextIndexFor(db, table: string, …)` recibía el nombre de tabla como string suelto, y `db.from(string)` no puede resolver ninguna columna. Se acotó a la unión de las 4 tablas que llevan `order_index` |

Con eso, la Task 8 borró `firstOf` y sus 8 usos: los ocho embeds eran efectivamente many-to-one y TS
ahora lo sabe solo. Los tipos locales que describían a mano la ambigüedad (`Named`, `ExerciseRow`,
`LogRow`, `EntryRow`…) se fueron con él.

### 4.4. `load_type` es `text` con CHECK, no un enum: el único cast que no se pudo borrar

Al quitar los casts, `block_exercises.load_type` quedó como `string` —los tipos generados no lo
estrechan porque la columna es `text` con un `CHECK`, no un enum de Postgres— y no encajaba en
`LoadType`.

Se resolvió **estrechando con un guard del dominio** (`isLoadType`, nuevo en `calcLoad.ts`) y no
casteando, que es el mismo criterio que F3 usó con `isPositionId` (§5.2 de aquel doc): si algún día la
base tuviera un valor que el código no conoce, el ejercicio cae en `NONE` en vez de romper el render.

### 4.5. El nombre del bloque se descartaba en los TRES parsers, no en uno

El plan pedía arreglar `parseCoachSheet`. Al correr los tests fallaron también `parseGrid` y
`parseText`, que producen el mismo `ParsedBlock`: los dos **ya tenían el nombre en la mano** y lo
descartaban igual — `parseGrid` lo usaba solo como clave de agrupación, `parseText` como encabezado
que leía y tiraba. Se arreglaron los tres.

### 4.6. El typecheck de `.vue` que F3 arregló atajó 4 errores de este plan

Los snippets del plan usaban `@click="() => (open = true)"`. Una asignación **devuelve el valor
asignado**, y Nuxt UI tipa `onClick` como `(event) => void | Promise<void>`: son 4 `TS2322`, la misma
clase que `IMPLEMENTATION-F3.md` §5.2 documenta. Se envuelven en llaves.

Vale anotarlo porque es el gate de F3 pagando: antes de aquel arreglo, `vue-tsc` crasheaba y salía con
código 0, así que estos cuatro habrían llegado a producción sin que nada chistara.

### 4.7. El trigger `0018` funciona con RLS puesta, sin `security definer`

La migración decide explícitamente **no** ser `security definer`, apostando a que `one_rms_write`
(0011) admite el mismo conjunto de escritores que `evaluations_write` (0003). Eso es una hipótesis
sobre dos políticas, y si estuviera mal el insert de la evaluación fallaría con 42501.

`smoke:player` lo prueba en el caso que importa: el insert de la evaluación va con la **sesión real del
jugador** (su JWT, RLS aplicada) y el 1RM queda sincronizado en 150. Además el bloque anterior del
smoke había borrado ese 1RM, así que el check prueba el `insert` del upsert y no solo el `update`.

---

## 5. Verificación

| Comando | Resultado |
|---|---|
| `pnpm lint` | exit 0 — **primera vez que corre** |
| `pnpm typecheck` | exit 0 en los 3 packages |
| `pnpm test` | **394** (247→281 core, 82→93 api, 3→20 web) |
| `pnpm verify:setup` | **85/85** |
| `pnpm smoke:player` | **32/32** |
| `pnpm build` | `Build complete` |

Los tres checks del trigger `0018` en `verify:setup` se miran por **código de error**, no por "falló":
`23514` prueba que lo frenó el CHECK y no RLS. Y el tercero —"cargar un test VIEJO no cambia el 1RM"—
es el que importa: si diera 100, la condición del `exists` estaría mal y cargar un test atrasado le
arruinaría el 1RM al jugador.

---

## 6. Deuda conocida

Lo del spec §12 sigue vigente. Lo que agrega esta implementación:

### 6.1. El click-through en browser — parcialmente saldado el 2026-07-31

Se levantó la app y se manejó Chrome con `playwright-core` (instalado **fuera del repo**, en el
scratchpad, para no tocar el lockfile). Estado por item:

| # | Qué | Estado |
|---|---|---|
| 1 | La paleta se ve | ✅ **verificada** |
| 2 | El escudo cambia de **arte**, no de color | ✅ **verificado** |
| 3 | El slideover: −/+ tocables, peso en el prescrito | ⛔ **falta** — necesita sesión de jugador |
| 4 | El caso del 409 al completar el día | ⛔ **falta** — ídem |
| 5 | El re-login tras cambiar la contraseña | ⛔ **falta** — ídem |
| 6 | Inputs tocables a 380 px sin zoom | ✅ **fallaba — arreglado** (§6.7) |
| 7 | Pasada por las ~10 pantallas del coach | ⛔ **falta** — necesita sesión de coach |

Lo verificado, con el número medido y no estimado:

- **La paleta llega de verdad.** `--ui-primary` = `#7d2230` en claro y `#96303f` en oscuro, leído del
  DOM vivo. Eso **cierra la pregunta abierta de `docs/DESIGN-SYSTEM.md` §3.5**: la convención 500/400
  de Nuxt UI se cumple, así que los dos rojos del mock salen de una escala sin ningún `dark:`. El
  fondo oscuro es `#10152a` y el claro es cálido.
- **El escudo es arte distinto**, no un recoloreo: el claro es borgoña macizo y el oscuro es línea
  blanca — los rayos del sol y el león están perfilados en vez de rellenos.

**Lo que falta es la mitad autenticada** (3, 4, 5 y 7): un `auth.global.ts` manda a `/login` toda ruta
que no sea pública, así que sin una sesión real no se renderiza ninguna pantalla del jugador ni del
coach. Los dos scripts que las poblarían (`verify:setup`, `smoke:player`) piden
`SUPABASE_SERVICE_ROLE_KEY`, que **no está en `.env` y no debe estarlo** (CLAUDE.md §4).

### 6.7. Dos defectos que el click-through encontró y se arreglaron

Los dos son de la clase que ningún test del repo podía agarrar, porque solo existen una vez que el
navegador resuelve las variables y calcula el layout.

**A. El label del botón primario en oscuro estaba en 2.31:1.** Nuxt UI pinta el `solid` con
`text-inverted`, que en oscuro es texto **oscuro**, asumiendo un acento claro. `clubred-400`
(`#96303f`) no lo es. El CTA más importante de la app —"Entrar", "Completar día"— quedaba ilegible en
modo oscuro. Con blanco da **7.52:1**. Es la 4ª divergencia de `DESIGN-SYSTEM.md` §3.5, y también
tocaba a `navy` (2.59:1 → 6.72:1). `gold` y `error` se dejaron como estaban **a propósito**: son
claros de verdad y el blanco los habría roto.

**B. Los controles medían 32 px, no 44.** `DESIGN-SYSTEM.md` §6 pide "objetivos táctiles de 44 px de
alto real" desde el principio; nunca se había medido. Los tamaños de Nuxt UI son *padding*, no alto
fijo, así que el default `md` da 32 px. Además la fuente del campo era de **14 px**, y abajo de 16
Safari en iOS hace zoom solo al enfocar: el "sin zoom" del item 6 se rompía por partida doble. Ahora
`md` está redefinido en `app.config.ts` (tabla en `DESIGN-SYSTEM.md` §6) y **el botón se queda en 14 px
a propósito** — el zoom de iOS solo dispara en campos editables.

Los dos quedan fijados por 8 tests nuevos en `tests/theme.test.ts` (20 → 28). Se verificó que los
tests **fallan** si se revierte el arreglo, no solo que pasan con él.

> **Lo único que sí se verificó sin browser** es lo que se podía leer del código: que
> `--ui-primary` resuelva al tono **500 en claro y 400 en oscuro** está confirmado en
> `@nuxt/ui/dist/runtime/plugins/colors.js` (líneas 26–31), así que la salida alternativa que el plan
> preveía para la Task 4 Step 7 **no hizo falta**. Y el bloque `.dark` de `main.css` gana la cascada
> porque el de Nuxt UI vive dentro de `@layer base` y el propio va sin capa.

### 6.2. Borrar una evaluación no revierte el 1RM

El trigger `0018` corre en `insert` y `update of kg, tested_on`, **no en delete**. Si el jugador borra
su último test, el 1RM queda con el valor que ese test sincronizó. Es aceptable —el 1RM se edita a
mano— pero es una sorpresa si alguien lo busca.

### 6.3. `--ui-text-toned` no se sobrescribe en modo oscuro

El bloque `.dark` de `main.css` pisa 10 variables de superficie, y `--ui-text-toned` no está entre
ellas: sigue saliendo de `clay-300`, que es cálido, sobre fondo marino. Casi no se usa, así que se deja
anotado en vez de tocarlo a ciegas — el click-through de §6.1 es el que puede decir si molesta.

### 6.4. `core` y `api` no tienen linter propio

Su script `lint` solo imprime que no lo tienen. `tsc --noEmit` los cubre y no tienen `.vue`. Si se
quiere lint real ahí, es una task propia (§4.1).

### 6.5. El progreso de la semana sigue siendo global al programa

`programs.current_week_id` no es por jugador: si el coach avanza la semana, la rueda de **todo el
plantel** se reinicia junta. Es lo que definió el modelo de F0 y alcanza para un plantel que entrena
junto — pero ahora la rueda lo vuelve **visible**, que es la parte nueva.

### 6.6. Sigue faltando el reordenamiento por drag&drop

Deuda de F2 sin cambios: la ruta y el helper `reindex` existen y están testeados, falta el gesto.
