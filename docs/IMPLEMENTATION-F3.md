# F3 — Qué se implementó, dónde y por qué

> Registro de la sesión del **2026-07-29** sobre la rama `feature/f3`. El plan ejecutado es
> `docs/superpowers/plans/2026-07-29-f3-player-panel.md`, escrito contra el stack vigente; el de
> 2026-07-27 queda como registro del stack descartado. Las decisiones de diseño están en
> `docs/superpowers/specs/2026-07-29-f3-player-panel-design.md`. La fuente de verdad de las decisiones
> transversales sigue siendo `CLAUDE.md`.

---

## 1. Resumen

El jugador ve su rutina con los kg calculados según su 1RM, con "última vez" al lado de cada ejercicio,
y registra peso, reps, RPE y la nota del día. El perfil administra puesto, medidas, 1RM, el canje del
código del entrenador y el cambio de la contraseña propia.

| | Estado |
|---|---|
| Dominio: `LABEL` en `calcLoad`, `lastPerf`, `buildPlayerDay` | ✅ 41 tests nuevos |
| Validadores: entry, nota del día, cambio de contraseña, `name` en el perfil | ✅ 23 tests nuevos |
| API: 8 endpoints bajo `/player/*` con guard por prefijo | ✅ 14 tests nuevos |
| Pantallas: Mi semana, Mi perfil, dos componentes | ✅ `Build complete` |
| Migración `0015` | ✅ aplicada y **verificada en vivo** |
| **`pnpm verify:setup`** | ✅ **80/80** |
| **`pnpm smoke:player`** (nuevo) | ✅ **22/22** |

Tests: **247 en core + 82 en api + 3 en web = 332** (el baseline antes de F3 era 254).

**Lo que NO está verificado**, a ojos abiertos: nadie miró las dos pantallas en un browser, y los
archivos `.vue` no los typecheckea nada (§5.2). Por eso el roadmap de `CLAUDE.md` §6 **no** marca F3
como completa todavía.

---

## 2. Decisiones de diseño

Las cuatro grandes las tomó el dueño del repo antes de escribir código (spec §3). Resumen operativo:

1. **No hay checkbox "hecho" por ejercicio.** `exercise_entries` no lleva columna `done`. El único
   cierre es "Completar día" (`session_logs.completed_at`, que ya existía). El progreso se **deriva**:
   una entry cuenta si tiene alguno de `weight`, `reps` o `rpe`. El badge dice **"3/8 registrados"**, no
   "3/8 hechos" — sin checkbox el jugador no afirmó nada, y el texto no debe prometer más que el dato.
2. **La misma regla decide dos cosas.** `hasData` resuelve el contador de progreso **y** si una entry es
   historial para `lastPerf`. Una sola definición de "esto se registró", exportada de `lastPerf.ts`.
3. **Jugador y coach editan los mismos campos del perfil**, gana el último que escribe. Sin reglas de
   precedencia y sin migración. Es un club: el coach está al lado del jugador.
4. **Se endurece la RLS de `session_logs`** (migración `0015`, §4.1). Es la única migración de la fase.

Dos decisiones más, tomadas al escribir el código:

5. **El historial se trae con dos queries simples, no con un embed anidado ingenioso.** Un string de
   select no lo ve el typecheck y solo lo agarra un request real (§5.1). A 40–60 jugadores dos requests
   son gratis (`CLAUDE.md` §2).
6. **`positionId` va en `Actor`, no en `SessionUser`.** La API lo necesita para resolver el programa; el
   contrato de la sesión de Nuxt no. Ver §4.2, que es el bug que esto evitó.

## 3. Mapa de archivos nuevos

```
supabase/migrations/
  0015_session_logs_day_scope.sql   # RLS de session_logs con el día scopeado

scripts/
  smoke-player.ts                   # smoke de la capa de acceso contra la base real

packages/core/src/
  domain/lastPerf.ts                # última vez + hasData (la regla compartida)
  domain/buildPlayerDay.ts          # compone carga, historial y lo registrado
  domain/calcLoad.ts                # MODIFICADO: cuarto modo LABEL
  validators/session.ts             # entry del ejercicio + nota del día
  validators/auth.ts                # MODIFICADO: changePasswordSchema
  validators/player.ts              # MODIFICADO: `name` editable
  access/rbac.ts                    # MODIFICADO: Actor lleva positionId

packages/api/src/
  access/embedded.ts                # firstOf: normaliza los embeds de PostgREST
  access/playerWeek.ts              # carga la semana y compone
  access/playerDay.ts               # assertOwnedDay + ensureSessionLog
  routes/player/week.ts             # GET semana, PUT entry, complete, reopen
  routes/player/profile.ts          # perfil, 1RM, canje del código
  middleware/auth.ts                # MODIFICADO: el actor trae position_id

packages/web/app/
  composables/usePlayerApi.ts
  composables/useAuth.ts            # MODIFICADO: changePassword
  components/player/{DayCard,ExerciseRow}.vue
  pages/player/week.vue             # reemplaza el placeholder de F1
  pages/player/profile.vue
```

## 4. Los problemas que valen la pena

### 4.1. `calcLoad` no soportaba `LABEL`, y eso ya estaba roto en producción

La migración `0013` agregó el cuarto modo de carga y el parser de planillas lo produce, pero
`calcLoad` **caía al `return` final y lo devolvía como `{ kind: 'none', label: 'Sin peso' }`**. F3 fue
la primera fase que leyó esa función desde la vista del jugador, así que hasta acá nadie lo notó.

No era teórico: según `IMPLEMENTATION-F2.md` §3.5, importar la hoja `14.15.16` generó **35 cargas con
etiqueta sobre 108 ejercicios**. Un tercio de lo que el jugador vería habría dicho "Sin peso" en vez de
`p.corp`, perdiendo justo la información que `0013` existe para preservar.

**La lección:** una migración que agrega un caso a un dominio no termina en el SQL. `0013` tocó la
tabla, el `CHECK`, el parser y los validadores —todo eso estaba— pero la función pura que **consume**
ese dato quedó afuera, y ningún test lo agarró porque no había ningún consumidor todavía.

### 4.2. La RLS de `session_logs` no scopeaba el día

`session_logs_write` (`0003`) era solo `player_id = auth.uid()`. Es correcto sobre **de quién** es el
log, y mudo sobre **contra qué** se registra: el `day_id` podía ser de cualquier día de cualquier
programa de cualquier coach.

Consecuencia concreta: un jugador que el coach reasignó seguía pudiendo escribir logs contra los días
del programa anterior. Y cualquier ruta futura que tocara `session_logs` sin pasar por `assertOwnedDay`
no habría encontrado ninguna red debajo.

Es la misma clase de agujero que las **tres pasadas de auditoría de F2** encontraron una y otra vez: un
guard que solo vive en el código. Se cerró en la base **además** de en la API (`CLAUDE.md` §4: la capa 1
es la única que un bug de aplicación no puede saltear).

Tres detalles del fix que importan:

- **Solo se endurece el `WITH CHECK`, no el `USING`.** El `USING` gobierna qué filas ves para modificar
  y borrar; dejarlo abierto a tus propios logs permite borrar los viejos y no bloquea un `DELETE`, que
  no evalúa `WITH CHECK`.
- **No aplica la trampa del `42501`** de `CLAUDE.md` §3. Esa muerde cuando un `UPDATE` saca la fila del
  alcance de su política de `SELECT`; acá `session_logs_select` no se toca, así que la fila resultante
  sigue visible para su dueño.
- **`revoke execute ... from public, anon`**, no solo `from anon`. Es la lección de
  `IMPLEMENTATION-F2.md` §4.2, donde la forma incompleta se copió tres veces.

**Cómo se verificó que funciona, no solo que se aplicó:** el check mira el **código de error**. Un
`23503` significaría que lo frenó la FK y el agujero seguiría abierto; **`42501` prueba que lo frenó la
política**. Los tres checks de `verify:setup` dan 42501 en los casos negativos y pasan en el legítimo.

**Efecto lateral aceptado:** si el coach reasigna al jugador, sus logs viejos quedan de solo lectura —
los sigue viendo, no los puede modificar. Es lo correcto.

### 4.3. El `Actor` no traía la posición, y eso habría matado tres de los cuatro niveles de prioridad

`withActor` seleccionaba `id, email, name, role, invite_code, coach_id`. Pero
`candidateAssignmentsFor` (F2) necesita el `positionId` para armar el `OR` sobre los cuatro destinos.

Sin él, el jugador solo habría visto programas asignados **a él individualmente**, y los otros tres
niveles —puesto, grupo system, grupo custom— habrían quedado **muertos en silencio**. Sin error, sin
excepción: simplemente una lista de candidatos incompleta y un "todavía no tenés programa" falso.

El `positionId` se agregó a `Actor` y no a `SessionUser` porque el frontend no lo usa: `SessionUser` es
el contrato de la sesión de Nuxt. El typecheck marcó el único fixture que construía un `Actor` literal.

### 4.4. Nada typecheckea los archivos `.vue`

Ver §5.2. Se descubrió al intentar verificar las pantallas de las tasks 9 y 10.

### 4.5. `ExerciseTypeahead` no hace lo que el plan asumía

El plan lo usaba como `<ExerciseTypeahead v-model="..." label="Ejercicio" />`. El componente real
**no trae el catálogo** (exige un prop `exercises`) y **no tiene prop `label`**. La página de perfil
ahora trae `/api/catalog/exercises` con `useAsyncData` y lo envuelve en un `UFormField`, igual que hacen
las pantallas del coach.

Se detectó leyendo el componente antes de usarlo, no en runtime — que es la única forma, porque el
typecheck de los `.vue` no existe (§5.2).

## 5. Deuda conocida

### 5.1. El smoke nuevo cubre la capa de acceso, no el browser

`pnpm smoke:player` (`scripts/smoke-player.ts`) maneja la capa de acceso con la **sesión real de un
jugador** —el mismo camino que producción: cliente con su JWT, RLS aplicada— y verifica los 22 checks
que incluyen `"80% → 112 kg"` y `"Semana 1 · Día 1: 112 kg · 5 reps · RPE 9"`.

Existe porque hay una clase de bug que nada más agarra: **los strings de select anidados**. No los ve el
typecheck (son strings), no los ven los 82 tests de `app.request()` (nunca llegan a PostgREST) ni
`verify:setup` (habla con la base directo, sin pasar por la capa de acceso). En F2 un embed ambiguo
entre `programs` y `weeks` devolvía 500 en **cualquier** request real y pasó los tres niveles
(`IMPLEMENTATION-F2.md` §4.3).

**Lo que el smoke NO cubre:** el render de Nuxt, los componentes, el autosave con debounce, el
re-login después de cambiar la contraseña, y que los inputs sean tocables a 380 px. Eso pide un
click-through en un browser, que **todavía no se hizo**.

### 5.2. Ni `nuxt typecheck` ni `nuxt build` chequean los `.vue`

Dos fallas que se suman y dejan el frontend sin ninguna red de tipos:

- **`nuxt typecheck` crashea y devuelve exit 0.** `vue-tsc` 2.2.12 tira
  `[Vue] Failed to create plugin` / `Load plugin failed: vue-router/volar/sfc-route-blocks`, imprime el
  stack, escribe `Done` y sale bien. **Causa raíz:** `vue-router` 4.6.4 dejó de publicar el directorio
  `volar/`, y `@vue/language-core` 2.2.12 lo sigue buscando. `2.2.12` es la última 2.x, así que el fix
  exige **vue-tsc 3.x** — un major.
- **`nuxt build` no typecheckea**: no hay bloque `typescript` en `nuxt.config.ts`, así que `typeCheck`
  es `false` y el build solo transpila. **Verificado empíricamente**: con
  `const x: number = "esto no es un number"` dentro de `profile.vue`, el build terminó con exit 0.

**Mitigación usada en esta fase**, por no dejar el código sin verificar: una sonda temporal en TS que
importaba los tipos del cliente generado y ejercitaba los 33 accesos exactos que usan los cuatro
archivos `.vue` (`day.loggedCount`, `exercise.load.kg`, `profile.oneRms[0].exerciseName`, …). Pasó
limpia y se borró. Cubre el riesgo real de esos archivos —referirse a un campo que el cliente generado
no tiene— pero **no** es un typecheck de los templates.

**Pendiente de decisión del dueño del repo:** bumpear a `vue-tsc` 3.x. Como los `.vue` nunca se
chequearon, encenderlo puede destapar errores preexistentes de F2 en cantidad desconocida.

### 5.3. `pnpm lint` no existe

El gate de `CLAUDE.md` §5 es `pnpm lint && pnpm typecheck && pnpm test`, pero el script del root hace
`pnpm -r lint` y **ningún package define `lint`**: falla con `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT` y exit 1.
Nunca fue ejecutable. Hay que resolverlo en un sentido (agregar ESLint) o en el otro (corregir §5).

### 5.4. Otras

- **`SUPABASE_PROJECT_ID` no está documentada.** `pnpm gen:types` la necesita y no aparece en
  `packages/web/.env.example` ni en ningún `.env`. Es el ref del proyecto.
- **La semana vigente sale de `programs.current_week_id`**, que es global al programa, no por jugador.
  Dos jugadores del mismo programa van siempre en la misma semana. Es lo que definió el modelo de F0 y
  alcanza para un plantel que entrena junto.
- **Un cambio de puesto del jugador le cambia la rutina en silencio** (decisión §2.3), sin aviso a
  nadie.
- **"3/8 registrados" no es "3/8 hechos"** (decisión §2.1). Si el club pide un check explícito, es una
  columna y un checkbox.
- **El jugador ve solo la semana vigente.** Navegar semanas anteriores no está en el MVP.
- **Sigue faltando el reordenamiento por drag&drop** (deuda de F2): la ruta y el helper `reindex`
  existen y están testeados, falta el gesto.
