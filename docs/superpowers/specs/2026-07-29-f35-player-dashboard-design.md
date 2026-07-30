# F3.5 — Dashboard del jugador y limpieza de deuda: diseño validado

> Spec acordado con el dueño del repo el **2026-07-29**. Reemplaza a
> `2026-07-29-f35-player-dashboard-scope.md`, que era un borrador de alcance con cinco decisiones
> abiertas: las cinco están resueltas acá (§2).
>
> Lo **visual** no se repite en este archivo: vive en `docs/DESIGN-SYSTEM.md`, que salió de los
> mockups validados. Las decisiones transversales siguen en `CLAUDE.md`.

---

## 1. El problema

F3 entregó el panel del jugador **como se había especificado desde F0**: una pantalla donde el
jugador registra lo que hizo, con el RPE percibido como dato central. Al verlo funcionando, el dueño
del repo pidió otra cosa:

> "La idea es simplificar al jugador, que ingrese lo menos posible. Que vea su rutina que le toca y
> qué peso tendría que usar, el jugador va y hace la rutina y después **si quiere** ingresa si usó más
> peso o no."

Es un **cambio de eje del producto**, no un ajuste de UI. F3 asume que el jugador es una fuente de
datos; F3.5 asume que es un **lector** de su rutina, y que el registro es opcional y secundario.

F3.5 se mete **entre F3 y F4** porque F4 (el loop de feedback del coach) se construye sobre datos que
esta fase vuelve opcionales. Resolverlo después de F4 sería resolverlo tarde.

## 2. Las cinco decisiones que estaban abiertas

### 2.1. El RPE percibido se pide una vez por día, no por ejercicio

Era la decisión §6.1 del scope, y la más consecuente: `CLAUDE.md` §1 define comparar RPE objetivo
vs. percibido como **el dato clave del producto**, y F4 es exactamente esa pantalla.

**Resolución:** se conserva como dato central, pero se pide **una sola vez al cerrar el día**. Doce
preguntas por sesión garantizan que nadie las conteste; una sola es un toque. El RPE por ejercicio
**se conserva** como campo opcional dentro del slideover —la columna existe y F3 ya la escribe—, pero
deja de ser lo que se pide.

**Lo que esto obliga:** el RPE del día **no tiene dónde vivir**. `session_logs` es
`(id, player_id, day_id, note, completed_at, updated_at)`. Necesita una columna nueva (§4.2).

**Efecto sobre F4:** su fuente principal pasa a ser `session_logs.perceived_rpe` comparado contra los
`block_exercises.target_rpe` del día, no una comparación por ejercicio. F4 gana en cobertura de datos
y pierde granularidad. `CLAUDE.md` §1 se actualiza en este PR.

### 2.2. "Va mejorando" es la última medición contra la anterior

Era §6.2. **Resolución:** última vs. anterior, mostrando el **delta absoluto en kg** más una flecha
("+8 kg" ↑). No contra la mejor histórica (eso es récord personal, no tendencia) ni contra hace N
semanas (obliga a elegir N sin datos para hacerlo).

El riesgo que tenía anotado —"un mal día se lee como retroceso"— lo desactiva una regla de color, no
un cambio de algoritmo:

> **"Bajó" nunca es rojo.** Va en muted. Bajar en un test no es un error del jugador ni algo que la
> UI deba castigar.

Cinco casos, y son todos los que existen: subió, igual, bajó, primera evaluación, sin evaluaciones.

### 2.3. Se rescata el nombre del bloque

Era §6.3. **Resolución: sí.** Para que la rutina se lea "como el Excel", el nombre del bloque
("CIRCUITO CALENTAMIENTO", "Fuerza tren inferior", "C 1") es justamente lo que la hace legible.

Verificado en el código antes de decidir: el parser **ya tiene el nombre en la mano** cuando crea el
bloque. En `packages/core/src/domain/parseCoachSheet.ts` la variable `label` contiene la columna B de
la fila del bloque, y al construir el `ParsedBlock` se descarta. Rescatarlo es una línea ahí, más la
migración, el validador del import y la ruta.

**Costo aceptado:** los programas ya importados **no tienen** el nombre. Se llenan reimportando la
planilla, o quedan sin nombre de bloque (que es exactamente el estado de hoy, así que no rompe nada).

### 2.4. Una evaluación nueva actualiza el 1RM

Era §6.4. Hoy `evaluations` y `one_rms` son **dos tablas sin ninguna relación**: `CLAUDE.md` §3 las
describe como "historial de tests" y "el 1RM vigente", y nada las conecta.

Eso es visible para el jugador y se lee como un bug: el dashboard le muestra "Sentadilla 140 kg" como
su último test, y la rutina le calcula los kg con el 1RM viejo — o peor, le pone el banner "falta tu
1RM de Sentadilla" al lado de un test que acaba de cargar.

**Resolución:** la evaluación es el evento, el 1RM es la proyección. Cargar una evaluación hace upsert
en `one_rms`. Se conserva el schema de las dos tablas (no se elimina `one_rms`, que era la opción más
limpia pero exigía backfill y tocaba `rmFor`, `calcLoad`, el perfil y la ruta del coach).

Dos precisiones que son las que evitan que la regla haga daño:

- **Solo pisa el 1RM si la evaluación es la más reciente** para ese `(player_id, exercise_id)` según
  `tested_on`. Cargar un test viejo que faltaba no arruina el 1RM vigente.
- **Un test más bajo baja el 1RM.** Es "el 1RM **vigente**", no "el récord": si hoy levantás 155
  donde antes 160, tus porcentajes tienen que salir de 155. Después se puede editar a mano, y ahí
  gana el último que escribe — la misma regla que F3 §3.2.

### 2.5. `pnpm lint` se agrega, después de contar los hallazgos

Era §6.5. **Resolución:** se agrega `@nuxt/eslint`, se cuenta cuánto ruido destapa y **se reporta
antes de arreglar nada** — el mismo procedimiento que se usó con `vue-tsc` en F3, donde contar
primero (15 errores, 12 preexistentes) fue lo que permitió decidir con datos. Si el ruido resulta
inmanejable, se discute; el gate de `CLAUDE.md` §5 no puede seguir citando un script que nunca
funcionó.

## 3. Sistema de diseño: alcance y lo que arrastra

La paleta del club se aplica a **toda la app**, no solo al panel del jugador. Es una línea en
`app.config.ts` más las escalas en `main.css`, y es a lo que apuntaba el `TODO` que ya estaba escrito
en `app/app.config.ts`.

Los detalles (escalas, tonos, mapeo de alias, divergencias claro/oscuro) están en
`docs/DESIGN-SYSTEM.md` §3. Tres cosas de acá que son de **esta fase**, no del sistema de diseño:

**El escudo va en el shell de toda la app**, no por pantalla: `layouts/default.vue`, una sola vez.
CoachLab pasa a estar branded del club en vez de genérico — es una decisión de producto tomada a ojos
abiertos.

> **Bloqueante parcial:** los PNG `obc-logo-red.png` y `obc-logo-white.png` **no están en el repo** y
> no existe `packages/web/public/`. Es lo único de la fase que no puede avanzar sin que el dueño del
> repo los aporte. Todo el resto es independiente.

**Los 10 iconos que faltan** van a `clientBundle.icons` de `nuxt.config.ts`: `chevron-right`,
`check-circle`, `circle-dashed`, `circle`, `message-square-plus`, `rotate-ccw`, `calendar-x`,
`trending-up`, `trending-down`, `minus`. Y hay que **sacar** los que el rediseño deje de usar:
`tests/icons.test.ts` falla en los dos sentidos.

> **Deuda que esta decisión crea, anotada a propósito:** la paleta repinta las ~10 pantallas del
> coach sin que nadie las rediseñe. Sus botones y badges cambian de color por herencia del tema. Se
> eligió así (contra la alternativa de revisarlas en esta misma fase) para no inflar el alcance. Hay
> que mirarlas en el click-through y anotar lo que quede raro; corregirlas es una fase propia.

## 4. Schema — tres migraciones

### 4.1. `0016_block_name.sql`

`alter table public.blocks add column name text`. Nullable: los bloques ya importados no lo tienen, y
un `CIRCUIT` puede rotularse solo por sus vueltas. Sin `CHECK` — un nombre de bloque no tiene
invariante que expresar más allá de su largo, que lo cubre Zod.

### 4.2. `0017_session_log_rpe.sql`

```sql
alter table public.session_logs
  add column perceived_rpe numeric(3, 1)
  check (perceived_rpe is null or perceived_rpe between 1 and 10);
```

Espeja `exercise_entries.rpe`: un decimal, rango 1–10, nullable porque es opcional y no bloquea el
cierre del día (§2.1).

### 4.3. `0018_evaluation_syncs_one_rm.sql`

Trigger `after insert or update on public.evaluations` que hace upsert en `one_rms` **solo si la
evaluación es la más reciente** para ese `(player_id, exercise_id)`.

**Va como trigger y no en la ruta de la API**, y la razón es de arquitectura, no de gusto: las
evaluaciones las escriben **dos roles por caminos distintos** —el jugador desde su perfil, el coach
desde la ficha del plantel, y probablemente en lote en una instancia de testeo—. Un trigger lo
garantiza una vez; en las rutas habría que acordarse en cada una, y la próxima ruta que se agregue
nacería sin la regla. Es `CLAUDE.md` §4: la capa 1 es la única que un bug de aplicación no puede
saltear.

Tres detalles que salen de lecciones ya pagadas en este repo:

- **`security definer` con `set search_path = public`**, como `program_of_day` de la migración `0015`.
- **`revoke execute ... from public, anon`**, no solo `from anon` — la lección de
  `IMPLEMENTATION-F2.md` §4.2, donde la forma incompleta se copió tres veces.
- **No aplica la trampa del `42501`** de `CLAUDE.md` §3: el trigger escribe en `one_rms`, cuya
  política de `SELECT` no se toca, así que la fila resultante sigue visible para su dueño.

**La regla también existe como función pura** (`nextOneRmFrom`, §5), para poder testear "un test viejo
no pisa el 1RM" en milisegundos en vez de contra una base levantada. El trigger es la garantía; la
función pura es la especificación testeable. Es la misma división que `CLAUDE.md` §3 usa para
`resolveProgram`.

## 5. Dominio puro nuevo

En `packages/core/src/domain/`. Sin Supabase, sin Hono, sin Vue, sin `process.env`.

**`evaluationTrend.ts`**

```ts
export type Evaluation = { kg: number; testedOn: string }

export type Trend = {
  latest: Evaluation | null
  previous: Evaluation | null
  deltaKg: number | null
  direction: 'up' | 'down' | 'flat' | 'first' | 'none'
}

export function evaluationTrend(evaluations: readonly Evaluation[]): Trend
export function nextOneRmFrom(evaluations: readonly Evaluation[]): number | null
```

`direction: 'none'` es la lista vacía (el caso "Sin evaluaciones todavía" del mock) y `'first'` es una
sola evaluación sin con qué comparar. Se ordena por `testedOn` **explícitamente** dentro de la
función: no se confía en el orden en que vienen las filas (`CLAUDE.md` §3).

`nextOneRmFrom` devuelve el kg de la evaluación más reciente — es la regla del trigger de §4.3
expresada como función, y lo que hace testeable el caso del test viejo.

**`weekProgress.ts`** — `weekProgress(completedDayIds, totalDays): { completed, total, ratio }` para
el ring. `ratio` es 0 cuando `total` es 0, sin dividir por cero.

## 6. API

Todas las rutas del jugador cuelgan de `/player/*`, que ya tiene `requireRole(['PLAYER'])` desde F1;
las del coach de `/coach/*`. Es la capa 2 de `CLAUDE.md` §4.

| Método | Ruta | Notas |
|---|---|---|
| GET | `/player/dashboard` | Evaluaciones agrupadas por ejercicio + progreso de la semana |
| POST | `/player/evaluations` | `evaluationSchema`. El trigger sincroniza el 1RM |
| GET | `/player/evaluations` | Historial completo del jugador |
| DELETE | `/player/evaluations/{id}` | |
| POST | `/coach/players/{playerId}/evaluations` | Mismo schema; scope contra el plantel del coach |
| GET | `/coach/players/{playerId}/evaluations` | |
| POST | `/player/days/{dayId}/complete` | **Cambia**: acepta `perceivedRpe` además de `note` |

`evaluationSchema` nuevo en `packages/core/src/validators/`, espejando el `CHECK` de la tabla
(`CLAUDE.md` §5: Zod da el mensaje lindo, la base da la garantía): `exerciseId` uuid, `kg > 0` con un
decimal y tope de cordura 500, `testedOn` fecha **no futura**.

Ninguna ruta del jugador acepta un `playerId` del cliente: siempre es `actor.id`. En las del coach, el
`playerId` se valida contra su plantel y un recurso ajeno da **404, nunca 403** (`CLAUDE.md` §4
capa 4).

**El jugador elige del catálogo; no crea ejercicios.** `ensure_exercise` rechaza a PLAYER a propósito
(migraciones `0012`/`0014`), así que el typeahead de evaluaciones lista `/catalog/exercises` y manda
un `exerciseId` — igual que el 1RM de F3.

`evaluations_write` ya permite `player_id = auth.uid() or is_my_player(player_id) or is_admin()`
desde la migración `0003`: **las dos puntas escriben sin ningún cambio de RLS.**

## 7. Rutas y pantallas

```
pages/player/
  index.vue          # dashboard — pasa a ser ROLE_HOME.PLAYER (hoy es /player/week)
  week/index.vue     # la lista de días
  week/[dayId].vue   # un día
  profile.vue        # + carga de evaluaciones
```

**Hermanas, no anidadas.** `week/index.vue` y `week/[dayId].vue` no comparten encabezado ni estado
—una lista días, la otra muestra uno—, así que **no** existe un `week.vue` padre. Es la regla de
`CLAUDE.md` §5: si existieran los dos, `week.vue` pasaría a ser el padre y los hijos no se
renderizarían hasta que incluyera `<NuxtPage />`.

`ROLE_HOME.PLAYER` en `composables/useAuth.ts` pasa de `/player/week` a `/player`. Lo consumen el
middleware global, el login y el registro.

**Dashboard** (`index.vue`): ring de progreso "2/3 rutinas de esta semana", fila horizontal
scrolleable de tarjetas de tendencia con los cinco casos, y CTA "Ir a Mi semana".

**Lista de días** (`week/index.vue`): tarjetas —no filas compactas—, con nombre del día, cantidad de
ejercicios y estado en tres variantes distinguibles de un vistazo: "Sin empezar", "X/8 registrados"
con barra de progreso, y "Completada". Más el banner de 1RM faltantes y el estado vacío de "todavía no
tenés un programa asignado", que ya existen en la pantalla actual.

**El día** (`week/[dayId].vue`): la rutina como la planilla, con los bloques nombrados y separados, el
peso prescrito como el elemento más grande de cada fila, y el registro en un slideover al costado.
Cierre con el selector de RPE del día y el comentario **colapsado** detrás de "+ Agregar un
comentario" — hoy el textarea está abierto pegado arriba del botón y por eso se lee como un paso
obligatorio previo, cuando ya es opcional en el contrato (`dayNoteSchema` es `nullish`).

Vista de **día completado**: modo lectura, franja de cierre con "Reabrir", una línea por ejercicio, y
"usaste 120 kg" solo cuando el jugador registró algo distinto del prescrito.

La anatomía exacta de cada fila, los estados del control y los cuatro tratamientos de carga están en
`docs/DESIGN-SYSTEM.md` §7 y §8.

**Perfil** (`profile.vue`): suma la carga de evaluaciones con typeahead del catálogo. La ficha del
plantel del coach (`coach/players/[playerId].vue`) suma lo mismo para su plantel.

## 8. El bug que se arregla primero

No es deuda planificada: apareció revisando el autosave, y **pierde datos de un jugador hoy**.

`useDebouncedSave` expone `flush()`, con este comentario propio: *"`flush` fuerza el guardado
pendiente: sin eso, la última tecla escrita se pierde si el usuario cambia de pantalla antes de que
venza el delay."* **Nadie la llama** — es código muerto en los tres lugares que usan el composable,
los dos del coach (F2) y el del jugador (F3).

En el flujo del jugador el síntoma es peor que perder un dato:

1. El jugador escribe las reps del último ejercicio.
2. A los 200 ms toca "Completar día" → el `POST` cierra el día.
3. A los 800 ms vence el debounce → el `PUT` de la entry llega a un día **ya cerrado**.
4. La ruta responde **409** (`"Este día ya está cerrado"`).
5. El jugador ve un error en rojo **después** de haber completado el día, y esa serie no se guardó.

**El arreglo:** la pantalla del día hace `flush` de sus filas y lo **espera** antes de mandar el
`complete`. Va primero porque no depende de nada más de la fase.

## 9. Deuda que entra

| # | Deuda | Cómo se cierra |
|---|---|---|
| 1 | `flush` es código muerto | §8 |
| 2 | `pnpm lint` no existe | §2.5 |
| 3 | `SUPABASE_PROJECT_ID` sin documentar | Una línea en `packages/web/.env.example`. `pnpm gen:types` la necesita y no está en ningún lado |
| 4 | Los tipos generados viven en `packages/web/types/database.ts` | Mover a un paquete compartido permite tipar el cliente de Supabase de la API con `Database`, y eso **elimina `firstOf`** y todas las normalizaciones array-vs-objeto de `playerWeek.ts` |
| 5 | `sets` siempre entra como 1 desde el import | **Resuelto por presentación:** las series se muestran solo si son > 1 (`docs/DESIGN-SYSTEM.md` §7). El `1` inventado deja de verse y no hace falta abrir los `.xlsx` para decidirlo |
| 6 | El import descarta el nombre del bloque | §2.3 |

El ítem 4 es el más grande y el único candidato a cortarse si la fase se estira: es un refactor
transversal que no habilita ninguna pantalla. Se hace **temprano** justamente para que simplifique
todo lo que viene después, no tarde para que sea un riesgo.

## 10. Verificación

Escalonada a propósito, porque F2 y F3 dejaron documentado qué nivel agarra qué:

1. **Unit de dominio (Vitest)** — `evaluationTrend` con los cinco casos, `nextOneRmFrom` incluido el
   test viejo que **no** pisa, `weekProgress` con `total = 0`.
2. **Rutas con `app.request()`** — que el coach no cargue una evaluación de plantel ajeno (404), que
   un `perceivedRpe` fuera de 1–10 sea 400, que un `testedOn` futuro sea 400.
3. **`pnpm lint && pnpm typecheck && pnpm test`** — el gate de `CLAUDE.md` §5, y esta vez con el
   `lint` existiendo de verdad.
4. **`verify:setup`** — que el trigger de `0018` sincronice el 1RM al insertar una evaluación, y que
   **no** lo toque al insertar una con `tested_on` anterior. Mirando el dato, no el error.
5. **`smoke:player` extendido** — el dashboard y el día con sesión real. Es el único nivel que ve los
   strings de select anidados: no los ve el typecheck (son strings), no los ven los tests de
   `app.request()` (nunca llegan a PostgREST) ni `verify:setup` (habla con la base directo). En F2 un
   embed ambiguo devolvía 500 en **cualquier** request real y pasó los otros tres niveles.
6. **Click-through en browser** — incluye el pendiente de F3, que sigue sin hacerse.

**Click-through, lista concreta:**

1. El jugador entra y aterriza en `/player` con el ring y sus tendencias.
2. Un ejercicio en `PERCENTAGE` con 1RM cargado → **"80% → 112 kg"**; uno en `LABEL` → **"p.corp"**.
3. Cargar una evaluación de sentadilla más alta → **los kg de la rutina se recalculan**.
4. Cargar una con `tested_on` viejo → el 1RM **no** cambia.
5. Registrar en el slideover → "Guardando…" → "Guardado", y el contador de la lista se mueve.
6. Escribir reps y tocar "Completar día" **inmediatamente** → se guarda, **sin 409 en rojo** (§8).
7. RPE del día + comentario colapsado → "Completada", vista de lectura, "Reabrir" funciona.
8. Cambiar la contraseña → sigue logueado, y la nueva sirve para entrar de cero (pendiente de F3).
9. A 380 px, todo tocable sin zoom. Y **modo oscuro** en las tres pantallas.
10. Una pasada por el panel del coach para anotar qué quedó raro con la paleta nueva (§3).

## 11. Lo que no entra

- **Todo F4**: la vista de feedback del coach, el keepalive de UptimeRobot, el dominio propio.
- **Que el coach le resetee la contraseña a un jugador** — sigue siendo decisión previa de F4, con las
  tres opciones en `IMPLEMENTATION-F2.md` §5.5 B. Hoy el camino es `pnpm set:password`.
- **Rediseñar el panel del coach.** Se repinta por herencia del tema, no se rediseña (§3).
- **Navegar semanas anteriores** de la rutina. El histórico de *evaluaciones* sí entra.
- **El import transaccional** (el fix es una RPC `import_program(jsonb)`, o sea SQL que `CLAUDE.md` §3
  evita; el síntoma es benigno: el coach ve el resultado y reimporta).
- **Las hojas de aeróbico** (necesita decidir cómo se modelan `4 x 40 continuos` y `pausa: 45''`, que
  el modelo de bloques no representa: es una fase propia).
- **Drag & drop para reordenar** — deuda del panel del coach, y esta fase es del jugador. Cabe solo si
  sobra tiempo.
- **Push notifications, PWA, multi-deporte, tiempo real** — `CLAUDE.md` §2 los excluye.

## 12. Deuda que este diseño crea a sabiendas

- **La paleta repinta el panel del coach sin rediseñarlo** (§3).
- **F4 pierde granularidad de RPE**: pasa de un RPE por ejercicio a uno por día (§2.1).
- **Los programas ya importados no tienen nombre de bloque** hasta que se reimporten (§2.3).
- **Un test más bajo baja el 1RM y con él todos los kg prescritos** (§2.4). Es lo correcto para "el
  1RM vigente", y se puede corregir a mano.
- **`current_week_id` sigue siendo global al programa**, no por jugador: si el coach avanza la semana,
  el ring de todos se reinicia junto. Para un plantel que entrena junto está bien; la rueda de
  progreso lo vuelve visible, y se acepta a ojos abiertos.
- **Un cambio de puesto del jugador le cambia la rutina en silencio** (deuda de F3 §2.3, sin cambios).
- **"3/8 registrados" no es "3/8 hechos"** (deuda de F3 §2.1, sin cambios).

## 13. `CLAUDE.md` se actualiza en este PR

`CLAUDE.md` §5 obliga a que un cambio en §2 o §3 se documente en el mismo PR. Esta fase cambia cuatro
cosas:

| Sección | Qué cambia |
|---|---|
| §1 | El eje: el jugador es lector, el registro es opcional. Y el RPE percibido se pide una vez por día |
| §2 | **"compare de evaluaciones" sale de "fuera del MVP"** — está listado textualmente ahí |
| §3 | `blocks.name`, `session_logs.perceived_rpe`, y la relación nueva `evaluations` → `one_rms` |
| §6 | El roadmap: F3 cerrada y F3.5 agregada |

También hay que dejar de citar `pnpm lint` como inejecutable (§5) una vez que exista.
