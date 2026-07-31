# F3 — Panel del jugador: diseño validado

> Spec acordado con el dueño del repo el **2026-07-29**. Reemplaza la parte de arquitectura de
> `docs/superpowers/plans/2026-07-27-f3-player-panel.md`, que se escribió contra el stack descartado
> (DynamoDB + ElectroDB) y él mismo pide regenerarse. La parte de *producto* de ese plan —pantallas,
> flujos, textos, criterios de aceptación— sigue vigente y se recoge acá.
>
> La fuente de verdad de las decisiones transversales sigue siendo `CLAUDE.md`.

---

## 1. El problema

El roadmap marca F2 completa y F3 sin empezar. El síntoma reportado fue *"las rutinas asignadas no se
muestran"*, y la causa no es de datos:

`packages/web/app/pages/player/week.vue` tiene el texto **hardcodeado**:

```
Todavía no tenés un programa asignado. Cuando tu entrenador te asigne uno, lo vas a ver acá.
```

No consulta nada. Tampoco existen las rutas `/player/*` en la API, ni `lastPerf`, ni `buildPlayerDay`.
El coach ya puede armar, importar y asignar programas (F2), pero **el otro extremo del loop de
producto no está construido**.

## 2. Objetivo

Que el jugador vea su rutina con **los kg ya calculados según su 1RM personal** ("80% → 112 kg"), con
"última vez" al lado de cada ejercicio, y que registre peso real, reps, RPE percibido y nota del día,
cerrando el día cuando termina. Más el perfil que hace posible ese cálculo (puesto, medidas, 1RM) y el
cambio de contraseña propia.

Comparar **RPE objetivo vs. percibido** junto con la nota es el dato clave del producto (`CLAUDE.md`
§1). F3 lo produce; F4 lo muestra al coach.

## 3. Decisiones tomadas en este spec

Cuatro decisiones del dueño del repo, con su razón. Las tres primeras cierran deuda que F2 dejó
anotada.

### 3.1. No hay checkbox "hecho" por ejercicio

`exercise_entries` no tiene columna `done` y **no se agrega**. El único cierre es el botón "Completar
día", que sella `session_logs.completed_at` (columna que ya existe).

El progreso del día se **deriva**: una entry cuenta como registrada si tiene alguno de `weight`,
`reps` o `rpe` no nulo. El badge lee **"3/8 registrados"**, no "3/8 hechos" — sin checkbox no hay nada
que el jugador haya afirmado, y el texto no debe prometer más de lo que el dato dice.

**Consecuencia de diseño:** esa misma regla ("tiene algún dato") decide si una entry es historial para
`lastPerf`. Una sola definición de "esto se registró", en un solo lugar.

**Lo que se descartó:** una columna `done` explícita. Habría sido más precisa, pero agrega schema y una
interacción más en la pantalla que el jugador usa parado en el gimnasio.

### 3.2. El jugador y el coach editan los mismos campos; el último que escribe gana

`name`, `positionId`, `heightCm` y `weightKg` los edita tanto el jugador (desde su perfil) como su
coach (desde la ficha del plantel). Sin reglas de precedencia y sin migración.

La razón es el contexto de uso: es un club, el coach está al lado del jugador y una discrepancia se
arregla hablando. Lo que **no** cambia es lo que ya está blindado por `guard_profile_changes`:
`role`, `invite_code`, `coach_id`, `email` e `id` siguen inmutables desde la tabla.

> **Corrección a `docs/IMPLEMENTATION-F2.md` §6.** Ese documento afirma que "un coach puede editar
> `name`, `position_id`, `height_cm` y `weight_kg` de sus jugadores". Es inexacto: `playerProfileSchema`
> **no incluye `name`**, así que hoy el nombre no lo edita nadie después del signup. Esta decisión lo
> agrega al schema compartido, y con eso la afirmación pasa a ser verdadera para los dos roles.

**Riesgo aceptado explícitamente:** `positionId` es lo que enruta el programa (la resolución de
assignments de `CLAUDE.md` §3 scopea por puesto). Un jugador que se cambia de `wing` a `primera-linea`
se cambia la rutina entera, y nadie recibe un aviso. Se acepta a ojos abiertos; si molesta en la
práctica, el fix es una rama en `guard_profile_changes`.

### 3.3. F3 se entrega completa, en commits chicos verificables

Dominio → rutas → "Mi semana" → perfil → contraseña → cierre. No se corta en "solo ver": "Mi semana"
sin el perfil deja al jugador sin poder cargar sus 1RM, o sea sin los kg calculados, que es el
diferencial del producto (`CLAUDE.md` §1).

### 3.4. Se endurece la RLS de `session_logs` (migración 0015)

**Hallazgo de este diseño:** `session_logs_write` (migración `0003`) es solo:

```sql
using (player_id = auth.uid()) with check (player_id = auth.uid())
```

La base **no verifica que `day_id` sea de un programa que le llegue al jugador**. Un jugador
reasignado a otro programa sigue pudiendo escribir logs contra los días del anterior, y una ruta futura
que escriba `session_logs` sin pasar por el guard de la API no encontraría ninguna red debajo.

Es la misma clase de agujero que las **tres pasadas de auditoría de F2** encontraron una y otra vez: un
guard que solo vive en el código. `CLAUDE.md` §4 es explícito en que la capa 1 es la única que un bug
de aplicación no puede saltear, así que se cierra en la base **además** de en la API.

## 4. Arquitectura

### 4.1. Dominio — funciones puras (`packages/core/src/domain/`)

Sin Supabase, sin Hono, sin Vue, sin `process.env`. Es lo que se testea primero (`CLAUDE.md` §5).

#### `calcLoad` gana el cuarto modo `LABEL` — corrige un gap real

Hoy `LoadType` es `'WEIGHT' | 'PERCENTAGE' | 'NONE'` y un ejercicio con `loadType='LABEL'` **cae al
`return` final y sale como `{ kind:'none', label:'Sin peso' }`**.

No es teórico. Según `docs/IMPLEMENTATION-F2.md` §3.5, importar la hoja `14.15.16` produjo **35 cargas
con etiqueta sobre 108 ejercicios**: un tercio de lo que el jugador vería diría "Sin peso" en vez de
`p.corp`, perdiendo justo la información que la migración `0013` se creó para preservar.

```ts
export type LoadType = 'WEIGHT' | 'PERCENTAGE' | 'NONE' | 'LABEL'

export type LoadSpec = {
  loadType: LoadType
  weight?: number | null
  percentage?: number | null
  loadLabel?: string | null
}

export type LoadResult =
  | { kind: 'weight';      kg: number; label: string }
  | { kind: 'percentage';  kg: number; percentage: number; label: string }
  | { kind: 'missing-1rm'; percentage: number; exerciseName: string; label: string }
  | { kind: 'label';       label: string }
  | { kind: 'none';        label: string }
```

`LABEL` con `loadLabel` no nulo → `{ kind:'label', label: loadLabel }`. Si `loadLabel` viniera null
—el `CHECK` de `0013` lo impide, pero la función es defensiva— cae a `none`.

**La etiqueta se muestra cruda** (`p.corp`, `barra`, `goma`, `m.band`, `med 9`). Son las abreviaturas
que los jugadores ya leen en las planillas impresas de hoy; expandirlas exigiría inventar un
diccionario y adivinar.

#### `lastPerf.ts` (nuevo)

Dos funciones: `lastPerf(history, exerciseName)` busca el registro más reciente por `normalizedName`
(reusando `normName`), y `formatLastPerf(record)` arma la línea
`"Semana 2 · Día 1: 105 kg · 5 reps · RPE 8"`, omitiendo las partes que no se registraron.

Dos precisiones que el modelo relacional permite mejorar respecto del plan viejo:

- **El día actual se excluye por `dayId`, no comparando nombres.** El plan viejo filtraba por
  `weekName === ... && dayName === ...`. Los ids son exactos y no se repiten; los nombres los escribe
  el coach y puede haber dos "Día 1".
- **`performedAt` = `completed_at ?? updated_at`** del `session_log`. Un día registrado y todavía no
  cerrado igual es "la última vez que lo hiciste".

`weekName` y `dayName` viajan dentro de `PerfRecord`: los llena la capa de acceso desde el join, así la
función se mantiene pura. No se desnormalizan en la tabla (el plan viejo lo hacía porque DynamoDB no
tenía join).

#### `buildPlayerDay.ts` (nuevo)

Compone `calcLoad` + `rmFor` + `lastPerf` + lo ya registrado en la forma exacta que renderiza la vista.
Es la pieza que hace que la ruta de la API sea solo carga de datos.

```ts
export type LoggedEntry = {
  blockExerciseId: string
  weight: number | null
  reps: number | null
  rpe: number | null
}
```

Sin `done` (§3.1). Devuelve por día: los bloques con sus ejercicios resueltos (`load`,
`lastPerfLabel`, `entry`), `missingOneRms` deduplicado por `normName` para el banner ámbar,
`loggedCount` y `totalCount`.

Los bloques conservan `type` y `rounds` para que un `CIRCUIT` se rotule "Circuito · 3 vueltas".

**Todo se ordena por `order_index` explícito**, nunca por el orden en que vuelven las filas
(`CLAUDE.md` §3).

#### `validators/session.ts` (nuevo)

Espeja los `CHECK` de la base, que es la regla de `CLAUDE.md` §5 (Zod da el mensaje lindo, la base da
la garantía):

| Campo | Columna | Zod |
|---|---|---|
| `weight` | `numeric(5,1) check (weight >= 0)` | `number` ≥ 0, un decimal, tope de cordura 500 |
| `reps` | `smallint check (reps >= 0)` | entero 0–999 |
| `rpe` | `numeric(3,1) check (rpe between 1 and 10)` | 1–10 en pasos de 0.5 |
| nota | `text` | trim, máx. 1000 |

Los tres campos de la entry son nullish, y **los tres en null es válido**: significa "borrá la fila".
El plan viejo modelaba `rpe` como entero; la columna admite un decimal y el schema lo espeja.

#### `validators/auth.ts` += `changePasswordSchema`

Contraseña actual, nueva (mínimo 8, reusando la regla de `registerSchema`) y confirmación, con un
`superRefine` que exija que las dos nuevas coincidan y que la nueva sea distinta de la actual. Tal como
lo especifica `docs/IMPLEMENTATION-F2.md` §5.5 A.

### 4.2. Migración `0015` — RLS de `session_logs` con el día scopeado

Cierra §3.4. Un helper `program_of_day(uuid)` y el `WITH CHECK` que lo usa:

```sql
create or replace function public.program_of_day(d uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select w.program_id
  from public.days dd
  join public.weeks w on w.id = dd.week_id
  where dd.id = d
$$;

revoke execute on function public.program_of_day(uuid) from public, anon;
grant  execute on function public.program_of_day(uuid) to authenticated;

drop policy session_logs_write on public.session_logs;

create policy session_logs_write on public.session_logs for all to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid() and public.can_read_program(public.program_of_day(day_id)));
```

Cuatro cosas verificadas antes de escribir esto:

1. **`revoke ... from public, anon`, no solo `from anon`.** Es la lección de
   `docs/IMPLEMENTATION-F2.md` §4.2: Postgres otorga `EXECUTE` a `PUBLIC` al crear una función, y
   revocar solo a `anon` deja ese grant en pie. La forma incompleta ya se copió tres veces en este
   repo.
2. **No aplica la trampa del `42501`** (`CLAUDE.md` §3). Esa trampa muerde cuando un `UPDATE` saca la
   fila del alcance de su política de `SELECT`. Acá `session_logs_select` **no se toca**, así que la
   fila resultante sigue visible para su dueño.
3. **`exercise_entries` hereda el guard.** Su política de escritura ya exige que el `session_log_id`
   sea de un log propio, y ese log ahora está scopeado por día. No hace falta tocarla.
4. **El `using` no se endurece, solo el `with check`.** Así un jugador puede borrar sus propios logs
   viejos, y un `DELETE` (que no evalúa `WITH CHECK`) no queda bloqueado.

**Efecto lateral aceptado:** si el coach reasigna al jugador a otro programa, sus logs viejos quedan de
**solo lectura** — los sigue viendo (`session_logs_select` no cambió), no los puede modificar. Es lo
correcto: editar el registro de un programa que ya no te alcanza no es un caso de uso real.

**Qué expone `program_of_day`:** dado el uuid de un día, devuelve el uuid de su programa. Ambos son
uuids opacos y no revelan datos de negocio; es `security definer` para que la política no dependa de
que el actor pueda leer `days`.

### 4.3. API (`packages/api/src/`)

Todas las rutas cuelgan de `/player/*`, que **ya tiene `requireRole(['PLAYER'])` desde F1**:
`packages/api/src/app.ts` dice literalmente *"`/player/*` queda guardado desde ya aunque sus rutas
lleguen en F3"*. Es la capa 2 de `CLAUDE.md` §4 funcionando como se diseñó.

Un ADMIN no tiene perfil de jugador, así que no se lo incluye: no es un olvido.

#### `access/playerWeek.ts` — la composición

1. `activeProgramIdFor(db, player)` (helper de F2). Null → `{ week: null }` y la pantalla muestra el
   estado vacío.
2. Programa + semanas. **Con `weeks!weeks_program_id_fkey`**: es la trampa de
   `docs/IMPLEMENTATION-F2.md` §4.3 — hay dos caminos FK entre `programs` y `weeks`
   (`weeks.program_id` y `programs.current_week_id`) y PostgREST devuelve 500 si no se desambigua.
3. Semana vigente: `current_week_id`, o la de `order_index` más bajo si no está seteado.
4. El árbol en un select anidado: `days(*, blocks(*, block_exercises(*, exercises(...))))`, ordenado
   por `order_index` en cada nivel.
5. Los 1RM del jugador con `exercises(normalized_name)`.
6. El historial para `lastPerf`.
7. `buildPlayerDay` por cada día.

**El historial se trae con dos queries simples, no con una anidada ingeniosa.** Una: los `session_logs`
del jugador con el nombre de su día y su semana. Otra: las `exercise_entries` de esos logs con el
`normalized_name` del ejercicio. La razón es la lección de §4.3: un string de select no lo ve el
typecheck y solo lo agarra un smoke con sesión real. A 40–60 jugadores dos requests son gratis
(`CLAUDE.md` §2: no optimizar prematuramente).

#### `access/playerDay.ts` — `assertOwnedDay`

El guard que sostiene toda escritura. Verifica que el día pertenezca al **programa vigente** del
jugador y —cuando se pasa— que el `blockExerciseId` viva en **ese** día. Recurso ajeno → **404, nunca
403** (`CLAUDE.md` §4 capa 4: no revelar existencia).

Con `0015` la base ya lo respalda, pero el guard sigue siendo necesario: da el status correcto en vez
de un error de RLS que llegaría como 500 poco informativo. Es el mismo patrón que la ruta del 1RM del
coach ya usa.

#### `routes/player/week.ts`

| Método | Path | Comportamiento |
|---|---|---|
| GET | `/player/week` | `playerWeekFor(actor)`; sin programa → 200 con `{ week: null }` |
| PUT | `/player/days/{dayId}/entries/{blockExerciseId}` | `assertOwnedDay` + upsert; los tres campos null → borra la fila; **409** si el día está cerrado |
| POST | `/player/days/{dayId}/complete` | nota + sella `completed_at` |
| POST | `/player/days/{dayId}/reopen` | limpia `completed_at` |

Ninguna ruta acepta un `playerId` del cliente: siempre es `actor.id`.

Las rutas de hijos **no repiten el `programId`** — misma decisión que F2 (decisión #2 de
`IMPLEMENTATION-F2.md`): un uuid identifica la fila y RLS sube el árbol solo.

#### `routes/player/profile.ts`

| Método | Path | Comportamiento |
|---|---|---|
| GET | `/player/profile` | su perfil + nombre de su coach + sus 1RM |
| PATCH | `/player/profile` | `playerProfileSchema` (con `name` agregado, §3.2) |
| PUT | `/player/one-rms` | `oneRmSchema` de F2 tal cual — ya toma `exerciseId` |
| DELETE | `/player/one-rms/{exerciseId}` | |
| POST | `/player/redeem-invite` | RPC `redeem_invite_code` |

Dos notas que salen de código existente:

- **El jugador elige del catálogo; no crea ejercicios.** `ensure_exercise` (migraciones `0012`/`0014`)
  **rechaza a PLAYER a propósito**: *"un jugador no tiene por qué tocar el catálogo global"*. El
  typeahead del 1RM lista `/catalog/exercises` y manda un `exerciseId`. Que `oneRmSchema` ya tome
  `exerciseId` en vez de un nombre hace que se reuse sin cambios.
- **`redeem_invite_code` ya existe** (migración `0005`) y su comentario dice *"F3 la consume desde la
  pantalla de perfil del jugador sin vincular"*. Es el único camino para vincularse a un coach; el
  `coach_id` nunca llega por un PATCH.

`one_rms_write` ya permite `player_id = auth.uid()` desde `0003`, así que el jugador escribe sus 1RM
sin cambios de RLS.

#### Tests de rutas (prioridad 2 de `CLAUDE.md` §5)

- `PUT` de una entry con un `dayId` de otro programa → 404.
- `PUT` con un `blockExerciseId` que no está en ese día → 404.
- `PUT` con el día cerrado → 409.
- `PATCH /player/profile` con `{"role":"ADMIN"}` o `{"coachId":"otro"}` → esos campos no cambian.
- `POST /player/redeem-invite` con un código inexistente → error, y el `coach_id` no cambia.

### 4.4. Web (`packages/web/app/`)

- **`composables/usePlayerApi.ts`** — misma forma que `useCoachApi`, incluido el reenvío explícito de
  la cookie en SSR con `useRequestHeaders(['cookie'])` y el desempaquetado del `{ ok:false, error }`
  para que el componente muestre el mensaje del contrato y no "fetch failed".
- **`pages/player/week.vue`** — reemplaza el placeholder. Encabezado con programa y semana; banner
  **ámbar** si `missingOneRms` no está vacío ("Faltan tus 1RM de X, Y. Cargalos en Mi perfil para ver
  los kg de cada serie", con link a `/player/profile`); los días debajo.
- **`components/player/DayCard.vue`** — nombre del día, badge "3/8 registrados", badge "Completado" si
  corresponde, bloques (un `CIRCUIT` se rotula "Circuito · N vueltas"), textarea "¿Cómo te fue hoy?" y
  botón "Completar día" / "Reabrir".
- **`components/player/PlayerExerciseRow.vue`** — **el orden importa porque se lee parado entre
  series**:
  1. Nombre + `sets × reps`
  2. **La carga, grande y semibold** — es lo que vino a buscar. Ámbar si `kind === 'missing-1rm'`.
  3. Badge "RPE objetivo 8" si `targetRpe` no es null
  4. "Última vez", en texto chico
  5. Inputs: peso (step 0.5), reps, RPE, con autosave por `useDebouncedSave` (F2)

  Los inputs arrancan con `entry` si existe; si no, el peso se **prellena con `load.kg`** cuando el
  `kind` es `weight` o `percentage`, y el jugador solo lo cambia si levantó otra cosa. `LABEL` y `NONE`
  no prellenan nada. Día cerrado → todo `disabled`.
- **`pages/player/profile.vue`** — puesto, altura, peso, nombre; tabla de 1RM con `ExerciseTypeahead`
  (reusa el componente de F2); canje de invite code si no tiene coach; y el formulario de cambio de
  contraseña. Copy propio: "Mi puesto", "Mis 1RM", y la línea de ayuda *"Tus 1RM son lo que convierte
  los porcentajes del programa en kilos concretos."*
- **`useAuth.changePassword`** — el código de `IMPLEMENTATION-F2.md` §5.5 A: re-autentica con
  `signInWithPassword` (Supabase no pide la actual en `updateUser`) y después `updateUser`. **Ojo con
  el re-login:** emite una sesión nueva y pisa la cookie actual, así que el click-through tiene que
  confirmar que el usuario sigue logueado y no termina en `/login`.
- **`AppSidebar`** — suma `{ to:'/player/profile', label:'Mi perfil', icon:'i-lucide-user' }`.
  `lucide:user` ya está en `clientBundle.icons`, así que `tests/icons.test.ts` sigue verde; cualquier
  icono nuevo va a esa lista o el test falla (y en producción el icono no se vería).

**Mobile-first, no como adorno:** el jugador entra del celular en el gimnasio. El sidebar ya tiene
barra inferior en mobile; los inputs tienen que ser tocables a 380 px sin zoom.

## 5. Verificación

Escalonada a propósito, porque F2 dejó documentado qué nivel agarra qué:

1. **Unit de dominio (Vitest)** — `calcLoad` con los cuatro modos, `lastPerf`, `buildPlayerDay`,
   `validators/session`, `changePasswordSchema`.
2. **Rutas con `app.request()`** — el scoping de §4.3. No llega a PostgREST: por diseño no ve los
   errores de select.
3. **`pnpm lint && pnpm typecheck && pnpm test`** — el gate de `CLAUDE.md` §5 antes de cerrar.
4. **Checks en `verify-setup.mjs`** — el cambio de contraseña: con la actual correcta funciona; con la
   incorrecta falla **y la contraseña no cambia** (mirando el dato, no el error: `signInWithPassword`
   con la vieja tiene que seguir andando). Más un check de que la RLS de `0015` rechaza un `day_id`
   ajeno.
5. **Smoke contra el dev server con sesión real** — **no opcional.** Es el único nivel donde el seam
   Nuxt → Hono → PostgREST se ejercita completo, y es el que agarró el bug de los dos FK
   (`IMPLEMENTATION-F2.md` §4.3) que los 57 tests de API, el typecheck y `verify:setup` **no vieron**.
   F3 mete varios selects anidados nuevos, así que el riesgo es el mismo.

**Click-through del loop completo**, con un programa importado real:

1. `/player/week` como jugador → la semana con sus días.
2. Un ejercicio en `PERCENTAGE` con el 1RM cargado → **"80% → 112 kg"**.
3. Un ejercicio en `LABEL` → **"p.corp"**, no "Sin peso".
4. Borrar el 1RM → banner ámbar y "80% — falta tu 1RM de X".
5. Registrar peso/reps/RPE → el badge de progreso se mueve sin recargar.
6. Nota + "Completar día" → badge "Completado", inputs deshabilitados.
7. Pasar a la semana siguiente desde el coach → aparece "Semana 1 · Día 1: 112 kg · 5 reps · RPE 9"
   como última vez.
8. Cambiar la contraseña → sigue logueado, y la nueva sirve para entrar de cero.
9. A 380 px de ancho, todo tocable sin zoom.

## 6. Fuera de alcance

- **La vista del coach del feedback** (progreso "2/3 días", RPE objetivo vs. percibido con notas) es
  **F4**. F3 produce el dato; F4 lo muestra.
- **`rpeDelta`** se escribe en F4, donde se usa.
- **Que el coach le resetee la contraseña a un jugador** es F4 y tiene una decisión abierta previa: las
  tres opciones y sus riesgos están en `IMPLEMENTATION-F2.md` §5.5 B. Hoy el camino es
  `pnpm set:password`.
- **Drag & drop para reordenar** sigue siendo deuda de F2 (la ruta y el helper `reindex` existen y
  están testeados; falta el gesto).
- **Historial de semanas anteriores** para el jugador: ve la semana vigente. Navegar el historial no
  está en el MVP.
- **Evaluaciones** siguen sin UI, como define `CLAUDE.md` §3.

## 7. Deuda que este diseño crea a sabiendas

- **Un cambio de puesto del jugador le cambia la rutina en silencio** (§3.2), sin aviso a nadie.
- **"3/8 registrados" no es "3/8 hechos"** (§3.1). Si el club pide un check explícito, es una columna y
  un checkbox.
- **Reasignar a un jugador vuelve sus logs viejos de solo lectura** (§4.2). Los ve, no los edita.
- **La semana vigente sale de `programs.current_week_id`**, que es global al programa y no por jugador.
  Dos jugadores del mismo programa van siempre en la misma semana. Es lo que el modelo de F0 definió y
  alcanza para un plantel que entrena junto.
