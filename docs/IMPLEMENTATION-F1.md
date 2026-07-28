# F1 — Qué se implementó, dónde y por qué

> Registro de la sesión del **2026-07-28** sobre la rama `feature/f1`. El plan ejecutado es
> `docs/superpowers/plans/2026-07-28-f1-auth-shell.md` (reescrito ese mismo día contra el stack
> Supabase + Vercel; el de 2026-07-27 quedó como registro del stack descartado). La fuente de
> verdad de las decisiones sigue siendo `CLAUDE.md`.

---

## 1. Resumen

**F1 está terminada** (código, migración aplicada y verificación en vivo en verde el
2026-07-28). El último eslabón — el click-through visual en el browser — quedó como aceptación
del dueño del repo antes del merge a `main`.

| | Estado |
|---|---|
| Validación pura de invite code (`domain/inviteCode`) | ✅ 8 tests |
| Schemas Zod de auth (`validators/auth`) | ✅ 11 tests |
| `access/rbac`: `hasRole` + errores 404/401 | ✅ 7 tests |
| Migración `0004_invite_code_lookup.sql` | ✅ **aplicada** al proyecto real |
| `verify-setup.mjs` extendido (+5 checks: RPC y signUp real) | ✅ **20/20 en vivo** |
| Middleware `withActor` + `requireRole` + errores tipados | ✅ 4 tests |
| Rutas `/auth/me`, `/coach/players`, `/admin/stats` con guards por prefijo | ✅ 6 tests |
| Contrato regenerado (openapi.json + cliente hey-api) | ✅ 4 paths |
| Plugin Supabase SSR/browser + `useAuth` + guard global de rutas | ✅ |
| Login, registro, shell con sidebar, páginas por rol | ✅ `Build complete` |
| Typecheck | ✅ verde en los 3 paquetes (tipos regenerados con el rpc) |
| Auditoría `rbac-auditor` | ✅ **APTO PARA MERGE** — hallazgos de F0 en §4 |
| Verificación en vivo | ✅ smoke 10/10 contra el dev server: cookie real de `@supabase/ssr` → `withActor` → `/auth/me`, scoping de players, 401 de admin, SSR con el invite code renderizado |

Tests: **57 en core + 14 en api = 71 en verde.**

---

## 2. Decisiones de diseño (las que no estaban en CLAUDE.md)

1. **Registro/login van directo del frontend a Supabase Auth**, no por rutas POST de Hono.
   `@supabase/ssr` ya resuelve cookies chunked, refresh y sincronización server/browser; una ruta
   propia habría duplicado eso sin ganar nada. La API conserva `GET /auth/me` como contrato
   tipado de "quién soy". División resultante: **la web es dueña del ciclo de vida de la sesión;
   la API solo autoriza**.
2. **El invite code se valida ANTES del signUp** con la RPC `coach_name_for_invite`
   (`security definer`, migración 0004): un anónimo no puede leer `profiles` y el trigger de F0
   no falla con código inválido (crea el jugador sin vincular — estado soportado; el canje
   posterior llega en F3). La RPC devuelve solo el nombre del coach.
3. **401, no 404, para prefijos protegidos.** El 404-nunca-403 de `CLAUDE.md` §4 aplica a
   recursos con id (F2); un prefijo de la app no revela nada.
4. **`withActor` tolera entorno sin configurar** (lección #1 de F0 aplicada a middleware): sin
   `SUPABASE_URL` no crea el cliente y sigue con actor null. Los tests corren offline y el
   health de UptimeRobot no cambia de costo (sin cookies, `getUser()` corta en memoria sin red).
5. **El rol se lee de `profiles.role` en cada request** — nunca del JWT — vía el mismo cliente
   RLS del request. Un cambio de rol pega inmediato.

## 3. Mapa de archivos nuevos

```
packages/core/src/domain/inviteCode.ts        # validación; la GENERACIÓN vive en la DB (0002)
packages/core/src/validators/auth.ts          # loginSchema, registerSchema, sessionUserSchema
packages/core/src/access/rbac.ts              # Actor, hasRole, NotFoundError, UnauthorizedError
packages/api/src/middleware/auth.ts           # withActor + requireRole
packages/api/src/middleware/error.ts          # errores dominio → 401/404/500 tipados
packages/api/src/routes/{auth,players,admin,schemas}.ts
packages/api/src/db/client.ts                 # + createRequestClient(cookies)
supabase/migrations/0004_invite_code_lookup.sql
packages/web/app/plugins/supabase.ts          # browser client / server client por contexto
packages/web/app/composables/useAuth.ts       # user + refresh/login/register/logout + ROLE_HOME
packages/web/app/middleware/auth.global.ts    # capa 5: redirects por rol
packages/web/app/layouts/{auth,default}.vue
packages/web/app/components/AppSidebar.vue    # desktop sidebar / mobile bottom bar
packages/web/app/pages/{login,register}.vue
packages/web/app/pages/coach/players/index.vue  # código de invitación + plantel
packages/web/app/pages/player/week.vue          # placeholder (+aviso si coachId null)
packages/web/app/pages/admin/index.vue          # contadores
```

La página de humo de F0 (`pages/index.vue`) se reemplazó: `/` ahora solo redirige por rol.
El sidebar linkea **solo páginas que existen** (Grupos/Programas se suman en F2, Mi perfil en F3).

## 4. Auditoría RBAC — hallazgos a resolver ANTES de F2

`rbac-auditor` dio **APTO PARA MERGE** para el changeset de F1 (las 5 capas verificadas, 0
críticos). Pero encontró deuda real en las migraciones de F0, hoy latente y explotable recién
cuando F2/F3 creen assignments y posiciones. **Va una migración nueva antes de cerrar F2:**

| Sev | Qué | Dónde | Fix mínimo |
|---|---|---|---|
| HIGH | `program_reaches_me` matchea assignments por posición/grupo **sin acotar al coach del jugador** → un jugador leería programas de otros coaches vía PostgREST | `0003:58-73` | join a `programs` y exigir `pr.coach_id = my_coach_id()` |
| MED | Jugador sin coach puede autovincularse a cualquier `coach_id` por PATCH directo (el guard solo frena cuando ya tenía coach) | `0002:124-128` + `0003:119-121` | el guard rechaza todo self-change de `coach_id`; el canje de F3 va por RPC `redeem_invite_code` |
| LOW | EXECUTE default expone como RPC a `generate_invite_code` y los helpers de RLS | `0002`, `0003` | `revoke` selectivo (ojo: `authenticated` necesita EXECUTE en los helpers que usan las políticas) |
| LOW | `guard_profile_changes` no protege `email` (puede divergir de `auth.users`) | `0002:99-132` | agregar el campo al trigger |

No se corrigieron en F1 a propósito: son SQL de seguridad que hoy no se puede aplicar ni
verificar en vivo (§5), y el fix de M-1 diseña parte de F3. Escribirlos a ciegas era más riesgo
que valor.

**El plan de corrección completo (migración 0005 + checks en vivo) está en
`docs/superpowers/plans/2026-07-28-rbac-hardening.md`.** Se ejecuta con las mismas credenciales
de §5 — si se corre junto, un solo `db push` aplica 0004 y 0005.

## 5. Pendiente para cerrar la fase (necesita credenciales)

> **HECHO (2026-07-28).** Se deja la receta porque es la misma para cada migración futura
> (la 0005 del hardening la va a necesitar). Post-cierre quedó una sola cosa: **rotar** la
> password de Postgres, el PAT y la secret key, que pasaron por el chat durante esta sesión
> (mismo criterio que `IMPLEMENTATION-F0.md` §6.8). Conviene rotar la password recién después
> de aplicar la 0005, para no escribirla dos veces.

En orden, con las variables del dueño del repo (ver `IMPLEMENTATION-F0.md` §6 para dónde vive
cada una):

```powershell
# 1. Aplicar 0004 (password de Postgres; host pooler en IMPLEMENTATION-F0.md §6.2)
pnpm exec supabase db push --db-url "postgresql://postgres.hiceiurkvznfhujtjfar:<PASSWORD>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres" --include-all

# 2. Regenerar tipos (PAT) — destraba el único error de typecheck
#    OJO: con Out-File -Encoding utf8, no con ">" — en Windows PowerShell 5.1
#    ">" escribe UTF-16 y git pasa a tratar el archivo como binario.
$env:SUPABASE_ACCESS_TOKEN="sbp_..."
pnpm exec supabase gen types typescript --project-id hiceiurkvznfhujtjfar --schema public | Out-File -Encoding utf8 packages/web/types/database.ts

# 3. Verificación en vivo (20 checks; si "confirmación de email apagada" falla,
#    apagar Confirm email en Authentication → Sign In / Providers → Email)
$env:SUPABASE_URL="https://hiceiurkvznfhujtjfar.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
$env:SUPABASE_ANON_KEY="sb_publishable_..."
pnpm verify:setup

# 4. Suite completa + flujo manual del plan (Task 12 Step 2)
#    (así y no con && — Windows PowerShell 5.1 no lo soporta)
pnpm typecheck; if ($?) { pnpm test }
pnpm dev
```

Al pasar todo: commitear `types/database.ts`, marcar el checkbox de F1 en `CLAUDE.md` §6 y
actualizar la tabla del §1 de este archivo.

## 6. Problemas que aparecieron

**1. `withActor` reventaba los tests sin entorno.** La primera versión creaba el cliente de
Supabase incondicionalmente y `requireEnv` tiraba antes de llegar a cualquier ruta: 10 tests en
rojo, incluido el health (500). Es la lección #1 de F0 ("nada puede depender de que exista el
entorno de producción") mordiendo en forma de middleware. Fix: el `try/catch` deja pasar con
actor null — sin cliente no hay actor, los guards cortan antes de que ninguna ruta toque `db`, y
el health reporta `unconfigured` por su cuenta.

**2. Supabase Auth (hosted) rechaza emails con TLD reservado en el signUp anónimo.** El check
del "signUp real" usaba `@coachlab.local` como los usuarios del admin API — y falló con
`Email address is invalid`: el signUp anónimo valida el dominio, el admin API no. El check pasó
a usar `VERIFY_SIGNUP_EMAIL` (un buzón real con plus-addressing, ej. `tumail+coachlab@gmail.com`)
y los checks dependientes ya no fallan en cascada culpando a otra causa.

**3. En Windows PowerShell 5.1, `>` escribe UTF-16.** El `gen types` corrido por el dueño dejó
`types/database.ts` en UTF-16 y git pasó a tratarlo como binario (adiós diffs). Se convirtió a
UTF-8 y la receta de §5 usa `| Out-File -Encoding utf8`. Si algún día `git diff` muestra ese
archivo como `Bin`, es esto de nuevo.

**4. `supabase db push` no encontró el proyecto pese a `linked-project.json`.** Ese archivo no es
el formato que el CLI actual lee (espera `.temp/project-ref` o `--db-url`), y no hay login
guardado (`projects list` → `LegacyPlatformAuthRequiredError`). No es un bug del repo: las
credenciales de F0 pasaron por el chat y se rotaron a propósito (`IMPLEMENTATION-F0.md` §6.8).
Por diseño, cerrar una fase que toca el schema requiere al dueño del repo.
