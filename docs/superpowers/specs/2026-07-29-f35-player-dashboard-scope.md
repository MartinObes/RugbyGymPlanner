# F3.5 — Dashboard del jugador y limpieza de deuda: alcance

> ⚠ **SUPERADO por `2026-07-29-f35-player-dashboard-design.md`.** Las cinco decisiones abiertas de §6
> están resueltas ahí. Este archivo se conserva porque documenta el razonamiento y el triaje de deuda
> que llevó a esas decisiones; **no** es la fuente de verdad del alcance.

> Borrador de alcance escrito el **2026-07-29** a pedido del dueño del repo, después de terminar F3.
> **No es un plan todavía**: hay cinco decisiones abiertas (§6) que cambian materialmente el trabajo, y
> dos de ellas contradicen decisiones ya tomadas en `CLAUDE.md`. Se resuelven primero, después se
> escribe el plan.
>
> Estado de F3: implementada y verificada contra la base, falta el click-through
> (`docs/IMPLEMENTATION-F3.md`).

---

## 1. Por qué esta fase existe

F3 entregó el panel del jugador **como se había especificado desde F0**: una pantalla donde el jugador
registra lo que hizo, con el RPE percibido como dato central. Al verlo funcionando, el dueño del repo
pidió otra cosa:

> "La idea es simplificar al jugador, que ingrese lo menos posible. Que vea su rutina que le toca y qué
> peso tendría que usar, el jugador va y hace la rutina y después **si quiere** ingresa si usó más peso
> o no."

Eso es un **cambio de eje del producto**, no un ajuste de UI. F3 asume que el jugador es una fuente de
datos; F3.5 asume que el jugador es un **lector** de su rutina, y que el registro es opcional y
secundario. Todo lo demás de esta fase sale de ahí.

F3.5 se mete **entre F3 y F4** porque F4 (el loop de feedback del coach) está construido sobre datos que
esta fase vuelve opcionales. Ver el conflicto en §6.1 — hay que resolverlo antes de F4, no durante.

---

## 2. Los cinco pedidos

### 2.1. Dashboard inicial del jugador

**Pedido:** que el jugador no aterrice en "Mi semana" sino en un dashboard con (a) resumen de sus
evaluaciones de ejercicios, mostrando si va mejorando respecto de las previas, y (b) una rueda de
progreso tipo "2/3 rutinas hechas en la semana".

**¿Está en F4?** No. El roadmap de F4 dice *"vista coach con progreso '2/3 días'"* — es la vista **del
coach sobre sus jugadores**, no la del jugador sobre sí mismo. Y el plan de F4 menciona el compare de
evaluaciones solo para decir que la entidad existe y no tiene pantalla.

**⚠ Esto reabre una decisión de `CLAUDE.md` §2.** Esa sección lista, textualmente, entre lo que está
*"Fuera del MVP (deliberado, no olvidado)"*: **`compare de evaluaciones`**. El dueño del repo puede
reabrirlo —es su decisión—, pero `CLAUDE.md` §5 exige que si una decisión de §2 cambia, **se actualice
en el mismo PR**. Queda anotado como obligación de la fase.

**Lo que ya existe y no hay que construir:**

- La tabla **`evaluations`** está creada desde F0: `id, player_id, exercise_id, kg, tested_on, created_at`,
  con índice `(player_id, tested_on desc)` — justo el que necesita el histórico.
- Su RLS ya está escrita y **ya permite escribir al jugador y a su coach** (§2.5).
- `session_logs.completed_at` ya existe, y `playerWeekFor` ya devuelve `completedDayIds`: la rueda de
  progreso es `completados / días de la semana` con datos que ya viajan.

**Lo que falta:** cero código toca `evaluations` hoy — ni rutas, ni dominio, ni UI. Es greenfield.

**Lo nuevo a escribir:**

| Dónde | Qué |
|---|---|
| `packages/core/src/domain/evaluationTrend.ts` | Función **pura**: dada la lista de evaluaciones de un ejercicio ordenada por fecha, devuelve la última, la anterior, el delta en kg y en %, y la dirección (`up` / `down` / `flat` / `first`). Con tests. |
| `packages/core/src/domain/weekProgress.ts` | Pura: `{ completed, total, ratio }` para la rueda. |
| `packages/api/src/access/playerDashboard.ts` | Carga las evaluaciones del jugador agrupadas por ejercicio + el progreso de la semana. |
| `GET /player/dashboard` | Una ruta. |
| `packages/web/app/pages/player/index.vue` | La pantalla. Pasa a ser el `ROLE_HOME.PLAYER` (hoy es `/player/week`). |
| `components/player/{ProgressRing,EvaluationCard}.vue` | La rueda y las tarjetas de tendencia. |

**Decisión abierta:** qué significa exactamente "va mejorando" — ver §6.2.

### 2.2. "Mi semana" comprimida, un día por pantalla

**Pedido:** que las rutinas aparezcan comprimidas, que el jugador acceda a cada día por separado y
decida a cuál entrar.

Hoy `/player/week` renderiza **todos los días expandidos**, uno abajo del otro, con todos sus ejercicios
y sus inputs. En un plantel real eso son 3 días × ~12 ejercicios = una página larguísima en el celular.

**Estructura de rutas.** `CLAUDE.md` §5 tiene una regla que muerde acá: si existe `week.vue` **y** el
directorio `week/`, entonces `week.vue` pasa a ser el componente *padre* y sus hijos no se renderizan
hasta que incluya `<NuxtPage />`. Las dos vistas **no comparten encabezado ni estado** (una lista días,
la otra muestra uno), así que van **hermanas**:

```
pages/player/
  index.vue          # el dashboard (§2.1)
  week/index.vue     # la lista de días, comprimida
  week/[dayId].vue   # un día
```

La lista muestra por día: nombre, cuántos ejercicios tiene, y si está completado. El detalle es la
pantalla que hoy es `DayCard`, sin el resto de los días alrededor.

**Y el comentario deja de parecer obligatorio.** Aclaración importante: **ya es opcional** —
`dayNoteSchema` lo tiene `nullish`, la ruta acepta `null` y el botón no valida nada. Lo que está mal es
la **UI**: el textarea está pegado arriba de "Completar día", así que *se lee* como un paso previo
obligatorio. El arreglo es de presentación (colapsarlo detrás de un "Agregar un comentario", opcional y
explícito), no de contrato.

### 2.3. La rutina como se ve en el Excel

**Pedido:** que la rutina se vea como en los `.xlsx` — bloques y ejercicios claramente distinguidos, que
se vea claro qué ejercicio hay que hacer y cuántas reps, y las series cuando las haya. Que el peso que
usó el jugador se ingrese **al costado**, no en el centro.

Es el corazón del cambio de eje (§1). Hoy `ExerciseRow` pone, en columna: nombre → carga → RPE objetivo
→ última vez → **tres inputs (peso, reps, RPE)**. Los inputs ocupan la mitad vertical de cada fila, así
que la pantalla se lee como un formulario de 12 campos, no como una rutina.

**Lo que hay que invertir:** la carga prescrita y las reps son el contenido; el registro es un extra al
costado. En una fila: **`Press Banca — 4 × 5 — 112 kg`** como bloque legible, y a la derecha un control
chico para "usé otro peso". El bloque `CIRCUIT` con su rótulo de vueltas y una separación visual real,
como las secciones de la planilla.

**Un dato del schema que condiciona el diseño** (verificado, no asumido): **los bloques no tienen
nombre.** `blocks` es `(id, day_id, type, rounds, order_index)` y el parser no produce ninguno
(`parsedBlockSchema` no lo tiene), aunque la planilla **sí** los tiene en la columna B (`docs/IMPLEMENTATION-F2.md`
§3.5 lo documenta como "nombre del bloque"). O sea: **el import está descartando el nombre del bloque**.

Si querés que la rutina se vea "como el Excel", el nombre del bloque es justamente lo que la hace
legible ("Fuerza tren inferior", "C 1"). Eso es una migración (`blocks.name`), un cambio en el parser y
en el validador del import. **Decisión abierta, §6.3.**

### 2.4. El RPE deja de ser protagonista

**Pedido:** *"que en la rutina no esté RPE… por ahora no es muy importante (no lo sacaría)"*.

Se mantiene la columna y el schema; cambia el peso visual: el **RPE objetivo** del coach queda como dato
discreto de la fila, y el **RPE percibido** del jugador se mueve al control opcional del costado, junto
con el peso real.

**⚠ Esto contradice `CLAUDE.md` §1.** Ese archivo dice, textualmente:

> "Comparar RPE objetivo vs. percibido junto con la nota es **el dato clave del producto** para ajustar
> cargas."

Y F4 está definida sobre eso: *"vista coach con … RPE objetivo vs. percibido con notas"*. Si el RPE
percibido pasa a ser un campo opcional escondido al costado, F4 se construye sobre un dato que la
mayoría de los jugadores no va a llenar. **No es un problema de esta fase, es un problema de F4**, y hay
que resolverlo ahora — ver §6.1.

### 2.5. Evaluaciones: las cargan el jugador **y** el coach

**Pedido:** que los dos puedan ingresar evaluaciones de ejercicios, porque el coach convoca a los
jugadores a una instancia de testeo y así va más rápido.

**Buena noticia: no necesita ninguna migración.** `evaluations_write` (migración `0003`) ya es:

```sql
using (player_id = auth.uid() or public.is_my_player(player_id) or public.is_admin())
with check (player_id = auth.uid() or public.is_my_player(player_id) or public.is_admin())
```

El jugador escribe las suyas y el coach las de su plantel. Es la misma forma que `one_rms` adoptó en la
migración `0011`, y de hecho `evaluations` la tenía desde antes — `docs/IMPLEMENTATION-F2.md` §5 cuenta
que la inconsistencia era al revés: `one_rms` no dejaba al coach y `evaluations` sí.

**Lo que falta:** rutas (`POST /player/evaluations`, `POST /coach/players/{id}/evaluations`, más los GET),
un `evaluationSchema` en los validadores, y la UI en las dos puntas — la ficha del plantel del coach y
el perfil o el dashboard del jugador.

**La decisión de diseño que importa acá, y no es cosmética:** hoy `evaluations` y `one_rms` son **dos
tablas sin ninguna relación**. `CLAUDE.md` §3 las describe como "historial de tests" y "el 1RM vigente",
pero nada las conecta. Si el jugador carga una evaluación nueva de sentadilla y su 1RM **no** se
actualiza, los kg de su rutina siguen calculados con el valor viejo — y eso, desde la silla del jugador,
es un bug. Ver §6.4.

---

## 3. Deuda técnica: inventario y triaje

El pedido fue "arreglar toda deuda técnica que exista". Hay 13 ítems reales, y **no todos convienen en
la misma fase**: dos son cambios de modelo y uno es un refactor grande. Propuesta de triaje.

### 3.1. Entra en F3.5 — barata y molesta ya

| # | Deuda | Por qué ahora |
|---|---|---|
| 1 | **El `flush` del autosave es código muerto** | **Es un bug, no deuda.** Ver §4: pierde el último dato escrito y encima muestra un error rojo espurio. Está en el flujo central |
| 2 | **`pnpm lint` no existe** | `CLAUDE.md` §5 lo manda y nunca fue ejecutable. Ya está documentado como pendiente; F3.5 lo resuelve (agregar `@nuxt/eslint` o sacar el script) |
| 3 | **`SUPABASE_PROJECT_ID` sin documentar** | Una línea en `packages/web/.env.example`. `pnpm gen:types` la necesita y no está en ningún lado |
| 4 | **Los tipos generados viven en `packages/web/types/database.ts`** | Moverlos a un paquete compartido permite tipar el cliente de Supabase de la API con `Database`, y eso **elimina `firstOf`** y todas las normalizaciones array-vs-objeto de `playerWeek.ts`. Es la deuda que más código feo sostiene |
| 5 | **`sets` siempre entra como 1 desde el import** | Con las pantallas nuevas (§2.3) las series pasan a ser información visible, así que un `1` inventado se nota. Verificar si la columna `S` se usa en alguna hoja; si no, documentarlo donde el coach lo vea |

### 3.2. Depende de decisiones de esta fase

| # | Deuda | Relación |
|---|---|---|
| 6 | **El import descarta el nombre del bloque** | Lo destapa §2.3. Si la rutina tiene que verse como el Excel, el nombre es parte de eso → §6.3 |
| 7 | **`current_week_id` es global al programa, no por jugador** | La rueda "2/3 rutinas de la semana" (§2.1) lo vuelve visible: si el coach avanza la semana, el progreso de todos se reinicia junto. Para un plantel que entrena junto está bien; conviene decidirlo a ojos abiertos |
| 8 | **El jugador solo ve la semana vigente** | El dashboard con histórico de evaluaciones (§2.1) roza esto. Ver semanas anteriores sigue fuera del MVP, pero el histórico de **evaluaciones** entra |

### 3.3. Queda afuera, con motivo

| # | Deuda | Por qué no |
|---|---|---|
| 9 | **El import no es transaccional** | El fix es mover el árbol a una RPC `import_program(jsonb)`, o sea SQL que `CLAUDE.md` §3 evita a propósito. El síntoma es benigno: el coach ve el resultado y reimporta |
| 10 | **Las hojas de aeróbico no se importan** | Necesita decidir cómo se modelan `4 x 40 continuos` y `pausa: 45''`, que el modelo de bloques no representa. Es una fase propia |
| 11 | **La preview de impacto hace ~2 queries por jugador** | A 40–60 jugadores es gratis. `CLAUDE.md` §2: no optimizar prematuramente |
| 12 | **Un cambio de puesto le cambia la rutina en silencio** | Decisión tomada a ojos abiertos en F3 §2.3. Si molesta en la práctica, es una rama en `guard_profile_changes` |
| 13 | **No hay drag & drop para reordenar** | La ruta y `reindex` existen y están testeados; falta el gesto. Es del panel del **coach**, y esta fase es del jugador. Cabe si sobra tiempo |

> **Sobre "arreglar TODA la deuda":** los ítems 9 y 10 son fases en sí mismos y el 11 y 12 no son
> defectos sino decisiones. Meterlos acá haría que F3.5 nunca cierre. Si querés que igual entren, decilo
> y los muevo — pero conviene que sea explícito.

---

## 4. Un bug encontrado, que conviene arreglar primero

No es deuda planificada: apareció revisando el autosave.

`useDebouncedSave` expone `flush()`, con este comentario **propio**:

> *"`flush` fuerza el guardado pendiente: sin eso, la última tecla escrita se pierde si el usuario cambia
> de pantalla antes de que venza el delay."*

**Nadie la llama.** Es código muerto en los tres lugares que usan el composable — los dos del coach (F2)
y el del jugador (F3). Y en el flujo del jugador el síntoma es peor que perder un dato:

1. El jugador escribe las reps del último ejercicio
2. A los 200 ms toca **"Completar día"** → el `POST` cierra el día
3. A los 800 ms vence el debounce → el `PUT` de la entry llega a un día **ya cerrado**
4. La ruta responde **409** (`"Este día ya está cerrado"`)
5. El jugador ve un error en rojo **después** de haber completado el día, y esa serie no se guardó

El arreglo: `DayCard` hace `flush` de sus filas y lo **espera** antes de mandar el `complete`. Con las
pantallas nuevas de §2.2 y §2.3 el código de esa zona se toca igual, así que conviene hacerlo ahí.

---

## 5. Lo que NO entra en F3.5

- **Todo lo de F4**: la vista de feedback del coach, el keepalive de UptimeRobot, el dominio propio.
- **El reseteo de contraseña de un jugador por parte del coach** — sigue siendo decisión previa de F4
  (`docs/IMPLEMENTATION-F2.md` §5.5 B). Hoy el camino es `pnpm set:password`.
- **Push notifications, PWA, multi-deporte, tiempo real** — `CLAUDE.md` §2 los excluye y esta fase no los
  toca.
- **Navegar semanas anteriores** de la rutina (el histórico de *evaluaciones* sí entra, §2.1).

---

## 6. Decisiones abiertas — hay que resolverlas antes del plan

### 6.1. Si el RPE percibido deja de ser protagonista, ¿sobre qué se construye F4?

`CLAUDE.md` §1 dice que comparar RPE objetivo vs. percibido es **el dato clave del producto**, y F4 es
exactamente esa pantalla. §2.4 lo vuelve un campo opcional al costado.

Las opciones, como las veo:

- **(a) F4 se reorienta al peso real vs. prescrito.** El jugador sí va a cargar "pedía 60, usé 70" —
  eso es concreto y no pide introspección. El RPE queda como dato extra cuando aparece. Implica
  reescribir el objetivo de F4 y actualizar §1.
- **(b) El RPE se mantiene como el dato central pero se pide una sola vez por día**, no por ejercicio.
  Un solo control al cerrar el día ("¿cómo te fue?" con una escala) es un toque, no doce. Conserva la
  premisa de §1 con una fracción del esfuerzo del jugador.
- **(c) Se deja como está en F3** y solo se cambia la disposición visual.

Mi recomendación es **(b)**: preserva el diferencial que `CLAUDE.md` §1 define sin pedirle al jugador
doce decisiones, y encaja con "que ingrese lo menos posible". Pero es tu llamada.

### 6.2. ¿Qué significa "va mejorando"?

Para mostrar tendencia hace falta definir contra qué se compara:

- **Última vs. anterior** — simple, ruidoso: un mal día se lee como retroceso.
- **Última vs. la mejor histórica** — muestra récord personal, no tendencia.
- **Última vs. la de hace N semanas** — más justo, necesita elegir N.

Y qué se muestra: ¿kg absolutos (`+5 kg`), porcentaje (`+4%`), o solo una flecha?

### 6.3. ¿Se rescata el nombre del bloque?

Para que la rutina se vea "como el Excel" (§2.3) probablemente sí. Cuesta: una migración
(`blocks.name`), el parser, el validador del import, y **reimportar** las planillas para que los nombres
existan en los programas ya cargados.

### 6.4. Cuando se carga una evaluación, ¿se actualiza el 1RM?

Hoy `evaluations` y `one_rms` no están relacionadas. Opciones:

- **(a) La evaluación actualiza `one_rms` automáticamente** (la evaluación es el evento, el 1RM es la
  proyección). Es lo que espera cualquiera que cargue un test nuevo: que su rutina recalcule.
- **(b) Quedan separadas y el 1RM se edita a mano.** Más control, pero el jugador que carga una
  evaluación y ve sus kg sin cambiar va a pensar que se rompió.
- **(c) `one_rms` se elimina y el 1RM vigente se **deriva** de la última evaluación.** Es el modelo más
  limpio —una sola fuente de verdad— pero es una migración con backfill y toca `rmFor`, `calcLoad` y el
  perfil.

Mi recomendación es **(a)** para F3.5: conserva el schema, arregla la incoherencia percibida, y deja la
puerta abierta a (c) más adelante.

### 6.5. ¿`pnpm lint` se agrega o se saca?

Agregar `@nuxt/eslint` trae config flat sin ceremonia, pero va a destapar ruido de estilo en `core` y
`api` también. Sacarlo del root es una línea. Con el criterio de "mejor destapar para corregir",
supongo que lo querés agregar — pero conviene contar los hallazgos antes de comprometerse, igual que se
hizo con `vue-tsc`.

---

## 7. Orden sugerido, una vez resueltas las decisiones

1. **El bug del `flush`** (§4) — es lo único que hoy pierde datos de un jugador.
2. **Deuda 3.1** — arrancar por mover los tipos generados (#4), porque simplifica todo lo que sigue.
3. **Dominio puro nuevo**: `evaluationTrend`, `weekProgress`, con tests. Sin base, sin UI.
4. **Rutas**: evaluaciones (las dos puntas) y `GET /player/dashboard`.
5. **Reestructurar las pantallas del jugador**: `index.vue` (dashboard), `week/index.vue` (lista),
   `week/[dayId].vue` (el día con la rutina rediseñada).
6. **Cierre**: `verify:setup` con los checks nuevos, `smoke:player` extendido, `IMPLEMENTATION-F3.5.md`,
   y **actualizar `CLAUDE.md` §1, §2 y §6** con lo que cambió.

> El paso 6 no es burocracia: §1 define el eje del producto y §2 excluye el compare de evaluaciones.
> Esta fase cambia las dos cosas, y `CLAUDE.md` §5 obliga a que se actualicen en el mismo PR.
