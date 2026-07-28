# F0 — Qué se implementó, dónde y por qué

> Registro de lo que efectivamente se hizo en la sesión del **2026-07-27**. El plan original
> (`docs/superpowers/plans/2026-07-27-f0-setup.md`) quedó obsoleto a mitad de camino porque cambió el
> stack; este archivo es el registro real. La fuente de verdad de las decisiones sigue siendo
> `CLAUDE.md`.

---

## 1. Resumen

F0 está **implementado y verificado localmente**. Lo que falta no es código: son dos cuentas gratuitas
(Supabase y Vercel) que solo vos podés crear. El detalle está en §6.

| | Estado |
|---|---|
| Monorepo pnpm con 3 paquetes | ✅ funcionando |
| 4 funciones puras de dominio + 34 tests | ✅ verde |
| Schema Postgres completo con RLS | ✅ escrito, ⏸ sin aplicar (falta proyecto Supabase) |
| API Hono con OpenAPI | ✅ funcionando, 4 tests verdes |
| Cliente TS generado desde el contrato | ✅ generado offline |
| Nuxt SSR con la API montada en Nitro | ✅ verificado por HTTP real |
| Build para Vercel | ✅ completa |
| Seed | ✅ escrito, ⏸ sin correr |

Verificación al cierre: `pnpm -r test` → **38 tests en verde**; `pnpm -r typecheck` → los 3 paquetes en
`Done`; `nuxt build` → `Build complete`.

---

## 2. El cambio de stack

A mitad de F0 se descartó **AWS + DynamoDB + ElectroDB + JWT propio** y se pasó a
**Supabase + Vercel**. Las razones completas están en `CLAUDE.md` §1; en corto:

1. El dominio es relacional y el single-table design obligaba a embeber el árbol del programa y a
   resolver prioridades en memoria.
2. DynamoDB no puede expresar las reglas del dominio: sin `CHECK` constraints, la coherencia de
   `LoadType` y el "exactamente un destino" quedaban solo en Zod.
3. La auth había que escribirla entera. Supabase la trae incluida.

Además apareció un problema concreto durante la implementación: **ElectroDB 3.9.1 no soporta índices
sparse por atributo ausente.** Se verificó empíricamente que un COACH escribía siempre
`gsi1pk = "$coachlab#coachid_"`, metiendo a todos los coaches en una partición vacía, y que el callback
`condition` no lo resuelve porque exige que el composite esté presente en toda escritura. No fue la
razón del cambio — era un problema chico — pero confirmó que el modelado estaba a contrapelo.

**Qué sobrevivió:** todo `packages/core/src/domain/` y sus 34 tests. Nunca dependieron de la base.

**Qué se borró:** `packages/core/src/entities/` (5 archivos ElectroDB), `infra/` (SST) y `sst.config.ts`.

---

## 3. Mapa de archivos

### Lógica de dominio — `packages/core/src/domain/`

Funciones puras, sin Supabase, sin Hono, sin Vue. Son lo primero que se testea.

| Archivo | Qué hace |
|---|---|
| `normName.ts` | Normaliza nombres para matching tolerante: minúsculas, sin acentos, espacios colapsados. **Preserva la ñ** reconstruyendo el U+0303 cuando va sobre una n |
| `positions.ts` | Las 8 posiciones y los 2 grupos system como constantes, más `positionById`, `isPositionId`, `systemGroupForPosition` |
| `calcLoad.ts` | El WorkoutProcessor: `WEIGHT` → kg fijos, `PERCENTAGE` → `roundToHalf(% × 1RM)`, `NONE` → sin carga. Sin 1RM devuelve `missing-1rm` con el aviso, no un error |
| `rmFor.ts` | Busca el 1RM de un ejercicio: exacto primero, después inclusión en cualquier dirección ganando la coincidencia más larga |

Cada uno con su `.test.ts` al lado. **34 tests.**

Desviación menor respecto al plan: `normName` compara en minúsculas al decidir si preserva la tilde,
así `"AÑO"` conserva la ñ igual que `"año"`. El plan solo cubría el caso en minúsculas.

### Base de datos — `supabase/migrations/`

| Archivo | Qué contiene |
|---|---|
| `0001_initial_schema.sql` | 14 tablas, 4 dominios de texto, índices y los `CHECK` que expresan las reglas del dominio |
| `0002_auth_and_profile_guards.sql` | Generación del invite code, trigger que crea el `profile` al registrarse, y el guard que impide escalar privilegios |
| `0003_rls_policies.sql` | 8 funciones helper + RLS habilitada en las 14 tablas con sus políticas |

**Lo que gana Postgres sobre el diseño anterior**, y que vale la pena leer en el SQL:

- **Coherencia de `LoadType`** (`0001`, tabla `block_exercises`): un `CHECK` garantiza que `WEIGHT`
  lleve `weight`, `PERCENTAGE` lleve `percentage` entre 1 y 100, y `NONE` no lleve ninguno. En
  DynamoDB esto solo lo miraba Zod.
- **Assignment con un solo destino** (`0001`, tabla `program_assignments`):
  `num_nonnulls(player_id, position_group_id, system_group_id, position_id) = 1`. Antes dependía de que
  Zod y la derivación de `targetKey` estuvieran de acuerdo.
- **El árbol del programa no se embebe**: `weeks → days → blocks → block_exercises`, una tabla por
  nivel con `ON DELETE CASCADE`. Se lee en un request con selects anidados de PostgREST.
- **Unicidad de email e invite code**: la del email la da `auth.users`; la del invite code, un `UNIQUE`.
  Desaparecieron las dos tablas de items de unicidad que DynamoDB necesitaba.

**Tres decisiones de seguridad que conviene entender antes de tocar el SQL:**

1. **Los helpers de RLS son `SECURITY DEFINER` a propósito.** Una política sobre `profiles` que consulte
   `profiles` se llamaría a sí misma para siempre. Al correr como definer leen sin pasar por RLS y
   cortan la recursión.
2. **ADMIN no se autoregistra.** Si alguien manda `role: 'ADMIN'` en el signup, el trigger
   `handle_new_user` lo da de alta como `PLAYER`. Solo el seed promueve.
3. **RLS decide filas, no columnas.** Sin el trigger `guard_profile_changes`, un jugador con permiso de
   editar su perfil podría hacer `role = 'ADMIN'` con un PATCH. Ese trigger bloquea el cambio de `role`,
   `invite_code` y el cambio de coach una vez vinculado.

### API — `packages/api/`

| Archivo | Qué hace |
|---|---|
| `src/app.ts` | App `OpenAPIHono` con `basePath('/api')`, manejo de errores tipado y el endpoint `/api/openapi.json` |
| `src/routes/health.ts` | `GET /api/health`. **Toca Postgres de verdad**, no responde desde Nitro |
| `src/db/client.ts` | `createUserClient(token)` y `createAnonClient()`. **No exporta ningún cliente con `service_role`** |
| `src/app.test.ts` | 4 tests con `app.request()`, sin levantar servidor |

`/health` hace una query real a `exercises` porque es el endpoint que UptimeRobot va a golpear cada 5
minutos para que el proyecto de Supabase no se pause por inactividad (`CLAUDE.md` §2). Sin sesión el rol
es `anon` y RLS no devuelve filas — da igual, lo que importa es que la consulta llegó a Postgres.
Reporta `db: 'ok' | 'error' | 'unconfigured'` y **nunca tira 500**: si falta configuración hay que poder
verlo, no que se caiga.

`db/client.ts` no exporta un cliente con `service_role` por diseño, con el comentario que explica que si
alguna vez hace falta dentro de una ruta, la respuesta casi siempre es que falta una política de RLS.

### Frontend — `packages/web/`

| Archivo | Qué hace |
|---|---|
| `nuxt.config.ts` | SSR activo, `@nuxt/ui`, preset `vercel` |
| `server/api/[...].ts` | **El seam**: Nitro captura todo `/api` y se lo pasa a la app Hono |
| `app/pages/index.vue` | Página de humo: muestra el `service` y el estado de la base leídos de la API |
| `openapi-ts.config.ts` | Configuración de hey-api |
| `generated/` | Cliente TS generado. **No se edita a mano** |
| `.env.example` | Las dos variables que hay que completar |

### Scripts — `scripts/`

| Archivo | Qué hace |
|---|---|
| `dump-openapi.ts` | Corre la app Hono en memoria y escribe `packages/web/openapi.json` |
| `seed.ts` | Catálogo de 24 ejercicios (idempotente por `normalized_name`) + admin |

`dump-openapi.ts` es una **mejora sobre el plan original**, que pedía desplegar la API y apuntar hey-api
a la URL pública. Corriendo la app en memoria el cliente tipado se regenera offline y en CI, sin
desplegar nada.

`seed.ts` es **el único lugar del repo donde aparece la `service_role` key**, y está permitido porque
corre a mano fuera de todo request. Necesita saltear RLS: crea el catálogo global y promueve a ADMIN,
dos cosas que ninguna política le deja hacer a un usuario.

---

## 4. La cadena del contrato, verificada de punta a punta

Esto es lo que más vale de la arquitectura y quedó funcionando:

```
Zod schema en routes/health.ts
  → @hono/zod-openapi genera el spec
  → pnpm dump:openapi lo escribe a packages/web/openapi.json
  → hey-api genera packages/web/generated/{types,sdk,client}.gen.ts
  → app/pages/index.vue importa HealthResponse de ~~/generated
```

Si cambiás el schema Zod de una ruta y no regenerás, **el frontend deja de compilar**. Ese es el punto.

Comprobado: `pnpm dump:openapi` → `1 path(s): /api/health`; el cliente generado expone `getApiHealth()`
tipada; la página consume `HealthResponse` y `nuxt typecheck` pasa.

---

## 5. Problemas que aparecieron y cómo se resolvieron

Vale documentarlos porque ninguno es obvio y los tres van a volver.

**1. `Resource.CoachLab.name` evaluado en el top-level** *(del stack viejo, ya no aplica)*
El plan ponía el nombre de la tabla en el módulo de configuración de ElectroDB, lo que hacía explotar
cualquier test que importara una entidad sin SST corriendo. Se resolvió con un `try/catch` y un fallback.
Queda anotado porque el patrón se repite: **nada que se evalúe al importar un módulo puede depender de
que exista el entorno de producción.**

**2. ElectroDB no puede hacer índices sparse** *(del stack viejo, ya no aplica)*
Descrito en §2. Se verificó empíricamente antes de concluir nada.

**3. Dos versiones de h3 en el árbol** ⚠ **este sí sigue vigente**
Nuxt 4 usa **h3 1.15.11** en runtime, pero el árbol también tiene **h3 2.0.1-rc** como dependencia
transitiva. El auto-import de Nitro resolvía `toWebRequest` a la v2, que ya no lo exporta, y **todos los
requests a la API morían** con un error de módulo. Peor: el primer intento de arreglarlo con la API de
h3 v2 (`event.req`) hizo que Hono recibiera un path relativo en vez de una URL absoluta, y su router
mandó todo al 404 sin ningún error visible.

La solución está en `packages/web/server/api/[...].ts`: **h3 fijado en el `package.json` de `web` e
importado explícitamente**, en vez de confiar en el auto-import. Si algún día los requests a `/api`
empiezan a dar 404 sin motivo, mirar acá primero.

---

## 6. Qué falta y cómo terminarlo

Nada de esto es código: son cuentas que solo vos podés crear. Ninguna pide tarjeta.

### 6.1. Crear el proyecto de Supabase

1. Crear cuenta y proyecto en supabase.com (región más cercana: `sa-east-1`, São Paulo).
2. Project Settings → API → copiar `Project URL` y la `anon public` key.
3. `cp packages/web/.env.example packages/web/.env` y completar las dos variables.

### 6.2. Aplicar el schema

```powershell
pnpm supabase login
pnpm supabase link --project-ref <tu-project-ref>
pnpm supabase db push
```

Esto aplica las tres migraciones. **Todavía no se corrió contra una base real**: es el primer paso donde
puede aparecer un error de SQL, y es esperable que haya que ajustar algo.

### 6.3. Regenerar los tipos del schema

```powershell
$env:SUPABASE_PROJECT_ID="<tu-project-ref>"; pnpm gen:types
```

Escribe `packages/web/types/database.ts`. Ese archivo todavía no existe porque no hay schema aplicado.

### 6.4. Correr el seed

```powershell
$env:SUPABASE_URL="https://xxxx.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<service_role key>"
$env:SEED_ADMIN_EMAIL="admin@coachlab.local"
$env:SEED_ADMIN_PASSWORD="<algo largo>"
pnpm seed
```

Esperado: `✓ 24 ejercicios`, `✓ admin ... creado`, `✓ admin ... con rol ADMIN`. Correrlo dos veces tiene
que dar el mismo resultado con `ya existía`.

### 6.5. Verificar en local

```powershell
pnpm dev
```

Abrir `http://localhost:3000`. Esperado: la base pasa de **"Falta configurar…"** a **"Conectada"**. Hoy
muestra lo primero, que es el comportamiento correcto sin proyecto.

### 6.6. Desplegar a Vercel

1. Importar el repo en vercel.com.
2. Root Directory: `packages/web`. Framework: Nuxt (lo detecta solo).
3. Environment Variables: `SUPABASE_URL` y `SUPABASE_ANON_KEY`.
4. Deploy.

### 6.7. El keepalive

Crear un monitor HTTP gratis en uptimerobot.com apuntando a `https://<tu-app>.vercel.app/api/health`
cada 5 minutos. Es lo que evita que Supabase pause el proyecto, y de paso te avisa por mail si algo se
cae (`CLAUDE.md` §2).

---

## 7. Deuda conocida

- **Las políticas de RLS no se probaron nunca contra una base real.** Están escritas con cuidado y
  comentadas, pero una política mal escrita no la agarra ningún test de código. `CLAUDE.md` §5 las pone
  como prioridad 3 de testing; conviene subirlas a prioridad 1 apenas exista el proyecto.
- **El mapeo puesto → grupo system está duplicado**: en `positions.ts` y en la función
  `my_system_group_id()` de `0003`. Son 8 valores que por decisión de `CLAUDE.md` §2 nunca cambian, pero
  está anotado en el SQL.
- **El catálogo tiene 24 ejercicios, no los ~48 del proyecto .NET.** `NEXTJS_APP_CONTEXT.md` sigue sin
  estar en el repo. El seed es idempotente por `normalized_name`, así que reemplazar la lista cuando
  aparezca no rompe nada.
- **`vue-tsc` imprime un warning** (`Load plugin failed: vue-router/volar/sfc-route-blocks`) por un
  desajuste de versiones con `vue-router`. Es ruido: el typecheck pasa igual.
- **Los planes de F1 a F4 están marcados como parcialmente obsoletos.** Su descripción de producto sigue
  siendo válida; los pasos técnicos hay que regenerarlos contra el stack nuevo antes de ejecutar cada
  fase.
