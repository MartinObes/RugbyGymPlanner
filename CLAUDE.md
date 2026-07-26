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
3. **Este repo** — la app definitiva: **Next.js full-stack** (frontend + backend en uno).

---

## 2. Decisiones tomadas (NO reabrir sin causa fuerte)

| Tema | Decisión | Por qué |
|---|---|---|
| Stack | Next.js 14+ App Router, TypeScript estricto | Un solo stack, un solo deploy |
| Backend | Server Actions + Server Components (Route Handlers solo para HTTP puro, ej. webhooks) | Seguro por diseño, menos plumbing |
| DB | **PostgreSQL en Neon** | Free tier, cero mantenimiento, cercano a Vercel |
| ORM | **Prisma** | Schema declarativo, migraciones, ecosistema Next |
| Auth | **Auth.js (NextAuth) Credentials** + cookie httpOnly + hash con **argon2** | Nada de localStorage ni JWT casero |
| Identidad | Email + contraseña. El código de invitación del coach es solo para vincular jugadores, **no** es la identidad | Reemplaza el código de 4 chars del prototipo |
| Validación | **Zod** en todos los bordes (server actions, forms, imports) | Una sola fuente de schemas |
| Forms | react-hook-form + zodResolver | Form dinámico de programas lo exige |
| UI | Tailwind v4 + shadcn/ui + lucide-react | Continuidad visual con lo anterior |
| Excel | SheetJS **cliente-side** | Igual que el prototipo; parsers son funciones puras |
| Data fetching | Server Components + Prisma directo; TanStack Query solo si hace falta refetch/optimistic | No agregar capas por costumbre |
| Package manager | **pnpm** | Estándar de facto |
| Escala objetivo | ~300 usuarios máximo | No optimizar prematuramente; sí diseñar bien el modelo |
| Posiciones | **Las 8 de rugby, fijas** (opción A) | Validado en prototipo; granularidad fina (pilar/hooker) se agrega después si un coach lo pide |
| Grupos system | Forwards/Backs **globales** (`coachId=null, isSystem=true`), seedeados una vez | Menos duplicación |
| Deploy | Vercel + Neon. Seed apagado en producción | |

**Fuera del MVP (deliberado, no olvidado):** push notifications, PWA, multi-deporte configurable, Realtime, compare de evaluaciones, impersonate de admin.

---

## 3. Modelo de dominio

### Entidades

- **User** (`id, email único, passwordHash, role, name`) — roles: `PLAYER | COACH | ADMIN`.
- **CoachProfile** (`userId, inviteCode?`) — el invite code vincula jugadores al registrarse.
- **PlayerProfile** (`userId, coachId, positionId?, height?, weight?`).
- **Position** — las 8 fijas: Primera Línea, Segunda Línea, Tercera Línea, Medio Scrum (FORWARD); Apertura, Centro, Wing, Fullback (BACK). Seedeadas, ids estables tipo slug (`"primera-linea"`).
- **PositionGroup** (`coachId?, name, isSystem`) — Forwards y Backs son system/globales; los custom pertenecen a un coach y combinan cualquiera de las 8 posiciones vía **PositionOnGroup** (tabla puente).
- **Exercise** — catálogo global (~48 seedeados del WorkoutPlanner). Tiene **`normalizedName`** (lowercase, sin acentos, indexado) para el matching de 1RM y "última vez".
- **OneRM** (`playerId, exerciseId, kg, updatedAt`) — el 1RM vigente que carga el jugador o el coach.
- **Evaluation** (`playerId, exerciseId, date, reps, weight`) — historial de tests de fuerza.
- **Program** (`coachId, name, currentWeekId?`) → **Week** (`name, order`) → **Day** (`name, order`) → **Block** (`type: SINGLE|CIRCUIT, rounds, order`) → **BlockExercise** (`exerciseId, sets, reps, loadType: WEIGHT|PERCENTAGE|NONE, weight?, percentage?, targetRpe?, note, order`).
- **ProgramAssignment** (`programId` + exactamente UNO de `playerId | positionId | positionGroupId`, más `priority`).
- **SessionLog** (`playerId, dayId, completedAt?, dayNote`) → **ExerciseEntry** (`blockExerciseId, weight, reps, rpe, done`).

### Reglas de negocio críticas

**Resolución del programa activo de un jugador** (reemplaza al `playerProgram()` del prototipo — individual pisa grupo pisa puesto):

1. Assignment a PLAYER → prioridad base 100
2. Assignment a POSITION_GROUP custom que contiene su posición → 50
3. Assignment a POSITION_GROUP system (Forwards/Backs) → 30
4. Assignment a POSITION → 10

Gana la mayor (base + `priority` override). Empate: `createdAt` más reciente. Esta lógica vive en **un solo lugar** (`lib/domain/resolveProgram.ts` o equivalente) y tiene tests.

**Cálculo de carga** (el WorkoutProcessor, portado de .NET): si `loadType=PERCENTAGE`, buscar el OneRM del jugador para ese ejercicio (match por `normalizedName`, tolerante a inclusión parcial como en `rmFor` del prototipo) y calcular `round(percentage/100 * kg * 2) / 2` (redondeo a 0.5 kg como el prototipo). Sin 1RM → mostrar el % con aviso "falta tu 1RM de X". `WEIGHT` → kg fijo. `NONE` → sin carga.

**"Última vez" (`lastPerf`)**: último `ExerciseEntry` del jugador para el mismo ejercicio (por `normalizedName`) en días anteriores, mostrando "Semana X · Día: NN kg · N reps · RPE N".

**Coherencia LoadType**: `WEIGHT` exige `weight`, `PERCENTAGE` exige `percentage` (1–100), `NONE` no lleva ninguno. Validado en Zod, no solo en la UI.

---

## 4. RBAC — seguridad en 4 capas (TODAS obligatorias)

1. **`middleware.ts`** — guard grueso por prefijo de ruta (`/coach/*`, `/player/*`, `/admin/*`). No es suficiente por sí solo.
2. **`requireRole([...])`** — primera línea de **toda** server action. Sin excepciones: una action sin guard es un endpoint público.
3. **Scoping en queries** — toda query de datos de negocio pasa por helpers de scope (ej. `scopedPlayers(session)`): COACH solo ve `coachId = session.userId`, PLAYER solo lo suyo, ADMIN todo. Recurso ajeno → **404, nunca 403** (no revelar existencia).
4. **Server Components** — renderizan según permisos (`can(session, acción, recurso)`); la UI nunca muestra acciones que la capa 2/3 va a rechazar.

Matriz resumida: PLAYER ve/edita su perfil, su programa resuelto y sus logs. COACH gestiona su plantel, sus programas, assignments y grupos custom. ADMIN todo + posiciones/grupos system + CRUD del catálogo de ejercicios. **ADMIN no se autoregistra**: solo por seed o CLI.

---

## 5. Prácticas de desarrollo

### Estructura (App Router)

```
app/
  (public)/login, register
  (app)/coach/...      # panel coach (plantel, posiciones, grupos, programas)
  (app)/player/...     # mi semana, mi perfil, registro
  (app)/admin/...
lib/
  domain/              # lógica pura: resolveProgram, calcLoad, lastPerf, normName, parsers
  db.ts                # singleton Prisma
  auth.ts              # config Auth.js + helpers requireRole/can/scoped*
  validators/          # schemas Zod por entidad
prisma/
  schema.prisma, seed.ts, migrations/
components/            # UI compartida (shadcn en components/ui)
```

### Reglas de código

- **Lógica de dominio = funciones puras en `lib/domain/`**, sin Prisma ni React adentro. Son lo que se testea primero (resolveProgram, calcLoad, lastPerf, parseGrid, parseText, normName).
- **Zod es la única validación.** El schema Zod deriva el tipo (`z.infer`); no duplicar interfaces a mano. Server actions validan input con Zod ANTES de tocar la DB.
- **Nunca confiar en el cliente**: ids, roles y ownership se verifican server-side siempre.
- **Migraciones siempre** (`pnpm prisma migrate dev --name descripcion`), nunca `db push` fuera de experimentos locales descartables.
- **Textos de UI en español** (es-UY como el prototipo). Código, commits e identificadores en inglés.
- La grafía `Excercise` (doble c) del proyecto .NET **NO se hereda**: acá es `Exercise` en todos lados.
- Errores de server actions: devolver `{ ok: false, error: string }` tipado, no lanzar excepciones crudas a la UI.
- No agregar dependencias sin justificarlo contra la tabla de decisiones (§2).

### Tests

- **Prioridad 1**: unit tests de `lib/domain/` (Vitest). Cobertura completa de resolveProgram (los 4 niveles + empates), calcLoad (3 loadTypes, sin 1RM, redondeo 0.5), parsers de Excel/texto con planillas reales de ejemplo, normName con acentos.
- **Prioridad 2**: tests de scoping RBAC (que un coach no vea plantel ajeno, que 404 ≠ 403).
- E2E (Playwright) recién cuando el flujo coach→jugador→log esté completo.

### Flujo de trabajo

- Ramas `feature/<nombre>` desde `main`. Commits chicos con mensaje imperativo en inglés.
- Antes de dar por terminada una feature: `pnpm lint && pnpm typecheck && pnpm test`.
- Si una decisión de §2 o §3 cambia, **actualizar este archivo en el mismo PR**.

### Levantar el proyecto

```bash
pnpm install
cp .env.example .env.local        # DATABASE_URL de Neon, AUTH_SECRET
pnpm prisma migrate dev
pnpm prisma db seed               # 8 posiciones, Forwards/Backs, ~48 ejercicios, admin
pnpm dev                          # http://localhost:3000
```

Usuarios seed (solo dev): admin definido en seed; coach/jugador demo se crean por UI.

---

## 6. Roadmap y estado

Marcar `[x]` al completar cada fase. Al iniciar sesión de trabajo, buscar la primera fase incompleta.

- [ ] **F0 — Setup**: proyecto Next + Prisma + schema completo + Neon + Auth.js/argon2 + seed.
- [ ] **F1 — Auth y shell**: registro/login, middleware, layout con sidebar, vínculo jugador↔coach por invite code.
- [ ] **F2 — Panel coach**: plantel, grupos custom, editor de programas (semanas/días/bloques/ejercicios, 3 modos de carga, RPE objetivo, autosave con debounce), assignments con prioridad, **import Excel/texto**.
- [ ] **F3 — Panel jugador**: perfil (puesto, altura, peso, 1RM con typeahead), Mi semana con kg calculados y "última vez", registro de peso/reps/RPE/nota, completar día.
- [ ] **F4 — Loop de feedback + deploy**: vista coach con progreso "2/3 días" y RPE objetivo vs. percibido con notas; deploy Vercel + Neon; seed off en prod.

---

## 7. Al iniciar una sesión de trabajo

1. Leer este archivo entero.
2. Ver estado del roadmap (§6) y el último commit para ubicar dónde quedó el trabajo.
3. Si la tarea toca comportamiento de producto y hay duda → consultar `coach.html` / `README-CoachLab.md` como espec.
4. Si la tarea toca el contrato de datos → el schema Prisma manda; cambios de schema requieren migración + actualizar §3 si cambia el dominio.
5. No reabrir decisiones de §2 sin plantearlo explícitamente al dueño del repo.
