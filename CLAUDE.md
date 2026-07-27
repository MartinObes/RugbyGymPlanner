# CoachLab — Contexto maestro del proyecto

> **Leé este archivo completo antes de tocar código.** Es la fuente de verdad sobre qué es el proyecto, qué decisiones ya están tomadas y qué prácticas se siguen. Si algo acá contradice código existente, este archivo manda (y hay que corregir el código o actualizar este archivo, nunca ignorar la diferencia en silencio).

---

## 1. Qué es CoachLab

App para entrenadores de rugby (extensible a otros deportes) que arma la rutina de fuerza del plantel y recibe lo que cada jugador realmente hizo.

**El loop de producto:** el coach define programas por mesociclo (semanas → días → bloques → ejercicios) con cargas en kg, % del 1RM o sin peso, y un RPE objetivo por ejercicio. Cada jugador ve su rutina con los **kg ya calculados según su 1RM personal** ("80% → 112 kg"), registra lo que hizo (peso real, reps, RPE percibido, nota del día) y al completar el día eso le llega al coach. Comparar RPE objetivo vs. percibido junto con la nota es **el dato clave del producto** para ajustar cargas.

**Diferencial:** un solo plan en % escala a todo el plantel con cargas personalizadas por jugador.

### Historia y fuentes de verdad

Este repo es la **tercera encarnación** del producto. Referencias (no se portan, se consultan):

1. **`coach.html` + `README-CoachLab.md`** — prototipo funcional en un solo HTML (vanilla JS + SheetJS). Es la **especificación funcional validada**: si hay duda sobre cómo debe comportarse una feature, la respuesta está ahí. Funciones portables casi verbatim: `parseGrid`/`parseText` (import Excel/texto), `normName` (matching tolerante a acentos), lógica de `weightLabel` y `lastPerf`.
2. **`NEXTJS_APP_CONTEXT.md`** — análisis del intento anterior (backend .NET 9 + Angular 21, repo WorkoutPlannerApp). De ahí se reutiliza **diseño, no código**: el algoritmo del WorkoutProcessor, el modelo Evaluation, el catálogo de ~48 ejercicios del seeder, y los patrones de UX (form dinámico por LoadType, typeahead de ejercicios).
3. **Este repo** — la app definitiva: **serverless en AWS, Nuxt + Hono + DynamoDB**.

> ⚠ **Los tres archivos de referencia todavía no están en el repo.** Mientras falten, `spec-navigator` no tiene qué leer, y todo lo que dependa del formato exacto del prototipo (import Excel/texto, catálogo de ejercicios) va marcado como pendiente de validación en vez de inventado.

### Historial de stack

El proyecto tuvo una definición de stack anterior que **quedó descartada**: Next.js App Router + Server Actions + Prisma + PostgreSQL/Neon + Auth.js + shadcn/ui + Vercel. Si encontrás código, docs o comentarios que mencionen cualquiera de esas piezas, están desactualizados y hay que corregirlos. El stack vigente es el de §2.

---

## 2. Decisiones tomadas (NO reabrir sin causa fuerte)

| Tema | Decisión | Por qué |
|---|---|---|
| Infra | **AWS serverless**: CloudFront → Lambda (Nuxt SSR) + Lambda (API) → DynamoDB | Costo casi nulo en reposo, escala sola |
| IaC | **SST v3**, definida en TypeScript | Un solo lenguaje de la infra al frontend |
| Frontend | **Nuxt 4 en modo SSR** sobre Lambda + **Vue 3** + **Nuxt UI** | SSR permite leer la cookie de sesión en el server y renderizar según rol |
| Backend | **Hono** sobre runtime Node.js en Lambda | Router mínimo y tipado, cold start bajo |
| DB | **DynamoDB, single-table design** | Serverless de verdad: sin conexiones, sin pooler, sin mantenimiento |
| Acceso a datos | **ElectroDB** | Modela entidades e índices sobre la tabla única sin escribir claves a mano |
| Contrato API | Zod → **`@hono/zod-openapi`** → spec OpenAPI → **hey-api** genera el cliente TS que consume Nuxt | Una sola definición: el schema Zod es la validación *y* el contrato |
| Auth | **JWT propio emitido por la API**, cookie httpOnly + Secure + SameSite=Lax; hash con **`@node-rs/argon2`** | Sin infra nueva; el User es un item más de la tabla. Nada de localStorage |
| Identidad | Email + contraseña. El código de invitación del coach sirve solo para vincular jugadores, **no** es la identidad | Reemplaza el código de 4 chars del prototipo |
| Validación | **Zod** en todos los bordes (rutas de la API, forms, imports) | Una sola fuente de schemas |
| Forms | `UForm` de Nuxt UI con resolver de Zod | Reusa los mismos schemas que la API |
| Excel | SheetJS **client-side** | Igual que el prototipo; los parsers son funciones puras |
| Monorepo | pnpm workspaces: `packages/core`, `packages/api`, `packages/web`, `infra/` | El dominio se comparte entre API y frontend |
| Package manager | **pnpm** | Estándar de facto |
| Escala objetivo | ~300 usuarios máximo | No optimizar prematuramente; sí diseñar bien los access patterns |
| Posiciones | **Las 8 de rugby, fijas, como constantes en código** (no van a la DB) | Son inmutables: leerlas de DynamoDB sería costo puro |
| Grupos system | Forwards/Backs también **constantes en código** | Misma razón. Los grupos custom sí viven en la tabla |
| Deploy | Stages de SST: uno personal por dev, más `production`. Seed apagado en producción | |

**Fuera del MVP (deliberado, no olvidado):** push notifications, PWA, multi-deporte configurable, tiempo real/WebSockets, compare de evaluaciones, impersonate de admin.

---

## 3. Modelo de dominio

### Constantes en código (no van a DynamoDB)

Viven en `packages/core/src/domain/positions.ts`:

- **Position** — las 8 fijas, con id slug estable: `primera-linea`, `segunda-linea`, `tercera-linea`, `medio-scrum` (FORWARD); `apertura`, `centro`, `wing`, `fullback` (BACK).
- **System groups** — `forwards` (las 4 FORWARD) y `backs` (las 4 BACK).

### Tabla única

Una sola tabla DynamoDB (`CoachLab`) con `pk` / `sk` y **dos GSI**:

- **GSI1 — "listar por padre"**: jugadores de un coach, programas de un coach, grupos custom de un coach, catálogo de ejercicios.
- **GSI2 — "assignments por destino"**: los assignments que apuntan a un jugador, a un puesto o a un grupo. Es lo que alimenta `resolveProgram`.

| Entidad | pk | sk | GSI | Notas |
|---|---|---|---|---|
| **User** | `userId` | — | GSI1: `coachId` / `userId` | Un solo item por persona: `email, passwordHash, name, role`; si COACH además `inviteCode`; si PLAYER además `coachId, positionId, heightCm, weightKg` |
| **UniqueEmail** | `email` | — | — | Apunta a `userId`. Existe para garantizar unicidad con `TransactWrite` + `attribute_not_exists`, y para el lookup de login sin pasar por un GSI |
| **UniqueInviteCode** | `inviteCode` | — | — | Apunta a `coachId`. Misma técnica |
| **Exercise** | `exerciseId` | — | GSI1: `'catalog'` / `normalizedName` | Catálogo global. `normalizedName` es la clave del matching de 1RM |
| **OneRM** | `playerId` | `exerciseId` | — | El 1RM vigente. Un query por `playerId` trae todos |
| **Evaluation** | `playerId` | `exerciseId#date` | — | Historial de tests. Sin UI en el MVP |
| **Program** | `programId` | `'meta'` | GSI1: `coachId` / `programId` | Metadata: `name, coachId, currentWeekId` |
| **Week** | `programId` | `weekId` | — | **Contiene el árbol embebido**: días → bloques → ejercicios |
| **PositionGroup** | `groupId` | — | GSI1: `coachId` / `groupId` | Solo grupos custom |
| **ProgramAssignment** | `programId` | `assignmentId` | GSI2: `targetKey` / `assignmentId` | `targetKey` es `PLAYER#<id>`, `POSITION#<slug>` o `GROUP#<id>` |
| **SessionLog** | `playerId` | `dayId` | — | **Contiene las entries embebidas**, como map indexado por `blockExerciseId` |

### Las dos decisiones de embebido

Son lo que hace que este diseño funcione. Entenderlas antes de tocar el modelo:

1. **El árbol del programa se corta en la semana.** Un item `Week` contiene sus días, bloques y ejercicios. Motivo: *el jugador siempre lee exactamente una semana* → un solo `GetItem`. Una semana de 4 días × 4 bloques × 6 ejercicios pesa ~20 KB, muy por debajo del límite de 400 KB por item. Cortar más arriba (el programa entero en un item) reventaría el límite en un mesociclo largo; cortar más abajo obligaría a un query por día.

2. **Las entries del jugador viven dentro del `SessionLog`.** Se leen y se escriben siempre juntas.

Los niveles embebidos se guardan como **maps indexados por id, no como arrays**, con un campo `order` adentro:

```ts
days: { [dayId]: { name, order, blocks: { [blockId]: { type, rounds, order, exercises: { [beId]: {…} } } } } }
```

Así el autosave del editor actualiza una ruta estable (`SET days.#d.blocks.#b.exercises.#e.percentage = :v`) sin que se corran los índices al agregar o borrar hermanos. **El orden nunca sale del orden de las claves del map: siempre se ordena por el campo `order` en código.**

### Reglas de negocio críticas

**Resolución del programa activo de un jugador** (reemplaza al `playerProgram()` del prototipo — individual pisa grupo pisa puesto):

1. Assignment a PLAYER → prioridad base 100
2. Assignment a POSITION_GROUP custom que contiene su posición → 50
3. Assignment a POSITION_GROUP system (Forwards/Backs) → 30
4. Assignment a POSITION → 10

Gana la mayor (base + `priority` override). Empate: `createdAt` más reciente. Esta lógica vive en **un solo lugar** (`packages/core/src/domain/resolveProgram.ts`) y tiene tests.

La query que la alimenta consulta GSI2 con hasta 4 `targetKey`: el del jugador, el de su puesto, el del grupo system que le corresponde y el de cada grupo custom que contiene su puesto.

**Cálculo de carga** (el WorkoutProcessor, portado de .NET): si `loadType=PERCENTAGE`, buscar el OneRM del jugador para ese ejercicio (match por `normalizedName`, tolerante a inclusión parcial como en `rmFor` del prototipo) y calcular `round(percentage/100 * kg * 2) / 2` (redondeo a 0.5 kg como el prototipo). Sin 1RM → mostrar el % con aviso "falta tu 1RM de X". `WEIGHT` → kg fijo. `NONE` → sin carga.

**"Última vez" (`lastPerf`)**: último `ExerciseEntry` del jugador para el mismo ejercicio (por `normalizedName`) en días anteriores, mostrando "Semana X · Día: NN kg · N reps · RPE N". Se resuelve leyendo los `SessionLog` del jugador (query por `pk = playerId`) y filtrando en memoria: son decenas de items, no miles.

**Coherencia LoadType**: `WEIGHT` exige `weight`, `PERCENTAGE` exige `percentage` (1–100), `NONE` no lleva ninguno. Validado en Zod, no solo en la UI.

**Assignment con un solo destino**: exactamente uno de `playerId | positionId | positionGroupId`. En DynamoDB no hay CHECK constraints; lo garantizan Zod en el borde de la API **y** el hecho de que `targetKey` se deriva de un único destino.

---

## 4. RBAC — seguridad en 4 capas (TODAS obligatorias)

1. **Agrupación de rutas en Hono** — `/coach/*`, `/player/*` y `/admin/*` son sub-apps con el middleware de rol montado en el grupo. No alcanza por sí solo, pero garantiza que ninguna ruta nueva nazca sin guard.
2. **`requireRole([...])`** — middleware de Hono, primera línea de **toda** ruta que toque datos. Sin excepciones: una ruta sin guard es un endpoint público.
3. **Scoping en el acceso a datos** — toda lectura o escritura de negocio pasa por helpers de scope (`scopedPlayer`, `scopedProgram`, …) que resuelven ownership contra el actor. Recurso ajeno → **404, nunca 403** (no revelar existencia).
4. **Nuxt** — el middleware de ruta del frontend redirige por rol y los componentes no muestran acciones que la capa 2/3 va a rechazar. **Esto es UX, no seguridad**: la API igual tiene que rechazar.

Matriz resumida: PLAYER ve/edita su perfil, su programa resuelto y sus logs. COACH gestiona su plantel, sus programas, assignments y grupos custom. ADMIN todo + CRUD del catálogo de ejercicios. **ADMIN no se autoregistra**: solo por seed o CLI.

**El JWT** se firma con un secreto guardado en SST Secret, lleva `sub` (userId) y `role`, dura 30 días y viaja en cookie httpOnly / Secure / SameSite=Lax. El rol del token sirve para el guard grueso; **cualquier decisión sobre un dato concreto revalida contra la tabla**, porque el rol pudo cambiar después de emitido el token.

---

## 5. Prácticas de desarrollo

### Estructura del monorepo

```
sst.config.ts
infra/
  storage.ts           # tabla DynamoDB + índices
  api.ts               # Lambda de la API + ruta en el Router
  web.ts               # Nuxt SSR en Lambda
  secrets.ts           # JWT secret, etc.
packages/
  core/                # compartido entre API y web. Sin dependencias de AWS ni de Vue
    src/
      domain/          # lógica PURA: resolveProgram, calcLoad, rmFor, lastPerf,
                       # buildPlayerDay, rpeDelta, normName, parseGrid, parseText, positions
      entities/        # ElectroDB: entidades + Service. Único lugar que conoce las claves
      access/          # scope y permisos: requireRole, can, scopedPlayer, scopedProgram
      validators/      # schemas Zod por entidad — también son el contrato OpenAPI
  api/
    src/
      index.ts         # app Hono + handler de Lambda
      routes/          # un archivo por recurso (auth, players, programs, session…)
      middleware/      # auth, requireRole, manejo de errores
  web/                 # Nuxt 4 — el router SALE de los directorios, no se declara
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
      plugins/         # api.ts — reenvía la cookie al cliente generado en SSR
    nuxt.config.ts
    generated/         # cliente TS de hey-api — NO se edita a mano.
                       # Vive fuera de app/ para que no entre al auto-import;
                       # se importa explícito con el alias `~~/generated`.
```

**Regla de nombres de página** (Nuxt la aplica en silencio y muerde): si existe `x.vue` **y** el
directorio `x/`, entonces `x.vue` pasa a ser el componente *padre* de esas rutas y sus hijos no se
renderizan hasta que el padre incluya `<NuxtPage />`.

- Vistas que **no** comparten estado ni encabezado (listado y detalle de plantel) → hermanas:
  `players/index.vue` + `players/[playerId].vue`.
- Vistas que **sí** lo comparten (editor, asignaciones e import de un programa cargan el mismo
  programa y muestran los mismos tabs) → anidadas a propósito: `[programId].vue` como padre.

### Reglas de código

- **Lógica de dominio = funciones puras en `packages/core/src/domain/`**, sin ElectroDB, sin Hono, sin Vue, sin `process.env`. Son lo que se testea primero (resolveProgram, calcLoad, rmFor, lastPerf, buildPlayerDay, rpeDelta, parseGrid, parseText, normName).
- **Solo `packages/core/src/entities/` conoce las claves de DynamoDB.** Ni las rutas ni el frontend arman `pk`/`sk` a mano.
- **Zod es la única validación.** El schema Zod deriva el tipo (`z.infer`); no duplicar interfaces a mano. Las rutas validan input con Zod ANTES de tocar la DB, y ese mismo schema es el que exporta el OpenAPI.
- **El cliente en `packages/web/generated/` se regenera, no se edita.** Si el contrato cambió, cambió el schema Zod de la ruta.
- **Nunca confiar en el cliente**: ids, roles y ownership se verifican en la API siempre.
- **Textos de UI en español** (es-UY, registro "vos" como el prototipo: "Poné un nombre", "Elegí tu puesto"). Código, commits e identificadores en inglés.
- La grafía `Excercise` (doble c) del proyecto .NET **NO se hereda**: acá es `Exercise` en todos lados.
- Errores de la API: respuesta tipada `{ ok: false, error: string }` con el status correcto, no excepciones crudas.
- No agregar dependencias sin justificarlo contra la tabla de decisiones (§2).

### Tests

- **Prioridad 1**: unit tests de `packages/core/src/domain/` (Vitest). Cobertura completa de resolveProgram (los 4 niveles + empates), calcLoad (3 loadTypes, sin 1RM, redondeo 0.5), parsers de Excel/texto con planillas reales de ejemplo, normName con acentos.
- **Prioridad 2**: tests de rutas de la API con scoping RBAC (que un coach no vea plantel ajeno, que 404 ≠ 403). Hono se testea con `app.request()` sin levantar servidor.
- E2E (Playwright) recién cuando el flujo coach→jugador→log esté completo.

### Flujo de trabajo

- Ramas `feature/<nombre>` desde `main`. Commits chicos con mensaje imperativo en inglés.
- Antes de dar por terminada una feature: `pnpm lint && pnpm typecheck && pnpm test`.
- Si una decisión de §2 o §3 cambia, **actualizar este archivo en el mismo PR**.

### Levantar el proyecto

```bash
pnpm install
npx sst secret set JwtSecret "<algo largo y aleatorio>"
pnpm sst dev                      # tabla, API y Nuxt en modo live contra tu stage personal
pnpm seed                         # catálogo de ejercicios + admin (nunca en production)
```

`sst dev` corre las Lambdas localmente contra recursos reales de tu stage. No hay docker ni base local que administrar.

---

## 6. Roadmap y estado

Marcar `[x]` al completar cada fase. Al iniciar sesión de trabajo, buscar la primera fase incompleta.
Los planes detallados de cada fase están en `docs/superpowers/plans/`.

- [ ] **F0 — Setup**: monorepo pnpm + SST, tabla DynamoDB, entidades ElectroDB, Hono con OpenAPI, Nuxt SSR, funciones puras de dominio con tests, deploy al stage personal.
- [ ] **F1 — Auth y shell**: registro/login con JWT en cookie, middleware de rol en Hono, guards de ruta en Nuxt, layout con sidebar, vínculo jugador↔coach por invite code.
- [ ] **F2 — Panel coach**: plantel, grupos custom, editor de programas (semanas/días/bloques/ejercicios, 3 modos de carga, RPE objetivo, autosave con debounce), assignments con prioridad, **import Excel/texto**.
- [ ] **F3 — Panel jugador**: perfil (puesto, altura, peso, 1RM con typeahead), Mi semana con kg calculados y "última vez", registro de peso/reps/RPE/nota, completar día.
- [ ] **F4 — Loop de feedback + deploy**: vista coach con progreso "2/3 días" y RPE objetivo vs. percibido con notas; stage `production`; seed off en prod.

---

## 7. Al iniciar una sesión de trabajo

1. Leer este archivo entero.
2. Ver estado del roadmap (§6) y el último commit para ubicar dónde quedó el trabajo.
3. Si la tarea toca comportamiento de producto y hay duda → consultar `coach.html` / `README-CoachLab.md` como espec (mientras falten, decirlo en vez de inventar).
4. Si la tarea toca el contrato de datos → `packages/core/src/entities/` manda; cambiar un access pattern obliga a revisar los índices en `infra/storage.ts` y actualizar §3.
5. Si encontrás una referencia a Next.js, Prisma, PostgreSQL, Neon, Auth.js, shadcn/ui o Vercel → es residuo del stack descartado. Corregila y avisá.
6. No reabrir decisiones de §2 sin plantearlo explícitamente al dueño del repo.
