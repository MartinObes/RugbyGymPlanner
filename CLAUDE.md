# CoachLab — Contexto maestro del proyecto

> **Leé este archivo completo antes de tocar código.** Es la fuente de verdad sobre qué es el proyecto, qué decisiones ya están tomadas y qué prácticas se siguen. Si algo acá contradice código existente, este archivo manda (y hay que corregir el código o actualizar este archivo, nunca ignorar la diferencia en silencio).

---

## 1. Qué es CoachLab

App para entrenadores de rugby (extensible a otros deportes) que arma la rutina de fuerza del plantel y recibe lo que cada jugador realmente hizo.

**El loop de producto:** el coach define programas por mesociclo (semanas → días → bloques → ejercicios) con cargas en kg, % del 1RM o sin peso, y un RPE objetivo por ejercicio. Cada jugador ve su rutina con los **kg ya calculados según su 1RM personal** ("80% → 112 kg"), registra lo que hizo (peso real, reps, RPE percibido, nota del día) y al completar el día eso le llega al coach. Comparar **RPE objetivo vs. percibido** junto con la nota sigue siendo el dato clave para ajustar
cargas, pero desde F3.5 el RPE percibido se pide **una vez por día** al cerrar la sesión, no una vez
por ejercicio: doce preguntas por sesión garantizan que nadie las conteste. El jugador es un **lector**
de su rutina y el registro es opcional — ver `docs/superpowers/specs/2026-07-29-f35-player-dashboard-design.md`.

**Diferencial:** un solo plan en % escala a todo el plantel con cargas personalizadas por jugador.

### Contexto de uso y restricción de costo

CoachLab es un proyecto **sin fines comerciales**, hecho para modernizar la preparación física de un club. El dueño del repo además juega en ese club. De ahí sale una restricción dura que manda sobre las decisiones técnicas:

> **Costo objetivo: $0.** No se agrega ningún servicio que cobre, ni que empiece a cobrar al crecer dentro de la escala esperada.

Escala real: un plantel, ~40–60 jugadores, 2–3 entrenamientos por semana. Techo de diseño: ~300 usuarios. Esto no es una app que tenga que escalar; es una app que tiene que **no costar nada y no romperse**.

### Historia y fuentes de verdad

Este repo es la **tercera encarnación** del producto. Referencias (no se portan, se consultan):

1. **`coach.html` + `README-CoachLab.md`** — prototipo funcional en un solo HTML (vanilla JS + SheetJS). Es la **especificación funcional validada**: si hay duda sobre cómo debe comportarse una feature, la respuesta está ahí. Funciones portables casi verbatim: `parseGrid`/`parseText` (import Excel/texto), `normName` (matching tolerante a acentos), lógica de `weightLabel` y `lastPerf`.
2. **`NEXTJS_APP_CONTEXT.md`** — análisis del intento anterior (backend .NET 9 + Angular 21, repo WorkoutPlannerApp). De ahí se reutiliza **diseño, no código**: el algoritmo del WorkoutProcessor, el modelo Evaluation, el catálogo de ~48 ejercicios del seeder, y los patrones de UX (form dinámico por LoadType, typeahead de ejercicios).
3. **Este repo** — la app definitiva: **Nuxt + Hono + Supabase, desplegada en Vercel**.

> ⚠ **Los tres archivos de referencia todavía no están en el repo.** Mientras falten, `spec-navigator` no tiene qué leer, y todo lo que dependa del formato exacto del prototipo va marcado como pendiente de validación en vez de inventado.
>
> **El import ya NO depende de eso** (2026-07-29): el dueño del repo aportó dos libros de Excel reales del preparador físico y el formato quedó validado contra ellos. El parser es `packages/core/src/domain/parseCoachSheet.ts` y su formato está documentado ahí y en `docs/IMPLEMENTATION-F2.md` §4. **Las planillas no van al repo**: tienen datos personales (la hoja "Grupos" lista apellidos y apodos del plantel), y `.gitignore` bloquea `*.xlsx`. Los fixtures de test son calcos anonimizados.

### Historial de stack — dos definiciones descartadas

Este proyecto cambió de stack dos veces. Ambas están **descartadas**; si encontrás código, docs o comentarios que las mencionen, están desactualizados y hay que corregirlos.

**Descartado #1 — Next.js App Router + Server Actions + Prisma + Neon + Auth.js + shadcn/ui.** Se descartó por el problema de conexiones de Postgres en serverless y por preferir Nuxt/Vue.

**Descartado #2 — AWS serverless: SST v3 + CloudFront + Lambda + DynamoDB single-table + ElectroDB + JWT propio con argon2.** Llegó a estar a medio implementar y se descartó a mitad de F0, deliberadamente, por tres razones:

1. **El dominio es relacional.** Programa → semanas → días → bloques → ejercicios es un árbol, y la resolución de assignments por prioridad es un `ORDER BY`. Modelarlo en single-table exigía embeber el árbol en la semana y resolver prioridades en memoria: gimnasia para evitar joins que Postgres hace gratis.
2. **DynamoDB no puede expresar las reglas del dominio.** Sin `CHECK` constraints, la coherencia de `LoadType` y el "exactamente un destino" de los assignments quedaban solo en Zod. Además ElectroDB 3.9.1 no soporta índices sparse por atributo ausente, lo que metía a todos los coaches en una misma partición vacía del GSI.
3. **La auth había que escribirla entera.** JWT propio, hash argon2, cookies, middleware: una fase completa de trabajo que Supabase resuelve incluida.

Lo único que se rescató de ese intento es lo que nunca dependió de la base: las funciones puras de `packages/core/src/domain/` y sus tests.

---

## 2. Decisiones tomadas (NO reabrir sin causa fuerte)

| Tema | Decisión | Por qué |
|---|---|---|
| Costo | **$0 duro.** Ningún servicio que cobre, ninguno que cobre al crecer hasta ~300 usuarios | Es la restricción de §1, no una preferencia |
| Hosting | **Vercel**, plan Hobby | Deploy con `git push`, preview por PR, SSR de Nuxt nativo. Gratis |
| DB + Auth | **Supabase** (Postgres gestionado + Supabase Auth) | Postgres modela el dominio sin gimnasia; la auth viene incluida y ahorra media fase |
| Acceso a datos | **`supabase-js` con tipos generados del schema. Sin ORM** | Un ORM se conecta con `service_role` y **saltea RLS**. `supabase-js` viaja con el JWT del usuario, así RLS se aplica sola. Sus selects anidados resuelven el árbol del programa en un request |
| Migraciones | **SQL plano versionado** en `supabase/migrations/`, aplicado con el CLI de Supabase | El schema es la fuente de verdad y se lee sin intérprete |
| Frontend | **Nuxt 4 en modo SSR** + **Vue 3** + **Nuxt UI** | SSR permite leer la cookie de sesión en el server y renderizar según rol |
| Backend | **Hono montado dentro de Nitro** (`server/api/[...].ts`), no un servicio aparte | Un solo deployable. Se conserva Hono por su router tipado y porque se testea con `app.request()` sin levantar servidor |
| Contrato API | Zod → **`@hono/zod-openapi`** → spec OpenAPI → **hey-api** genera el cliente TS que consume Nuxt | Una sola definición: el schema Zod es la validación *y* el contrato |
| Seguridad de datos | **RLS habilitada en TODAS las tablas**, sin excepción | Es la única capa que un bug de código no puede saltear. Ver §4 |
| Identidad | Email + contraseña vía Supabase Auth. El código de invitación del coach sirve solo para vincular jugadores, **no** es la identidad | Reemplaza el código de 4 chars del prototipo |
| Validación | **Zod** en todos los bordes (rutas de la API, forms, imports) | Una sola fuente de schemas. Las reglas que se pueden expresar en SQL van **además** como `CHECK` |
| Forms | `UForm` de Nuxt UI con resolver de Zod | Reusa los mismos schemas que la API |
| Excel | SheetJS **client-side** | Igual que el prototipo; los parsers son funciones puras |
| Monorepo | pnpm workspaces: `packages/core`, `packages/api`, `packages/web` | El dominio se comparte entre API y frontend. `api` es una librería, no un deployable |
| Package manager | **pnpm** | Estándar de facto |
| Escala objetivo | ~300 usuarios máximo | No optimizar prematuramente; sí poner los índices que corresponden |
| Posiciones | **Las 8 de rugby, fijas, como constantes en código** (no van a la DB) | Son inmutables. Una tabla para 8 filas que nunca cambian es una join de más |
| Grupos system | Forwards/Backs también **constantes en código** | Misma razón. Los grupos custom sí son filas |
| Keepalive | **UptimeRobot free** pegándole a `/health`, que hace un `select 1` real | Supabase pausa un proyecto free a los 7 días sin actividad de base. Con el ping no se pausa nunca, y de paso avisa por mail si algo se cae |
| Diseño | **Paleta del club en toda la app** (marino/rojo/dorado), con `error` en el rojo de Tailwind | Un error tiene que leerse como error aunque el club juegue de rojo. Detalle en `docs/DESIGN-SYSTEM.md` |

**Sobre la cláusula de Vercel:** el plan Hobby es **solo para uso no comercial**. CoachLab lo es (§1). Si algún día el proyecto genera ingresos, hay que pasar a Pro o mudar el hosting — no es opcional, es la licencia.

**Fuera del MVP (deliberado, no olvidado):** push notifications, PWA, multi-deporte configurable, tiempo real/WebSockets, impersonate de admin.

---

## 3. Modelo de dominio

### Constantes en código (no van a la base)

Viven en `packages/core/src/domain/positions.ts`:

- **Position** — las 8 fijas, con id slug estable: `primera-linea`, `segunda-linea`, `tercera-linea`, `medio-scrum` (FORWARD); `apertura`, `centro`, `wing`, `fullback` (BACK).
- **System groups** — `forwards` (las 4 FORWARD) y `backs` (las 4 BACK).

En la base, una posición se guarda como el **slug en una columna `text`**, no como FK. La integridad la da Zod en el borde más un `CHECK` contra la lista de slugs.

### Tablas

Todo en el schema `public`, snake_case, ids `uuid` con `gen_random_uuid()` salvo donde se indique.

| Tabla | Claves | Notas |
|---|---|---|
| **profiles** | `id` PK → `auth.users(id)` ON DELETE CASCADE | `email, name, role`; si COACH además `invite_code` UNIQUE; si PLAYER además `coach_id → profiles(id)`, `position_id`, `height_cm`, `weight_kg`, `selected_program_id → programs` ON DELETE SET NULL |
| **exercises** | `id` PK, `normalized_name` UNIQUE | Catálogo global. `normalized_name` es la clave del matching de 1RM |
| **one_rms** | PK `(player_id, exercise_id)` | El 1RM vigente |
| **evaluations** | `id` PK | Historial de tests. Sin UI en el MVP |
| **programs** | `id` PK, `coach_id → profiles` | `name`, `current_week_id` |
| **weeks** | `id` PK, `program_id → programs` CASCADE | `name`, `order_index` |
| **days** | `id` PK, `week_id → weeks` CASCADE | `name`, `order_index` |
| **blocks** | `id` PK, `day_id → days` CASCADE | `type`, `name` (el de la planilla, nullable), `rounds`, `order_index` |
| **block_exercises** | `id` PK, `block_id → blocks` CASCADE, `exercise_id → exercises` | `load_type`, `weight`, `percentage`, `sets`, `reps`, `target_rpe`, `order_index` |
| **position_groups** | `id` PK, `coach_id → profiles` | Solo grupos custom |
| **position_group_positions** | PK `(group_id, position_id)` | Qué puestos contiene un grupo custom |
| **program_assignments** | `id` PK, `program_id → programs` CASCADE | **Tres** columnas de destino mutuamente excluyentes + `created_at` (que es lo que decide: gana la última) |
| **session_logs** | `id` PK, UNIQUE `(player_id, day_id)` | `note`, `perceived_rpe` (el RPE del día, nullable), `completed_at` |
| **exercise_entries** | `id` PK, UNIQUE `(session_log_id, block_exercise_id)` | `weight`, `reps`, `rpe` |

**El árbol del programa es una tabla por nivel.** No se embebe nada. La pantalla del jugador lo trae en un request con un select anidado de PostgREST:

```ts
supabase.from('weeks').select('*, days(*, blocks(*, block_exercises(*, exercises(*))))').eq('id', weekId).single()
```

El orden **nunca** sale del orden en que vuelven las filas: siempre se ordena por `order_index`, explícito en el select o en código.

### Las reglas que ahora vive la base

Esto es lo que se ganó al mudarse a Postgres. Son `CHECK` constraints, no comentarios:

**Coherencia de LoadType** en `block_exercises` — antes solo la miraba Zod:

```sql
CHECK (
  (load_type = 'WEIGHT'     AND weight IS NOT NULL AND percentage IS NULL) OR
  (load_type = 'PERCENTAGE' AND percentage IS NOT NULL AND percentage BETWEEN 1 AND 100 AND weight IS NULL) OR
  (load_type = 'NONE'       AND weight IS NULL AND percentage IS NULL)
)
```

**Assignment con exactamente un destino** en `program_assignments`:

```sql
CHECK (num_nonnulls(player_id, system_group_id, position_group_id) = 1)
```

Los tres destinos son: un jugador, un grupo system (`'forwards'`/`'backs'`, texto porque son constantes de código) y un grupo custom. **El puesto dejó de ser destino en F4-B** (migración `0019`): un grupo custom de una sola posición hace lo mismo y ya existía.

**Rol válido** en `profiles`: `CHECK (role IN ('PLAYER','COACH','ADMIN'))`.

### Reglas de negocio críticas

**Resolución del programa activo de un jugador** (reemplaza al `playerProgram()` del prototipo):

> **Gana la última asignada:** el assignment con el `created_at` más reciente entre los que alcanzan al jugador. Empate exacto: gana el primero, para que el resultado no dependa del orden en que vuelvan las filas.

Los destinos son **tres**: un jugador, un grupo system (Forwards/Backs) y un grupo custom. **El puesto no es un destino**: un puesto suelto se modela como grupo custom de una sola posición. `profiles.position_id` sigue existiendo y sigue decidiendo a qué grupo system pertenece y qué grupos custom lo contienen.

**La elección del jugador** (`profiles.selected_program_id`): si lo alcanza más de un programa, puede volver a otro de los suyos. `null` significa "la última asignada", **no** "ninguna". Vale **sólo mientras ese programa siga alcanzándolo** —quitarle el assignment, cambiarle el puesto o sacarlo del grupo la invalidan, y de ninguna de las tres se entera la FK—, así que se valida al leer y ante una elección inválida se degrada al default en vez de romper el render. Se resetea sola cuando el coach asigna algo nuevo que lo alcanza (trigger `reset_selected_program`, migración `0019`): la prescripción del coach siempre gana.

> Esto reemplaza la resolución por prioridad de cuatro niveles con `priority` override, borrada en F4-B. El caso real que la mató: "este jugador se lesionó, lo paso a la rutina de lesionados" es una acción con una intención obvia, y exigía razonar si 50 + override le ganaba a 100. Diseño completo en `docs/superpowers/specs/2026-07-31-f4b-assignment-model-design.md`.

**Cómo se implementa, y por qué así:** la query trae los assignments *candidatos*, y **la elección del ganador la hace una función pura** en `packages/core/src/domain/resolveProgram.ts`. Se podría resolver entero en SQL con un `ORDER BY ... LIMIT 1`, pero entonces la regla de negocio viviría en un string y solo se podría testear con una base levantada. Con esta división la regla se testea en milisegundos y vive en un solo lugar (§5).

La query de candidatos:

```sql
select a.* from program_assignments a
where a.player_id = $playerId
   or a.system_group_id = $systemGroupId
   or a.position_group_id in (
        select group_id from position_group_positions where position_id = $positionId
      )
```

**Cálculo de carga** (el WorkoutProcessor, portado de .NET): si `load_type = 'PERCENTAGE'`, buscar el 1RM del jugador para ese ejercicio (match por `normalized_name`, tolerante a inclusión parcial como en `rmFor` del prototipo) y calcular `round(percentage/100 * kg * 2) / 2` (redondeo a 0.5 kg como el prototipo). Sin 1RM → mostrar el % con aviso "falta tu 1RM de X". `WEIGHT` → kg fijo. `NONE` → sin carga. **`LABEL` → se muestra la etiqueta tal cual** (`p.corp`, `barra`, `goma`, `med 9`): es el cuarto modo, agregado en la migración `0013` porque las planillas reales del club usan cargas que no son ni número ni porcentaje.

**"Última vez" (`lastPerf`)**: último `exercise_entry` del jugador para el mismo ejercicio (por `normalized_name`) en días anteriores, mostrando "Semana X · Día: NN kg · N reps · RPE N". En Postgres es un join con `ORDER BY completed_at DESC LIMIT 1`, no un filtrado en memoria.

**Evaluación → 1RM**: cargar una `evaluation` actualiza `one_rms` del mismo par (jugador, ejercicio)
**solo si es la más reciente** por `tested_on`. Un test más bajo baja el 1RM: es el vigente, no el
récord. Lo garantiza el trigger de la migración `0018`, y la misma regla existe como función pura
(`nextOneRmFrom` en `packages/core/src/domain/evaluationTrend.ts`) para poder testearla sin base.

**Vínculo jugador↔coach**: nace en el signup (trigger `handle_new_user` con el invite code) y después solo cambia por **dos RPCs**, nunca por un PATCH: `redeem_invite_code(code)` (un jugador sin coach canjea un código — lo consume la pantalla de perfil de F3) y `release_player(player_id)` (el coach saca a un jugador de su plantel). `coach_id`, `email`, `role` e `invite_code` son inmutables desde la tabla: los frena el trigger `guard_profile_changes`. Además, un programa solo "alcanza" a un jugador si es de SU coach, y los destinos de un assignment tienen que pertenecer al coach del programa — los assignments no cruzan planteles. Migraciones `0005`–`0007`.

> **Trampa de RLS que ya nos costó una tarde:** Postgres exige que la fila **resultante** de un `UPDATE` siga siendo visible bajo las políticas de `SELECT`. Un update que saca la fila del alcance de su propia política falla con `42501 new row violates row-level security policy` aunque el `WITH CHECK` pase y aunque no haya `RETURNING`. Por eso desvincular un jugador (`coach_id → null`, que lo vuelve invisible para su ex-coach) no puede hacerse con un PATCH y va por RPC `security definer`. Si aparece un 42501 inexplicable, esto es lo primero que hay que mirar.

---

## 4. RBAC — seguridad en 5 capas (TODAS obligatorias)

La capa 1 es nueva y es la más importante: es la única que un bug en el código de la app no puede saltear.

1. **RLS en Postgres.** Toda tabla tiene `ENABLE ROW LEVEL SECURITY` y políticas explícitas. Sin política, nadie ve nada — ese es el default correcto. Un `select` mal escrito en la API no puede devolver datos ajenos porque la base no se los da.
2. **Agrupación de rutas en Hono** — `/coach/*`, `/player/*` y `/admin/*` son sub-apps con el middleware de rol montado en el grupo. Garantiza que ninguna ruta nueva nazca sin guard.
3. **`requireRole([...])`** — middleware de Hono, primera línea de **toda** ruta que toque datos. Sin excepciones.
4. **Scoping en el acceso a datos** — los helpers de scope resuelven ownership contra el actor. Recurso ajeno → **404, nunca 403** (no revelar existencia). RLS ya lo habría bloqueado; esta capa existe para dar el status correcto en vez de una lista vacía confusa.
5. **Nuxt** — el middleware de ruta del frontend redirige por rol y los componentes no muestran acciones que las capas 1–4 van a rechazar. **Esto es UX, no seguridad.**

Matriz resumida: PLAYER ve/edita su perfil, su programa resuelto y sus logs. COACH gestiona su plantel, sus programas, assignments y grupos custom. ADMIN todo + CRUD del catálogo de ejercicios. **ADMIN no se autoregistra**: solo por seed o por consola de Supabase.

### La regla que hace que RLS sirva de algo

> **Ninguna operación de usuario usa la `service_role` key. Nunca.**

La `service_role` **saltea RLS por diseño**. Solo puede aparecer en: migraciones, el seed, y scripts de administración corridos a mano. Nunca en el request de un usuario, nunca en código que corra en respuesta a una request HTTP de la app.

Las queries de usuario van con el cliente de Supabase creado a partir de la sesión de ese usuario (`@supabase/ssr`), y por lo tanto con su JWT. `auth.uid()` dentro de las políticas es lo que resuelve quién es.

**El rol vive en `profiles.role`, no en el JWT.** Las políticas lo leen de la tabla. Así un cambio de rol tiene efecto inmediato y no hay que esperar a que expire un token.

---

## 5. Prácticas de desarrollo

### Estructura del monorepo

```
supabase/
  migrations/          # SQL versionado. Fuente de verdad del schema
  seed.sql             # catálogo de ejercicios (idempotente)
packages/
  core/                # compartido entre API y web. Sin dependencias de Supabase ni de Vue
    src/
      domain/          # lógica PURA: resolveProgram, calcLoad, rmFor, lastPerf,
                       # buildPlayerDay, rpeDelta, normName, parseGrid, parseText, positions
      validators/      # schemas Zod por entidad — también son el contrato OpenAPI
  api/                 # librería, no deployable: la monta Nitro
    src/
      app.ts           # app Hono raíz
      routes/          # un archivo por recurso (auth, players, programs, session…)
      middleware/      # auth, requireRole, manejo de errores
      db/              # clientes de Supabase (por request, con el JWT del usuario)
  web/                 # Nuxt 4 — el router SALE de los directorios, no se declara
    server/
      api/[...].ts     # único punto de entrada: delega todo en la app Hono
    app/
      pages/
        login.vue
        register.vue
        coach/
          players/index.vue           # /coach/players
          players/[playerId].vue      # /coach/players/:playerId
          groups.vue
          programs/index.vue
          programs/[programId].vue    # padre: encabezado + tabs + <NuxtPage />
          programs/[programId]/index.vue    # editor
          programs/[programId]/assign.vue
          programs/[programId]/import.vue
          feedback/index.vue
          feedback/[playerId].vue
        player/week.vue, player/profile.vue
        admin/index.vue
      components/
      composables/
      layouts/         # auth (login/registro) y default (shell con sidebar)
      middleware/      # guards de ruta por rol
    types/
      database.ts      # generado por el CLI de Supabase — NO se edita a mano
    generated/         # cliente TS de hey-api — NO se edita a mano.
                       # Vive fuera de app/ para que no entre al auto-import;
                       # se importa explícito con el alias `~~/generated`.
    nuxt.config.ts
```

**Regla de nombres de página** (Nuxt la aplica en silencio y muerde): si existe `x.vue` **y** el
directorio `x/`, entonces `x.vue` pasa a ser el componente *padre* de esas rutas y sus hijos no se
renderizan hasta que el padre incluya `<NuxtPage />`.

- Vistas que **no** comparten estado ni encabezado (listado y detalle de plantel) → hermanas:
  `players/index.vue` + `players/[playerId].vue`.
- Vistas que **sí** lo comparten (editor, asignaciones e import de un programa cargan el mismo
  programa y muestran los mismos tabs) → anidadas a propósito: `[programId].vue` como padre.

### Reglas de código

- **Lógica de dominio = funciones puras en `packages/core/src/domain/`**, sin Supabase, sin Hono, sin Vue, sin `process.env`. Son lo que se testea primero (resolveProgram, calcLoad, rmFor, lastPerf, buildPlayerDay, rpeDelta, parseGrid, parseText, normName).
- **El schema se cambia con una migración nueva**, nunca editando una ya aplicada. Después se regeneran los tipos.
- **Zod valida los bordes; la base valida los invariantes.** Si una regla se puede expresar como `CHECK`, va como `CHECK` **además** de en Zod. Zod da el mensaje lindo, la base da la garantía.
- **El cliente en `packages/web/generated/` y los tipos en `packages/web/types/database.ts` se regeneran, no se editan.**
- **Nunca confiar en el cliente**: ids, roles y ownership se verifican en la API siempre, y RLS los verifica otra vez.
- **Textos de UI en español** (es-UY, registro "vos" como el prototipo: "Poné un nombre", "Elegí tu puesto"). Código, commits e identificadores en inglés.
- La grafía `Excercise` (doble c) del proyecto .NET **NO se hereda**: acá es `Exercise` en todos lados.
- Errores de la API: respuesta tipada `{ ok: false, error: string }` con el status correcto, no excepciones crudas.
- No agregar dependencias sin justificarlo contra la tabla de decisiones (§2). En particular: **no agregar un ORM** — la razón está en §2 y en §4.

### Tests

- **Prioridad 1**: unit tests de `packages/core/src/domain/` (Vitest). Cobertura completa de resolveProgram (los 4 niveles + empates), calcLoad (3 loadTypes, sin 1RM, redondeo 0.5), parsers de Excel/texto con planillas reales de ejemplo, normName con acentos.
- **Prioridad 2**: tests de rutas de la API con scoping RBAC (que un coach no vea plantel ajeno, que 404 ≠ 403). Hono se testea con `app.request()` sin levantar servidor.
- **Prioridad 3**: tests de las políticas RLS. Son la capa 1 de §4 y una política mal escrita no la agarra ningún test de código.
- E2E (Playwright) recién cuando el flujo coach→jugador→log esté completo.

### Flujo de trabajo

- Ramas `feature/<nombre>` desde `main`. Commits chicos con mensaje imperativo en inglés.
- Antes de dar por terminada una feature: `pnpm lint && pnpm typecheck && pnpm test`.
  > **`pnpm lint` existe desde F3.5** (`@nuxt/eslint` en `packages/web`). `core` y `api` definen un `lint` que solo avisa que no tienen linter propio: son TS puro y los cubre `typecheck`.
  > **`pnpm typecheck` sí cubre los `.vue` desde F3**: antes `vue-tsc` crasheaba y salía con código 0, o sea que daba verde sin mirar el frontend. Ver `docs/IMPLEMENTATION-F3.md` §5.2. **`nuxt build` NO typecheckea** (`typeCheck` está en false): no sirve como gate de tipos.
- Si una decisión de §2 o §3 cambia, **actualizar este archivo en el mismo PR**.

### Levantar el proyecto

Requiere una cuenta de Supabase y una de Vercel. Ninguna de las dos pide tarjeta.

```bash
pnpm install
# 1. Crear el proyecto en supabase.com y copiar URL + anon key a packages/web/.env
# 2. Aplicar el schema
pnpm supabase db push
# 3. Regenerar los tipos del schema
pnpm gen:types
# 4. Catálogo de ejercicios + admin (nunca contra producción)
pnpm seed
pnpm dev
```

No hace falta Docker: las migraciones se aplican contra el proyecto hosted. Si querés una base local, el CLI de Supabase la levanta con `supabase start`, pero es opcional.

---

## 6. Roadmap y estado

Marcar `[x]` al completar cada fase. Al iniciar sesión de trabajo, buscar la primera fase incompleta.
Los planes detallados de cada fase están en `docs/superpowers/plans/`.

- [x] **F0 — Setup**: monorepo pnpm, proyecto Supabase, schema completo con RLS, tipos generados, Hono con OpenAPI montado en Nitro, Nuxt SSR, funciones puras de dominio con tests, deploy a Vercel. → `docs/IMPLEMENTATION-F0.md`
- [x] **F1 — Auth y shell**: registro/login con Supabase Auth, trigger que crea el `profile`, middleware de rol en Hono, guards de ruta en Nuxt, layout con sidebar, vínculo jugador↔coach por invite code. → `docs/IMPLEMENTATION-F1.md` (hardening RBAC post-auditoría aplicado: migración `0005`, verificado 30/30)
- [x] **F2 — Panel coach**: plantel, grupos custom, editor de programas (semanas/días/bloques/ejercicios, 4 modos de carga, RPE objetivo, autosave con debounce), assignments con prioridad, **import de las planillas reales del club**. → `docs/IMPLEMENTATION-F2.md`
- [x] **F3 — Panel jugador**: perfil (puesto, altura, peso, 1RM con typeahead), **cambiar su propia contraseña**, Mi semana con kg calculados y "última vez", registro de peso/reps/RPE/nota, completar día. → `docs/IMPLEMENTATION-F3.md`
- [x] **F3.5 — Dashboard del jugador y limpieza de deuda**: dashboard con rueda de progreso y tendencia de tests, "Mi semana" comprimida con un día por pantalla, la rutina presentada como la planilla, registro opcional en slideover, RPE una vez por día, evaluaciones en las dos puntas que sincronizan el 1RM, y la paleta del club en toda la app. → `docs/IMPLEMENTATION-F3.5.md`
  > **Mergeadas a `main` el 2026-07-31**, con **402 tests**, `pnpm lint` y `pnpm typecheck` en verde
  > en los 3 paquetes, `verify:setup` **85/85**, `smoke:player` **32/32** (incluye "80% → 112 kg",
  > "última vez" con datos reales y el trigger `0018` sincronizando el 1RM con RLS puesta),
  > migraciones `0015`–`0018` aplicadas.
  >
  > **El click-through quedó por la mitad, a propósito y con la deuda anotada.** Se hizo la parte que
  > no necesita sesión y encontró **dos defectos reales que ya están arreglados**: el botón primario
  > en modo oscuro estaba en 2.31:1 (abajo de WCAG AA) y los controles medían 32 px en vez de los
  > 44 px que pide `docs/DESIGN-SYSTEM.md` §6. Ver `docs/IMPLEMENTATION-F3.5.md` §6.7.
  >
  > ⚠ **Sigue sin mirarse NINGUNA pantalla autenticada** — ni del jugador ni del coach. `auth.global.ts`
  > manda a `/login` toda ruta no pública, así que hace falta una sesión real. Quedan sin verificar el
  > slideover, la carrera del 409 al completar el día, el re-login tras cambiar la contraseña y las
  > ~10 pantallas del coach con la paleta nueva (items 3, 4, 5 y 7 de
  > `docs/IMPLEMENTATION-F3.5.md` §6.1). **Es lo primero que hay que hacer en F4.**
- [ ] **F4 — Loop de feedback + deploy**: vista coach con progreso "2/3 días" y **el RPE del día (`session_logs.perceived_rpe`) contra los `target_rpe` del día**, con notas; keepalive de UptimeRobot; dominio propio si se quiere.
  > **El código está hecho** en `feature/f4-feedback`, con los tres gates en verde (488 tests). Cubre la
  > vista de feedback del coach (listado con "2/3 días" + detalle por día con la nota y el RPE) y F4-B,
  > el modelo de asignación nuevo (gana la última asignada, tres destinos, elección del jugador).
  > Diseño en `docs/superpowers/specs/2026-08-02-f4-coach-feedback-design.md` y
  > `2026-07-31-f4b-assignment-model-design.md`; plan en
  > `docs/superpowers/plans/2026-08-02-f4-assignments-and-feedback.md`.
  >
  > **Falta para cerrar la fase**, y no lo puede hacer un agente:
  > 1. **`pnpm verify:setup` y `pnpm smoke:player`** con la `service_role` en el entorno. La migración
  >    `0019` reescribió `program_reaches_me()`, que es `security definer` y **la usan las políticas de
  >    RLS** — la capa 1 de §4. Ningún test de código lo cubre.
  > 2. **El keepalive de UptimeRobot** contra `/health`, cada 5 minutos (Supabase pausa un proyecto free
  >    a los 7 días sin actividad de base).
  > 3. **El click-through** de las pantallas nuevas con sesión real.
  >
  > **Decisión pendiente:** cómo recupera la contraseña un jugador que se la olvidó. Resetear la de OTRO usuario exige la `service_role`, que §4 prohíbe en un request, así que no es "agregar un botón": las tres opciones y sus riesgos están en `docs/IMPLEMENTATION-F2.md` §5.5 B. Hoy el camino es `pnpm set:password`.

---

## 7. Al iniciar una sesión de trabajo

1. Leer este archivo entero.
2. Ver estado del roadmap (§6) y el último commit para ubicar dónde quedó el trabajo.
3. Si la tarea toca comportamiento de producto y hay duda → consultar `coach.html` / `README-CoachLab.md` como espec (mientras falten, decirlo en vez de inventar).
4. Si la tarea toca el contrato de datos → las migraciones en `supabase/migrations/` mandan. Cambiar el schema obliga a una migración nueva, regenerar tipos y actualizar §3.
5. Si encontrás una referencia a **Next.js, Prisma, Neon, Auth.js, shadcn/ui** (stack descartado #1) o a **AWS, SST, Lambda, CloudFront, DynamoDB, ElectroDB, single-table, GSI, argon2, JWT propio** (stack descartado #2) → es residuo. Corregila y avisá.
6. Si vas a escribir una query de usuario, verificá que use el cliente con el JWT del usuario y **no** la `service_role` (§4).
7. No reabrir decisiones de §2 sin plantearlo explícitamente al dueño del repo.
