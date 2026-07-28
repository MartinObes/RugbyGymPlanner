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
| Schema Postgres completo con RLS | ✅ **aplicado al proyecto real**, sin errores de SQL |
| RLS efectivamente bloqueando | ✅ **verificada en vivo** (§4.2) |
| Trigger de alta, invite code, guard anti-escalación y scoping por rol | ✅ **15/15 con usuarios reales** (§4.3) |
| API Hono con OpenAPI | ✅ funcionando, 4 tests verdes |
| Cliente TS generado desde el contrato | ✅ generado offline |
| Nuxt SSR con la API montada en Nitro | ✅ verificado contra la base real: `db: "ok"` |
| Build para Vercel | ✅ completa |
| Tipos del schema (`types/database.ts`) | ✅ generados: 14 tablas + 8 funciones de RLS |
| Seed | ✅ **corrido**, e idempotente comprobado |
| Deploy a Vercel | ⏸ pendiente (§6.6) |

Verificación al cierre: `pnpm -r test` → **38 tests en verde**; `pnpm -r typecheck` → los 3 paquetes en
`Done`; `nuxt build` → `Build complete`; `GET /api/health` contra el proyecto real →
`{"ok":true,"service":"coachlab-api","db":"ok"}`.

### Datos del proyecto Supabase

| | |
|---|---|
| Project ref | `hiceiurkvznfhujtjfar` |
| Región | **sa-east-1** (São Paulo) |
| Host de conexión | `aws-0-sa-east-1.pooler.supabase.com:5432`, usuario `postgres.hiceiurkvznfhujtjfar` |

El host directo (`db.<ref>.supabase.co`) **no existe** en los proyectos nuevos: solo hay pooler, y su
hostname incluye la región. Si alguna vez hay que reconectar y no se sabe la región, está acá.

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

## 4.2. RLS verificada en vivo

Contra el proyecto real, usando solo la clave publishable (rol `anon`, sin sesión):

```
GET /rest/v1/profiles?select=*      → []
GET /rest/v1/exercises?select=*     → []
GET /rest/v1/programs?select=*      → []
GET /rest/v1/session_logs?select=*  → []
GET /rest/v1/one_rms?select=*       → []

POST /rest/v1/exercises  → 42501: new row violates row-level security policy
```

Las tablas existen y responden, pero no entregan una sola fila y rechazan la escritura. Es la capa 1
de `CLAUDE.md` §4 haciendo su trabajo.

Eso prueba que **RLS está habilitada y que el default es negar**. Para las políticas por rol hace
falta usuarios reales, y de eso se encarga `pnpm verify:setup` (§4.3).

## 4.3. `pnpm verify:setup` — la lógica de auth, ejercitada de verdad

`scripts/verify-setup.mjs` crea tres usuarios de prueba contra el proyecto real, ejercita el trigger
de alta y las políticas, y los borra al terminar (incluso si algo falla). Cubre lo que ningún unit
test puede, porque necesita una base y sesiones reales.

**15/15 en la última corrida:**

| Qué verifica | Resultado |
|---|---|
| Catálogo con 24 ejercicios y `normName` aplicado | `"Sentadilla Búlgara"` → `sentadilla bulgara` |
| El trigger creó el perfil del admin y el seed lo promovió | `role=ADMIN` |
| Un COACH nace con rol COACH, sin `coach_id` | ✅ |
| Un COACH recibe un `invite_code` de 6 chars del alfabeto sin ambigüedades | ej. `YRDR6H` |
| Un PLAYER que manda un invite code queda vinculado a ese coach | `coach_id` correcto |
| Un signup con `role: 'ADMIN'` **cae a PLAYER** | `CLAUDE.md` §4 respetado |
| Con sesión real, un jugador **no puede** hacerse ADMIN | `No se puede cambiar el rol del perfil` |
| …pero sí puede cambiar su nombre | ✅ |
| **RLS por rol**: un jugador ve exactamente 2 perfiles — el suyo y el de su coach | ✅ |
| Un usuario autenticado sí ve el catálogo completo | 24 ejercicios |

La penúltima fila es la que importa más: confirma que el scoping de `profiles_select` funciona y que
un jugador no ve el resto del plantel ni usuarios de otros coaches.

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

**3. Dos versiones de h3 en el árbol** — resuelto, pero conviene entenderlo
Nuxt 4 usa **h3 1.15.11** en runtime, pero el árbol también traía **h3 2.0.1-rc** por una única cadena
de devtools (`devframe` → `@vitejs/devtools-kit` → `@unhead/bundler` → `@unhead/vue`). El auto-import de
Nitro resolvía `toWebRequest` a la v2, que ya no lo exporta, y **todos los requests a la API morían**
con un error de módulo. Peor: el primer intento de arreglarlo con la API de h3 v2 (`event.req`) hizo que
Hono recibiera un path relativo en vez de una URL absoluta, y su router mandó todo al 404 **sin ningún
error visible**.

Resuelto en dos niveles:

1. **`overrides: { h3: 1.15.11 }`** en `pnpm-workspace.yaml` — una sola versión en todo el árbol.
   Verificado con `pnpm why h3` → `Found 1 version of h3`, y con tests, typecheck y build en verde.
   (En pnpm 11 los overrides van en `pnpm-workspace.yaml`, no en el campo `pnpm` del `package.json`;
   ahí los ignora en silencio con un warning.)
2. **h3 declarado en `packages/web` e importado explícitamente** en `server/api/[...].ts`, en vez de
   confiar en el auto-import. Es redundante con lo anterior a propósito: si mañana otra dependencia
   vuelve a meter una segunda versión, el import explícito sigue resolviendo bien.

Si algún día los requests a `/api` empiezan a dar 404 sin motivo, mirar acá primero.

---

## 6. Estado del setup

### ✅ 6.1. Proyecto de Supabase — hecho

Creado en **sa-east-1**. `packages/web/.env` tiene `SUPABASE_URL` y `SUPABASE_ANON_KEY`, y está
gitignoreado (verificado con `git check-ignore`).

> **Nomenclatura:** Supabase renombró sus claves en 2025. La **`publishable key`** (`sb_publishable_…`)
> es la que antes se llamaba **`anon`**; va en el navegador y no es secreta — lo que protege los datos
> es RLS. La **`secret key`** (`sb_secret_…`) es la vieja `service_role`, saltea RLS y solo puede
> aparecer en el seed y en scripts a mano (`CLAUDE.md` §4). En el código la variable sigue llamándose
> `SUPABASE_ANON_KEY` porque es el nombre que espera `supabase-js`.

### ✅ 6.2. Schema aplicado — hecho

```powershell
pnpm exec supabase db push --db-url "postgresql://postgres.hiceiurkvznfhujtjfar:<PASSWORD>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres" --include-all
```

Las tres migraciones aplicaron **sin un solo error de SQL**. No hizo falta `supabase login` ni
`link`: con `--db-url` alcanza.

Dos cosas que costaron y conviene no volver a averiguar:

- El host directo `db.<ref>.supabase.co` **ya no existe** en proyectos nuevos. Hay que usar el pooler.
- El hostname del pooler **incluye la región** y el dashboard es el único lugar que la dice. Acá es
  `aws-0-sa-east-1`, y el usuario es `postgres.<ref>`, no `postgres`.

### ✅ 6.3. Tipos del schema — hecho

`packages/web/types/database.ts` tiene las 14 tablas y las 8 funciones helper de RLS. Para
regenerarlo después de cada migración hace falta **un Personal Access Token** (o Docker, que habilita
la variante `--db-url` levantando un contenedor de `pg_meta`):

```powershell
$env:SUPABASE_ACCESS_TOKEN="sbp_..."   # supabase.com/dashboard/account/tokens
pnpm exec supabase gen types typescript --project-id hiceiurkvznfhujtjfar --schema public > packages/web/types/database.ts
```

> El PAT se muestra **una sola vez**, al crearlo. Después el dashboard lo enmascara
> (`sbp_f240••••f166`) y esos puntos son literales, no el token.

**Ojo con los dominios:** `load_type` sale tipado como `string`, no como
`'WEIGHT' | 'PERCENTAGE' | 'NONE'`. Es porque el schema usa **dominios** de Postgres y no `ENUM`: un
dominio viaja como su tipo base. La restricción sigue garantizada por la base (el `CHECK` está), pero
TypeScript no la ve. Lo mismo con `role`, `position_id` y `system_group_id`.

Alineado con `CLAUDE.md` §5 ("Zod valida los bordes; la base valida los invariantes"), las uniones
literales van a salir de los schemas de `packages/core/src/validators/`, que se parsean en el borde.
Si en algún momento se prefiere que los tipos generados las traigan solas, hay que migrar esos cuatro
dominios a `ENUM` — es una migración nueva y un cambio a §3.

### ✅ 6.4. Seed — hecho

```powershell
$env:SUPABASE_URL="https://hiceiurkvznfhujtjfar.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."   # Settings → API Keys → secret
$env:SEED_ADMIN_EMAIL="admin@coachlab.local"
$env:SEED_ADMIN_PASSWORD="<la contraseña del admin>"
pnpm seed
pnpm verify:setup    # necesita además SUPABASE_ANON_KEY
```

24 ejercicios cargados y el admin creado con rol ADMIN. La segunda corrida devolvió `ya existía`:
idempotencia comprobada.

**Credenciales del admin** (guardadas fuera del repo, cambiar en el primer login):
`admin@coachlab.local`. Si se perdió la contraseña, se resetea desde el dashboard de Supabase o
volviendo a correr el seed con otra — el usuario ya existe, así que hay que resetearla en
Authentication → Users.

### ✅ 6.5. Verificación local — hecha

`GET /api/health` → `{"ok":true,"service":"coachlab-api","db":"ok"}`, y la página SSR muestra
**"Conectada"**.

### ⏸ 6.6. Desplegar a Vercel — paso a paso

**Paso 0 — publicar el código.** Vercel despliega desde GitHub, así que primero:

```powershell
git push origin feature/f0
```

Decisión previa: Vercel llama **Production** al deploy de su *production branch* (por defecto `main`)
y **Preview** a cualquier otra rama. Como F0 está terminada, lo natural es mergear a `main` y que el
primer deploy sea de producción:

```powershell
git checkout main
git merge --no-ff feature/f0 -m "feat: F0 setup on Supabase + Vercel"
git push origin main
```

Si preferís ver un preview antes de tocar `main`, alcanza con pushear `feature/f0`: Vercel te da una
URL de preview por rama sin que Production cambie.

**Paso 1 — importar el proyecto.** En vercel.com: *Add New… → Project → Import Git Repository →
`MartinObes/RugbyGymPlanner`*. Si no aparece, hay que darle permiso a la app de GitHub sobre ese repo.

**Paso 2 — configurar. Acá es donde falla si te apurás:**

| Campo | Valor |
|---|---|
| Framework Preset | **Nuxt.js** |
| Root Directory | **`packages/web`** |
| **Include files outside of the Root Directory** | ✅ **ACTIVAR** |
| Build Command | dejar el default |
| Output Directory | dejar el default |
| Install Command | dejar el default |
| Node.js Version | 22.x |

El checkbox de "include files outside" es el que importa: `packages/web` depende de `@coachlab/core`
y `@coachlab/api`, que viven **fuera** de esa carpeta. Sin eso, `pnpm install` no encuentra los
paquetes del workspace y el build muere.

No hace falta tocar Output Directory: `nuxt.config.ts` tiene `nitro.preset: 'vercel'`, así que el
build escribe `.vercel/output` y Vercel lo levanta solo.

**Paso 3 — variables de entorno.** Antes de darle Deploy, en *Environment Variables*:

| Name | Value | Environments |
|---|---|---|
| `SUPABASE_URL` | `https://hiceiurkvznfhujtjfar.supabase.co` | Production, Preview, Development |
| `SUPABASE_ANON_KEY` | la publishable key (`sb_publishable_…`) | Production, Preview, Development |

Son los mismos dos valores de `packages/web/.env`. **La secret key no va acá**: nada que corra en
respuesta a un request la usa (`CLAUDE.md` §4).

**Paso 4 — Deploy.**

**Paso 5 — verificar.** Con la URL que te da Vercel:

- `https://<tu-app>.vercel.app/api/health` → `{"ok":true,"service":"coachlab-api","db":"ok"}`
- `https://<tu-app>.vercel.app/` → la home muestra **"Conectada"**

Si `db` dice `unconfigured`, faltan las variables de entorno o se guardaron sin cubrir el environment
de Production. Si dice `error`, las variables están pero Supabase rechazó la consulta.

**Si el build falla en el install**, el sospechoso número uno es la versión de pnpm. El repo declara
`"packageManager": "pnpm@11.17.0"`, y Vercel elige su pnpm por el `lockfileVersion` (acá `9.0`), que
puede darle la 9 o la 10. Por eso `pnpm-workspace.yaml` declara la lista de scripts permitidos **en
las dos sintaxis** (`allowBuilds` de pnpm 11 y `onlyBuiltDependencies` de pnpm 10). Si aun así se
queja de la versión, sacar el campo `packageManager` del `package.json` raíz y volver a desplegar.

### ⏸ 6.7. El keepalive con UptimeRobot — paso a paso

Cumple dos funciones: mantener la base activa para que Supabase no pause el proyecto a los 7 días, y
avisarte por mail antes que ningún jugador se entere de que algo se cayó.

1. Crear cuenta gratis en **uptimerobot.com** (50 monitores, sin tarjeta).
2. *Add New Monitor*.
3. **Monitor Type: `Keyword`** — no `HTTP(s)`. Ver el porqué abajo, es importante.
4. Friendly Name: `CoachLab health`
5. URL: `https://<tu-app>.vercel.app/api/health`
6. **Keyword Type: `Keyword not exists`** (alertar cuando la palabra NO aparezca)
7. **Keyword: `"db":"ok"`**
8. Monitoring Interval: **5 minutos**
9. Alert Contacts: tu mail, tildado
10. *Create Monitor*

**Por qué Keyword y no HTTP(s).** `/api/health` está diseñado para **no devolver nunca un 500**: si
Supabase no responde, igual contesta `200` con `{"ok":true,...,"db":"error"}`, porque un health check
que se cae no te deja diagnosticar nada. La contrapartida es que un monitor HTTP común vería `200` y
nunca te avisaría de un problema de base. El monitor de keyword mira el cuerpo y salta cuando
`"db":"ok"` desaparece.

**Sobre el intervalo.** 5 minutos son ~8.600 requests por día, ~260k por mes: alrededor del 26% del
millón de edge requests que da Vercel Hobby. Entra cómodo. Si querés ser conservador, 30 minutos
sigue siendo muchísimo para evitar una pausa por inactividad de 7 días y usa la sexta parte de esa
cuota, a cambio de enterarte de una caída hasta media hora más tarde.

### 🔐 6.8. Rotar la contraseña de la base

La contraseña de Postgres se compartió por chat durante el setup. Rotarla en
Supabase → Settings → Database → **Reset database password**. No está guardada en ningún archivo del
repo, así que rotarla no rompe nada: solo hay que usar la nueva la próxima vez que se corra
`db push`.

---

## 7. Deuda conocida

- **Las políticas de RLS están probadas solo en parte.** `pnpm verify:setup` (§4.3) ya cubre el
  scoping de `profiles` con usuarios reales y el guard anti-escalación. **Lo que falta** es todo lo
  que todavía no tiene datos: que un coach no vea el plantel de otro coach, que un jugador no lea ni
  edite el `session_log` de un compañero, y que las políticas del árbol del programa
  (`weeks`/`days`/`blocks`/`block_exercises`) filtren bien. Se irán agregando a `verify-setup.mjs` a
  medida que F1 y F2 creen esas entidades.
- **`verify-setup.mjs` corre contra un proyecto real y usa la secret key.** No tiene guard de
  producción como el seed. Mientras haya un solo proyecto no importa; cuando exista uno de
  producción, agregarle el mismo `SEED_TARGET` check.
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
