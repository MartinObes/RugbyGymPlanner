# Handoff — arrancar la implementación de F3

> Escrito el **2026-07-29** al final de la sesión que planificó F3, para que un chat nuevo pueda
> empezar a implementar sin re-descubrir nada. Todo lo de acá está verificado contra el código, no
> asumido.
>
> **Este documento no reemplaza a `CLAUDE.md`** (que sigue siendo la fuente de verdad de las
> decisiones) ni al plan. Es el pegamento: qué está hecho, qué se decidió, y qué te va a morder.

---

## 1. Qué hacer en este chat

En este orden:

1. Leer **`CLAUDE.md`** completo. Es obligatorio y lo dice su propio §7.
2. Leer este archivo.
3. Leer el spec aprobado: **`docs/superpowers/specs/2026-07-29-f3-player-panel-design.md`**.
4. Ejecutar el plan: **`docs/superpowers/plans/2026-07-29-f3-player-panel.md`**, task por task, con
   `superpowers:subagent-driven-development` o `superpowers:executing-plans`.

El plan tiene **11 tasks con el código completo en cada paso**. No hay placeholders: si un paso pide
código, el código está escrito. Si algo no cierra contra el repo real, **el repo manda** — verificalo y
corregí el plan, no lo sigas a ciegas.

**No leas `docs/superpowers/plans/2026-07-27-f3-player-panel.md`.** Está escrito contra DynamoDB +
ElectroDB (stack descartado) y su arquitectura es toda inválida. Su parte de producto ya está recogida
en el spec nuevo.

**Empezá por la Task 1**, que arregla lo único que ya está roto en producción hoy (ver §5.1).

---

## 2. Estado del repo

| | |
|---|---|
| Rama de trabajo | **`feature/f3`** (creada desde `feature/f2`) |
| Commits en `feature/f3` sobre `main` | 2, los dos de documentación: el spec y el plan |
| `main` | **F2 ya está mergeada** (merge commit `da170e0`, con `--no-ff` para seguir la convención de F1) |
| `origin/main` | **`main` está 29 commits adelante y NO se pusheó.** Queda a criterio del dueño |
| Working tree | limpio |
| Roadmap | F0, F1, F2 completas. **F3 es la primera fase incompleta** |

### Baseline de tests, medido el 2026-07-29 antes de empezar F3

| Paquete | Tests | Archivos |
|---|---|---|
| `@coachlab/core` | 183 | 15 |
| `@coachlab/api` | 68 | 8 |
| `@coachlab/web` | 3 | 1 |
| **Total** | **254** | **24** |

Todos verdes. **Si al terminar F3 el total no subió, algún test nuevo no se está corriendo.**

> `docs/IMPLEMENTATION-F2.md` §1 dice "159 en core + 57 en api = 216". Ese número quedó viejo: hoy son
> 254. No es un error de F2, es que se agregaron tests después de escribir esa línea.

---

## 3. Las cuatro decisiones ya tomadas — NO reabrir

Las tomó el dueño del repo en la sesión de brainstorming del 2026-07-29. Están razonadas en el spec §3;
acá va el resumen operativo.

### 3.1. No hay checkbox "hecho" por ejercicio

`exercise_entries` **no lleva columna `done` y no se agrega**. El único cierre del día es el botón
"Completar día", que sella `session_logs.completed_at` (columna que ya existe).

El progreso se **deriva**: una entry cuenta si tiene alguno de `weight`, `reps` o `rpe` no nulo. El
badge dice **"3/8 registrados"**, no "3/8 hechos" — sin checkbox no hay nada que el jugador haya
afirmado, y el texto no debe prometer más de lo que el dato dice.

La misma regla (`hasData`) decide si una entry es historial para `lastPerf`. **Una sola definición de
"esto se registró".**

### 3.2. Jugador y coach editan los mismos campos del perfil

`name`, `positionId`, `heightCm` y `weightKg`: los edita el jugador desde su perfil y también su coach
desde la ficha del plantel. Último que escribe gana. Sin reglas de precedencia, sin migración.

Sigue blindado por `guard_profile_changes` (no se toca): `role`, `invite_code`, `coach_id`, `email` e
`id` son inmutables desde la tabla.

**Riesgo aceptado a ojos abiertos:** `positionId` es lo que enruta el programa, así que un jugador que
se cambia de puesto se cambia la rutina entera y nadie recibe aviso. Si molesta en la práctica, el fix
es una rama en `guard_profile_changes`.

### 3.3. F3 se entrega completa

Dominio → rutas → "Mi semana" → perfil → contraseña → cierre. No se corta en "solo ver": "Mi semana"
sin el perfil deja al jugador sin poder cargar sus 1RM, o sea sin los kg calculados, que es el
diferencial del producto.

### 3.4. Se endurece la RLS de `session_logs` (migración `0015`)

Aprobada explícitamente. Es la **única migración de F3**. El SQL completo está en el plan, Task 5.

---

## 4. Lo que verifiqué del código y contradice la documentación

Esto es lo más valioso de este handoff: **cosas que los docs afirman y el código desmiente**. Están ya
incorporadas al plan, pero conviene que las sepas antes de leerlo.

### 4.1. `blocks` no tiene `name`, y `block_exercises` no tiene `note`

```sql
create table public.blocks (
  id, day_id, type, rounds, order_index   -- eso es TODO
);
```

El plan viejo mostraba una **"nota del coach" por ejercicio** que nunca existió en el schema. Tampoco
hay nombre de bloque: `parsedBlockSchema` no lo tiene y el import no lo escribe. Los bloques son
anónimos — un `CIRCUIT` se rotula por sus vueltas, un `SINGLE` no lleva encabezado.

**No inventes esas columnas.** Si hacen falta, es una migración y una decisión aparte.

### 4.2. `rpe` es `numeric(3,1)`, no entero

El plan viejo lo modelaba como `z.number().int()`. La columna admite un decimal
(`check (rpe between 1 and 10)`), así que 7.5 es válido. El schema de Zod espeja el `CHECK`.

Idem `block_exercises.sets` y `.reps`: son **nullable** (`smallint` y `text`).

### 4.3. `docs/IMPLEMENTATION-F2.md` §6 afirma algo falso sobre `name`

Dice que "un coach puede editar `name`, `position_id`, `height_cm` y `weight_kg` de sus jugadores".
**`playerProfileSchema` no incluye `name`**, así que hoy el nombre no lo edita nadie después del signup.
La Task 8 lo agrega al schema compartido, y con eso la afirmación pasa a ser verdadera para los dos
roles. **Corregir esa línea de F2 al cerrar la fase** (está en la Task 11).

### 4.4. `ensure_exercise` rechaza a PLAYER a propósito

Migraciones `0012`/`0014`, con el comentario textual: *"Agregar al catálogo es una operación de coach:
el caso de uso es el import de un programa. Un jugador no tiene por qué tocar el catálogo global."*

Consecuencia de diseño: **el 1RM del jugador elige del catálogo, no crea ejercicios.** El typeahead
lista `/catalog/exercises` y manda un `exerciseId`. Que `oneRmSchema` ya tome `exerciseId` (y no un
nombre) hace que se reuse **sin cambios**.

**No llames a `ensure_exercise` desde ninguna ruta de `/player/*`.** Va a fallar con `P0001 No
autorizado`, y está bien que falle.

### 4.5. Hay cosas ya construidas esperando a F3

No las rehagas:

- **`redeem_invite_code`** (migración `0005`) existe y su comentario dice *"F3 la consume desde la
  pantalla de perfil del jugador sin vincular"*. Es el **único** camino para vincularse a un coach; el
  `coach_id` nunca llega por un PATCH.
- **`/player/*` ya tiene `requireRole(['PLAYER'])`** montado en `app.ts` desde F1, con el comentario
  *"queda guardado desde ya aunque sus rutas lleguen en F3"*. Es la capa 2 de §4 funcionando como se
  diseñó: toda ruta nueva bajo ese prefijo **nace protegida**.
- **`one_rms_write`** ya permite `player_id = auth.uid()` desde `0003`: el jugador escribe sus 1RM sin
  cambios de RLS.
- **`activeProgramIdFor`** y **`candidateAssignmentsFor`** (`packages/api/src/access/assignments.ts`)
  son de F2 y resuelven el programa vigente. F3 los consume tal cual.
- **`useDebouncedSave`** y **`ExerciseTypeahead`** son de F2 y se reusan.
- **`assertRow` / `assertRpcOk`** (`packages/api/src/routes/coach/_scope.ts`) traducen el "0 filas =
  éxito" de PostgREST a 404. Usalos en toda escritura.

---

## 5. Los dos problemas que F3 sufre y no crea

### 5.1. `calcLoad` no soporta `LABEL` — esto ya está roto hoy

`LoadType` es `'WEIGHT' | 'PERCENTAGE' | 'NONE'`. La migración `0013` agregó el cuarto modo `LABEL` y el
parser lo produce, pero **`calcLoad` cae al `return` final y lo devuelve como
`{ kind: 'none', label: 'Sin peso' }`**.

No es teórico: según `IMPLEMENTATION-F2.md` §3.5, importar la hoja `14.15.16` generó **35 cargas con
etiqueta sobre 108 ejercicios**. Un tercio de lo que el jugador vería diría "Sin peso" en vez de
`p.corp`, perdiendo justo la información que `0013` se creó para preservar.

**Es la Task 1 del plan**, primero de todo.

### 5.2. El gate de verificación está roto en dos lugares — DECISIÓN PENDIENTE DEL DUEÑO

Los dos están medidos, no supuestos. **Fuera del alcance de F3**: planteárselos, no arreglarlos de
callado.

**a. `pnpm lint` no existe.** `CLAUDE.md` §5 manda `pnpm lint && pnpm typecheck && pnpm test` antes de
cerrar una feature. El script del root hace `pnpm -r lint` y **ningún package define `lint`**:

```
[ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT] None of the selected packages has a "lint" script
EXIT=1
```

Nunca fue ejecutable. Hay que resolverlo en un sentido (agregar ESLint) o en el otro (corregir §5).

**b. `packages/web typecheck` no chequea nada y reporta éxito.** `nuxt typecheck` → `vue-tsc` crashea:

```
[Vue] Failed to create plugin TypeError: plugin is not a function
    at @vue/language-core@2.2.12/lib/plugins.js:53:30
Done
EXIT=0
```

Imprime el stack, escribe `Done` y **sale con código 0**. O sea que `pnpm typecheck` da verde **sin
haber mirado una sola línea de `.vue`**.

> **Por qué te importa a vos, ahora:** F3 es la fase que más código Vue agrega de todo el proyecto (dos
> páginas y dos componentes con props tipadas contra `PlayerDay`/`PlayerExercise`). Mientras esto esté
> roto, **el único que agarra un error de tipos en un `.vue` es
> `pnpm --filter @coachlab/web build`**. Por eso está en los pasos de verificación de las Tasks 9 y 10.
> **No confíes en `pnpm typecheck` para el frontend.**

---

## 6. Trampas que te van a morder

Las cuatro primeras ya costaron tiempo en fases anteriores y están documentadas; las repito porque F3
las vuelve a pisar.

1. **Dos FK entre `programs` y `weeks`.** Todo select que embeba semanas desde programas **tiene que**
   desambiguar: `weeks!weeks_program_id_fkey(...)`. Si no, PostgREST devuelve **500**
   `more than one relationship was found`. (`IMPLEMENTATION-F2.md` §4.3.)
2. **Los strings de select no los ve el typecheck ni los tests de `app.request()`.** El bug de arriba
   pasó los 68 tests de API, el typecheck y `verify:setup`, y lo agarró **solo** el smoke con sesión
   real. F3 mete varios embeds anidados nuevos (`days!inner(weeks!inner)`,
   `block_exercises!inner(exercises!inner)`), así que el smoke de la Task 11 **no es opcional**.
3. **El `42501` de RLS en un `UPDATE`.** Postgres exige que la fila **resultante** siga siendo visible
   bajo las políticas de `SELECT`. Un update que saca la fila del alcance de su propia política falla
   aunque el `WITH CHECK` pase. (`CLAUDE.md` §3, e `IMPLEMENTATION-F1.md` §4.)
4. **`revoke execute ... from anon` no revoca nada.** Postgres otorga `EXECUTE` a `PUBLIC` al crear una
   función: hay que escribir **`from public, anon`**. La forma incompleta ya se copió tres veces en este
   repo. (`IMPLEMENTATION-F2.md` §4.2.) La migración `0015` del plan lo hace bien — no lo "simplifiques".
5. **Un cliente de supabase-js que hizo `signUp` queda autenticado.** Con la confirmación de email
   apagada, `signUp` devuelve sesión y supabase-js la guarda en la instancia. Para probar algo "como
   anónimo" en `verify-setup.mjs` hace falta **una instancia nueva**, o el check da falso negativo (y ya
   una vez metió basura en el catálogo global).
6. **El `Actor` no trae la posición.** `withActor` selecciona
   `id, email, name, role, invite_code, coach_id`. `candidateAssignmentsFor` **necesita** el
   `positionId` para resolver assignments por puesto y por grupo. **Es el Step 1 de la Task 7**, y va
   primero: sin eso un jugador solo vería programas asignados a él individualmente y los otros tres
   niveles de prioridad quedarían muertos en silencio.
7. **Nombres de componentes con auto-import de Nuxt.** `components/player/PlayerExerciseRow.vue` se
   expone como `<PlayerPlayerExerciseRow>` (directorio + archivo). El plan usa esa etiqueta para que
   compile tal cual; si preferís `<PlayerExerciseRow>`, renombrá el archivo a
   `components/player/ExerciseRow.vue`. **Elegí uno y sé consistente.**
8. **Iconos nuevos van a `nuxt.config.ts`.** `clientBundle.icons` es una lista **explícita** porque el
   sidebar pasa el icono por binding dinámico y el escaneo estático no lo ve. `tests/icons.test.ts`
   compara las dos listas y falla si se desfasan — si no, el icono simplemente no se ve en producción y
   el build no falla. F3 agrega `lucide:history`; `lucide:user` ya está.

---

## 7. Lo que NO hay que hacer

- **No agregar una columna `done`** a `exercise_entries` (decisión §3.1).
- **No llamar `ensure_exercise`** desde `/player/*` (§4.4).
- **No usar `service_role` en ningún camino de request.** `CLAUDE.md` §4: es la regla que hace que RLS
  valga algo. Solo en migraciones, seed y scripts a mano.
- **No editar `packages/web/types/database.ts`** ni `packages/web/generated/` a mano: se regeneran.
- **No editar una migración ya aplicada.** Se agrega una nueva.
- **No re-parentar filas** con un `UPDATE` que cambie la columna por la que scopea una política (§6.3).
- **No agregar dependencias** sin justificarlas contra la tabla de decisiones de `CLAUDE.md` §2. En
  particular, **no agregar un ORM**.

---

## 8. Cómo verificar

```bash
# El gate. Ojo con lo de §5.2: lint no existe y el typecheck de web es un no-op.
pnpm typecheck && pnpm test

# Lo único que typecheckea los .vue de verdad:
pnpm --filter @coachlab/web build

# Verificación en vivo contra Supabase. Necesita las tres env vars y que el seed haya corrido.
#   $env:SUPABASE_URL="https://<ref>.supabase.co"
#   $env:SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
#   $env:SUPABASE_ANON_KEY="sb_publishable_..."
pnpm verify:setup

# El smoke, que es el único nivel que ejercita Nuxt -> Hono -> PostgREST completo.
pnpm dev
```

El click-through completo (11 pasos, con los valores esperados exactos) está en la **Task 11, Step 3**
del plan. Incluye los dos casos que solo se ven con datos reales: un ejercicio en `PERCENTAGE` con 1RM
cargado tiene que mostrar **"80% → 112 kg"**, y uno en `LABEL` tiene que mostrar **"p.corp"**, no "Sin
peso".

---

## 9. Contexto que sigue faltando en el repo

- **`coach.html`, `README-CoachLab.md` y `NEXTJS_APP_CONTEXT.md` no están.** `CLAUDE.md` §1 los declara
  fuente de verdad del comportamiento de producto, pero no están versionados, así que `spec-navigator`
  no tiene qué leer. Para F3 esto **no bloquea**: el comportamiento está especificado en el spec y en el
  plan viejo (cuya parte de producto sigue válida). Si aparece una duda de producto que ninguno de los
  dos responde, **decilo en vez de inventar**.
- **Las planillas reales del club no van al repo**: tienen datos personales y `.gitignore` bloquea
  `*.xlsx`/`*.xls`. Los fixtures de test son calcos anonimizados en
  `packages/core/src/domain/__fixtures__/`.

---

## 10. Al terminar F3

1. `pnpm typecheck && pnpm test` + `pnpm --filter @coachlab/web build` en verde, con el total de tests
   **por encima de 254**.
2. `pnpm verify:setup` en verde, con los checks nuevos de la Task 11.
3. El smoke de 11 pasos hecho de verdad, contra un programa importado real.
4. Escribir **`docs/IMPLEMENTATION-F3.md`** con el formato de F0–F2: resumen con tabla de estado,
   decisiones de diseño, mapa de archivos, los problemas que valieron la pena, y la deuda conocida.
5. Corregir `docs/IMPLEMENTATION-F2.md`: §6 (lo de `name`, §4.3 de acá) y §5.5 A (marcar implementado).
6. Marcar `[x] F3` en `CLAUDE.md` §6 y documentar en §3 que `session_logs` tiene el día scopeado por RLS.
7. Plantearle al dueño los dos problemas del gate (§5.2) si todavía no se decidieron.
8. Borrar este archivo: su única razón de existir es el traspaso entre chats.
