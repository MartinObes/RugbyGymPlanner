# CoachLab — Contexto maestro del proyecto

> **Leé este archivo completo antes de tocar código.** Es la fuente de verdad sobre qué es el proyecto, qué decisiones ya están tomadas y qué prácticas se siguen. Si algo acá contradice código existente, este archivo manda (y hay que corregir el código o actualizar este archivo, nunca ignorar la diferencia en silencio).

---

## 1. Qué es CoachLab

App para entrenadores de rugby (extensible a otros deportes) que arma la rutina de fuerza del plantel y recibe lo que cada jugador realmente hizo.

**El loop de producto:** el coach define programas por mesociclo (semanas → días → bloques → ejercicios) con cargas en kg, % del 1RM o sin peso, y un RPE objetivo por ejercicio. Cada jugador ve su rutina con los **kg ya calculados según su 1RM personal** ("80% → 112 kg"), registra lo que hizo (peso real, reps, RPE percibido, nota del día) y al completar el día eso le llega al coach. Comparar RPE objetivo vs. percibido junto con la nota es **el dato clave del producto** para ajustar cargas.

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

> ⚠ **Los tres archivos de referencia todavía no están en el repo.** Mientras falten, `spec-navigator` no tiene qué leer, y todo lo que dependa del formato exacto del prototipo (import Excel/texto, catálogo de ejercicios) va marcado como pendiente de validación en vez de inventado.

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

**Sobre la cláusula de Vercel:** el plan Hobby es **solo para uso no comercial**. CoachLab lo es (§1). Si algún día el proyecto genera ingresos, hay que pasar a Pro o mudar el hosting — no es opcional, es la licencia.

**Fuera del MVP (deliberado, no olvidado):** push notifications, PWA, multi-deporte configurable, tiempo real/WebSockets, compare de evaluaciones, impersonate de admin.

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
| **profiles** | `id` PK → `auth.users(id)` ON DELETE CASCADE | `email, name, role`; si COACH además `invite_code` UNIQUE; si PLAYER además `coach_id → profiles(id)`, `position_id`, `height_cm`, `weight_kg` |
| **exercises** | `id` PK, `normalized_name` UNIQUE | Catálogo global. `normalized_name` es la clave del matching de 1RM |
| **one_rms** | PK `(player_id, exercise_id)` | El 1RM vigente |
| **evaluations** | `id` PK | Historial de tests. Sin UI en el MVP |
| **programs** | `id` PK, `coach_id → profiles` | `name`, `current_week_id` |
| **weeks** | `id` PK, `program_id → programs` CASCADE | `name`, `order_index` |
| **days** | `id` PK, `week_id → weeks` CASCADE | `name`, `order_index` |
| **blocks** | `id` PK, `day_id → days` CASCADE | `type`, `rounds`, `order_index` |
| **block_exercises** | `id` PK, `block_id → blocks` CASCADE, `exercise_id → exercises` | `load_type`, `weight`, `percentage`, `sets`, `reps`, `target_rpe`, `order_index` |
| **position_groups** | `id` PK, `coach_id → profiles` | Solo grupos custom |
| **position_group_positions** | PK `(group_id, position_id)` | Qué puestos contiene un grupo custom |
| **program_assignments** | `id` PK, `program_id → programs` CASCADE | Cuatro columnas de destino mutuamente excluyentes + `priority`, `created_at` |
| **session_logs** | `id` PK, UNIQUE `(player_id, day_id)` | `note`, `completed_at` |
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
CHECK (num_nonnulls(player_id, position_id, system_group_id, position_group_id) = 1)
```

Los cuatro destinos son: un jugador, un puesto, un grupo system (`'forwards'`/`'backs'`, texto porque son constantes de código) y un grupo custom.

**Rol válido** en `profiles`: `CHECK (role IN ('PLAYER','COACH','ADMIN'))`.

### Reglas de negocio críticas

**Resolución del programa activo de un jugador** (reemplaza al `playerProgram()` del prototipo — individual pisa grupo pisa puesto):

1. Assignment a PLAYER → prioridad base 100
2. Assignment a POSITION_GROUP custom que contiene su posición → 50
3. Assignment a POSITION_GROUP system (Forwards/Backs) → 30
4. Assignment a POSITION → 10

Gana la mayor (base + `priority` override). Empate: `created_at` más reciente.

**Cómo se implementa, y por qué así:** la query trae los assignments *candidatos*, y **la elección del ganador la hace una función pura** en `packages/core/src/domain/resolveProgram.ts`. Se podría resolver entero en SQL con un `ORDER BY ... LIMIT 1`, pero entonces la regla de negocio viviría en un string y solo se podría testear con una base levantada. Con esta división la regla se testea en milisegundos y vive en un solo lugar (§5).

La query de candidatos:

```sql
select a.* from program_assignments a
where a.player_id = $playerId
   or a.position_id = $positionId
   or a.system_group_id = $systemGroupId
   or a.position_group_id in (
        select group_id from position_group_positions where position_id = $positionId
      )
```

**Cálculo de carga** (el WorkoutProcessor, portado de .NET): si `load_type = 'PERCENTAGE'`, buscar el 1RM del jugador para ese ejercicio (match por `normalized_name`, tolerante a inclusión parcial como en `rmFor` del prototipo) y calcular `round(percentage/100 * kg * 2) / 2` (redondeo a 0.5 kg como el prototipo). Sin 1RM → mostrar el % con aviso "falta tu 1RM de X". `WEIGHT` → kg fijo. `NONE` → sin carga.

**"Última vez" (`lastPerf`)**: último `exercise_entry` del jugador para el mismo ejercicio (por `normalized_name`) en días anteriores, mostrando "Semana X · Día: NN kg · N reps · RPE N". En Postgres es un join con `ORDER BY completed_at DESC LIMIT 1`, no un filtrado en memoria.

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
- [x] **F1 — Auth y shell**: registro/login con Supabase Auth, trigger que crea el `profile`, middleware de rol en Hono, guards de ruta en Nuxt, layout con sidebar, vínculo jugador↔coach por invite code. → `docs/IMPLEMENTATION-F1.md` (⚠ antes de F2: ejecutar `docs/superpowers/plans/2026-07-28-rbac-hardening.md`)
- [ ] **F2 — Panel coach**: plantel, grupos custom, editor de programas (semanas/días/bloques/ejercicios, 3 modos de carga, RPE objetivo, autosave con debounce), assignments con prioridad, **import Excel/texto**.
- [ ] **F3 — Panel jugador**: perfil (puesto, altura, peso, 1RM con typeahead), Mi semana con kg calculados y "última vez", registro de peso/reps/RPE/nota, completar día.
- [ ] **F4 — Loop de feedback + deploy**: vista coach con progreso "2/3 días" y RPE objetivo vs. percibido con notas; keepalive de UptimeRobot; dominio propio si se quiere.

---

## 7. Al iniciar una sesión de trabajo

1. Leer este archivo entero.
2. Ver estado del roadmap (§6) y el último commit para ubicar dónde quedó el trabajo.
3. Si la tarea toca comportamiento de producto y hay duda → consultar `coach.html` / `README-CoachLab.md` como espec (mientras falten, decirlo en vez de inventar).
4. Si la tarea toca el contrato de datos → las migraciones en `supabase/migrations/` mandan. Cambiar el schema obliga a una migración nueva, regenerar tipos y actualizar §3.
5. Si encontrás una referencia a **Next.js, Prisma, Neon, Auth.js, shadcn/ui** (stack descartado #1) o a **AWS, SST, Lambda, CloudFront, DynamoDB, ElectroDB, single-table, GSI, argon2, JWT propio** (stack descartado #2) → es residuo. Corregila y avisá.
6. Si vas a escribir una query de usuario, verificá que use el cliente con el JWT del usuario y **no** la `service_role` (§4).
7. No reabrir decisiones de §2 sin plantearlo explícitamente al dueño del repo.
