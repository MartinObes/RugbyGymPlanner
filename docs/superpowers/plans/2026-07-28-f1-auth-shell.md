# F1 — Auth y shell (Supabase + Vercel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> Reemplaza a `2026-07-27-f1-auth-shell.md`, escrito contra el stack descartado (JWT propio +
> argon2 + DynamoDB). El comportamiento de producto es el mismo; la implementación cambió de
> raíz porque **la mitad del trabajo de aquel plan ya lo hace Supabase desde F0**: el trigger
> `handle_new_user` crea el perfil, genera el invite code y vincula jugador↔coach; el guard
> `guard_profile_changes` impide escalar privilegios; RLS scopea `profiles` por rol
> (verificado 15/15 en `pnpm verify:setup`).

**Goal:** Que un coach se registre y vea su código de invitación, que un jugador se registre con ese
código y quede vinculado, que ambos entren con email+contraseña, y que cada rol solo alcance sus
rutas — con las 5 capas de `CLAUDE.md` §4 conectadas de punta a punta.

**Architecture:** La sesión vive en cookies de `@supabase/ssr` y **el ciclo de vida lo maneja el
frontend**: un plugin de Nuxt crea el cliente de Supabase (browser client en el navegador, server
client sobre las cookies del request en SSR) y `useAuth` hace signUp/signIn/signOut y lee el perfil.
**La API autoriza**: el middleware `withActor` de Hono reconstruye la sesión desde el header Cookie,
valida el token contra Supabase Auth, lee el rol de `profiles` (nunca del JWT — `CLAUDE.md` §4) y
deja en el contexto el actor y un cliente supabase-js que viaja con el JWT del usuario, así RLS
filtra sola. `requireRole` cuelga de los prefijos `/coach/*`, `/player/*`, `/admin/*` en `app.ts`
para que ninguna ruta nueva nazca sin guard.

**Tech Stack:** Supabase Auth + `@supabase/ssr`, Hono + `@hono/zod-openapi`, Zod, Nuxt 4 + Nuxt UI 3, Vitest.

**Precondición:** F0 en `main` (está). Rama de trabajo: `feature/f1` (ya creada y activa).

> **Estado de ejecución (2026-07-28):** Tasks 1–11 completas y commiteadas. De la Task 5 quedó
> pendiente lo que necesita credenciales del dueño del repo: `supabase db push` (0004),
> `gen types` (el typecheck de web tiene UN error esperado por el rpc sin tipar) y
> `pnpm verify:setup`. De la Task 12: auditoría RBAC corrida (APTO PARA MERGE, hallazgos de F0
> documentados en `docs/IMPLEMENTATION-F1.md` §deuda); verificación en vivo y checkbox de
> CLAUDE.md esperan las mismas credenciales.

**Qué NO entra en F1** (deliberado): rutas de datos de jugador (F3), grupos/programas del coach
(F2), links de sidebar a páginas que todavía no existen, CRUD de catálogo (fuera del MVP),
`can()`/helpers de scope genéricos (llegan con los primeros recursos reales en F2 — YAGNI).

---

## Decisiones de diseño de esta fase

1. **Registro/login se hacen contra Supabase Auth desde el frontend**, no vía una ruta POST de
   Hono. Motivo: `@supabase/ssr` ya resuelve la parte difícil (cookies chunked, refresh de tokens,
   sincronización server/browser); re-implementarla detrás de una ruta propia sería duplicar el
   trabajo que en el stack viejo justificaba las rutas `register`/`login`. El trigger de F0 hace el
   resto en el alta. La API conserva `GET /auth/me` como contrato tipado de "quién soy".
2. **Validación del invite code antes del signUp** vía una función SQL `security definer`
   (`coach_name_for_invite`): un usuario anónimo no puede leer `profiles` (RLS), y el trigger de F0
   NO falla con código inválido (crea el jugador sin vincular — estado soportado por el guard:
   "un jugador sin coach puede vincularse una vez"). La RPC devuelve solo el nombre del coach:
   mínima revelación, y de paso da UX ("Te vas a unir al plantel de X").
3. **El rol se lee de `profiles.role` en cada request** (una query por request vía el mismo cliente
   RLS). A escala de ~300 usuarios es gratis y hace que un cambio de rol pegue inmediato (§4).
4. **404 vs 401**: rol equivocado o sin sesión en un prefijo protegido → **401** (el prefijo es
   público por diseño, no revela ningún recurso). El 404-nunca-403 aplica a *recursos* con id, que
   recién aparecen en F2.
5. **Los datos en páginas** viajan por la API Hono con el cliente/tipos generados (patrón F0:
   `useFetch` + tipo de `~~/generated`), forwardeando la cookie explícitamente con
   `useRequestHeaders(['cookie'])` en SSR.

---

### Task 1: Dependencias

**Files:**
- Modify: `packages/api/package.json`, `packages/web/package.json`

- [ ] **Step 1: Agregar `@supabase/ssr` (api y web) y `@supabase/supabase-js` (web)**

```powershell
pnpm --filter @coachlab/api add @supabase/ssr
pnpm --filter @coachlab/web add @supabase/ssr @supabase/supabase-js
```

Justificación contra `CLAUDE.md` §2: `@supabase/ssr` es el paquete que la propia tabla de
decisiones nombra en §4 para crear el cliente por sesión; `supabase-js` ya es dependencia del
workspace (la web la necesita directa para tipos y auth).

- [ ] **Step 2: Verificar que el árbol quedó sano**

Run: `pnpm -r typecheck && pnpm -r test`
Expected: verde (nada usa los paquetes nuevos todavía).

- [ ] **Step 3: Commit**

```bash
git add packages/api/package.json packages/web/package.json pnpm-lock.yaml
git commit -m "chore: add @supabase/ssr for cookie-based sessions"
```

---

### Task 2: `inviteCode` — validación pura (la generación vive en la DB)

A diferencia del plan viejo, acá **no hay generador**: el código lo genera
`public.generate_invite_code()` (migración 0002) al crear el perfil del coach. En core queda solo
lo que el frontend necesita para validar el formato antes de llamar a la base.

**Files:**
- Create: `packages/core/src/domain/inviteCode.ts`
- Test: `packages/core/src/domain/inviteCode.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { describe, expect, it } from 'vitest'
import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  isValidInviteCode,
  normalizeInviteCode,
} from './inviteCode'

describe('INVITE_CODE_ALPHABET', () => {
  it('excluye caracteres ambiguos (0/O, 1/I/L)', () => {
    for (const char of '01OIL') expect(INVITE_CODE_ALPHABET).not.toContain(char)
  })

  it('tiene 31 caracteres, como el alfabeto de generate_invite_code() en SQL', () => {
    expect(INVITE_CODE_ALPHABET).toHaveLength(31)
    expect(INVITE_CODE_LENGTH).toBe(6)
  })
})

describe('normalizeInviteCode', () => {
  it('recorta espacios y pasa a mayúsculas', () => {
    expect(normalizeInviteCode('  abc234 ')).toBe('ABC234')
  })
})

describe('isValidInviteCode', () => {
  it('acepta un código válido', () => {
    expect(isValidInviteCode('ABC234')).toBe(true)
  })

  it('acepta minúsculas y espacios alrededor (se normalizan)', () => {
    expect(isValidInviteCode(' abc234 ')).toBe(true)
  })

  it('rechaza largo incorrecto', () => {
    expect(isValidInviteCode('ABC23')).toBe(false)
    expect(isValidInviteCode('ABC2345')).toBe(false)
    expect(isValidInviteCode('')).toBe(false)
  })

  it('rechaza caracteres fuera del alfabeto', () => {
    expect(isValidInviteCode('ABC01O')).toBe(false)
    expect(isValidInviteCode('ABC-34')).toBe(false)
  })
})
```

- [ ] **Step 2: Correr para ver que falla**

Run: `pnpm --filter @coachlab/core test`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

`packages/core/src/domain/inviteCode.ts`:

```ts
/**
 * Validación del código de invitación del coach.
 *
 * La GENERACIÓN vive en la base: public.generate_invite_code()
 * (supabase/migrations/0002_auth_and_profile_guards.sql). Este alfabeto tiene
 * que coincidir con el de esa función — sin 0/O ni 1/I/L, porque el código se
 * dicta en voz alta en un vestuario y por WhatsApp.
 */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export const INVITE_CODE_LENGTH = 6

export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase()
}

export function isValidInviteCode(raw: string): boolean {
  const code = normalizeInviteCode(raw)
  if (code.length !== INVITE_CODE_LENGTH) return false
  return [...code].every((char) => INVITE_CODE_ALPHABET.includes(char))
}
```

- [ ] **Step 4: Correr para ver que pasa**

Run: `pnpm --filter @coachlab/core test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/inviteCode.ts packages/core/src/domain/inviteCode.test.ts
git commit -m "feat(domain): add invite code validation (generation lives in the db)"
```

---

### Task 3: Schemas Zod de auth

**Files:**
- Create: `packages/core/src/validators/auth.ts`
- Test: `packages/core/src/validators/auth.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { describe, expect, it } from 'vitest'
import { loginSchema, registerSchema, sessionUserSchema } from './auth'

const validCoach = {
  name: 'Ana Pérez',
  email: 'ana@club.uy',
  password: 'unaclavelarga',
  role: 'COACH' as const,
}

describe('registerSchema', () => {
  it('acepta un coach sin invite code', () => {
    expect(registerSchema.safeParse(validCoach).success).toBe(true)
  })

  it('normaliza el email a minúsculas y sin espacios', () => {
    expect(registerSchema.parse({ ...validCoach, email: ' Ana@Club.UY ' }).email).toBe('ana@club.uy')
  })

  it('rechaza contraseña de menos de 8 caracteres', () => {
    expect(registerSchema.safeParse({ ...validCoach, password: 'corta12' }).success).toBe(false)
  })

  it('exige invite code cuando el rol es PLAYER', () => {
    const result = registerSchema.safeParse({ ...validCoach, role: 'PLAYER', inviteCode: '' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['inviteCode'])
  })

  it('acepta un jugador con invite code y lo normaliza', () => {
    const result = registerSchema.parse({ ...validCoach, role: 'PLAYER', inviteCode: ' abc234 ' })
    expect(result.inviteCode).toBe('ABC234')
  })

  it('rechaza un invite code con caracteres ambiguos si el rol es PLAYER', () => {
    expect(
      registerSchema.safeParse({ ...validCoach, role: 'PLAYER', inviteCode: 'ABC01O' }).success,
    ).toBe(false)
  })

  it('no permite registrarse como ADMIN', () => {
    expect(registerSchema.safeParse({ ...validCoach, role: 'ADMIN' }).success).toBe(false)
  })
})

describe('loginSchema', () => {
  it('acepta email y contraseña', () => {
    expect(loginSchema.safeParse({ email: 'ana@club.uy', password: 'x' }).success).toBe(true)
  })

  it('rechaza email inválido', () => {
    expect(loginSchema.safeParse({ email: 'no-es-mail', password: 'x' }).success).toBe(false)
  })
})

describe('sessionUserSchema', () => {
  it('modela al usuario con rol, invite code y coach nullable', () => {
    const parsed = sessionUserSchema.parse({
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      email: 'ana@club.uy',
      name: 'Ana',
      role: 'COACH',
      inviteCode: 'ABC234',
      coachId: null,
    })
    expect(parsed.role).toBe('COACH')
  })
})
```

- [ ] **Step 2: Correr para ver que falla**

Run: `pnpm --filter @coachlab/core test`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`packages/core/src/validators/auth.ts`:

```ts
import { z } from 'zod'
import { isValidInviteCode, normalizeInviteCode } from '../domain/inviteCode'

export const roleSchema = z.enum(['PLAYER', 'COACH', 'ADMIN'])

export type Role = z.infer<typeof roleSchema>

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
})

export type LoginInput = z.infer<typeof loginSchema>

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Poné tu nombre (mínimo 2 letras)').max(80),
    email: z.string().trim().toLowerCase().email('Email inválido'),
    password: z.string().min(8, 'Mínimo 8 caracteres').max(200),
    // ADMIN queda afuera a propósito: solo por seed o consola (CLAUDE.md §4).
    // El trigger handle_new_user además degrada a PLAYER cualquier intento.
    role: z.enum(['COACH', 'PLAYER']),
    inviteCode: z.string().transform(normalizeInviteCode).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role !== 'PLAYER') return
    if (!data.inviteCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['inviteCode'],
        message: 'Necesitás el código de tu entrenador',
      })
    } else if (!isValidInviteCode(data.inviteCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['inviteCode'],
        message: 'El código tiene 6 letras o números, sin 0, O, 1, I ni L',
      })
    }
  })

export type RegisterInput = z.infer<typeof registerSchema>

/** Lo que /api/auth/me devuelve y lo que el shell de Nuxt necesita para renderizar por rol. */
export const sessionUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  name: z.string(),
  role: roleSchema,
  inviteCode: z.string().nullable(),
  coachId: z.string().uuid().nullable(),
})

export type SessionUser = z.infer<typeof sessionUserSchema>
```

- [ ] **Step 4: Correr para ver que pasa**

Run: `pnpm --filter @coachlab/core test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/validators/auth.ts packages/core/src/validators/auth.test.ts
git commit -m "feat(validators): add login, register and session user zod schemas"
```

---

### Task 4: `access/rbac` — errores y decisión de rol puros

Mínimo necesario para F1: `hasRole` (lo usa `requireRole`) y los dos errores que el middleware de
errores traduce a status. Los helpers de scope (`can`, `assertFound`) llegan en F2 con los primeros
recursos con id — acá serían código muerto.

**Files:**
- Create: `packages/core/src/access/rbac.ts`
- Test: `packages/core/src/access/rbac.test.ts`
- Modify: `packages/core/package.json` (export `./access/*`)

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { describe, expect, it } from 'vitest'
import { NotFoundError, UnauthorizedError, hasRole } from './rbac'

const coach = { role: 'COACH' as const }
const player = { role: 'PLAYER' as const }
const admin = { role: 'ADMIN' as const }

describe('hasRole', () => {
  it('acepta el rol exacto', () => {
    expect(hasRole(coach, ['COACH'])).toBe(true)
  })

  it('rechaza un rol distinto', () => {
    expect(hasRole(player, ['COACH'])).toBe(false)
  })

  it('acepta cualquiera de la lista', () => {
    expect(hasRole(player, ['COACH', 'PLAYER'])).toBe(true)
  })

  it('rechaza actor nulo', () => {
    expect(hasRole(null, ['COACH'])).toBe(false)
  })

  it('ADMIN no hereda roles: si una ruta lo admite, tiene que listarlo', () => {
    expect(hasRole(admin, ['COACH'])).toBe(false)
    expect(hasRole(admin, ['COACH', 'ADMIN'])).toBe(true)
  })
})

describe('errores de dominio', () => {
  it('NotFoundError y UnauthorizedError son distinguibles por instancia', () => {
    expect(new NotFoundError()).toBeInstanceOf(NotFoundError)
    expect(new UnauthorizedError()).toBeInstanceOf(UnauthorizedError)
    expect(new NotFoundError()).not.toBeInstanceOf(UnauthorizedError)
  })
})
```

- [ ] **Step 2: Correr para ver que falla**

Run: `pnpm --filter @coachlab/core test`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`packages/core/src/access/rbac.ts`:

```ts
import type { Role, SessionUser } from '../validators/auth'

/**
 * El actor de un request autenticado. Es el SessionUser leído de profiles en
 * cada request — el rol NUNCA sale del JWT (CLAUDE.md §4): así un cambio de rol
 * pega inmediato sin esperar a que expire un token.
 */
export type Actor = SessionUser

/**
 * Recurso ajeno responde 404, nunca 403: un 403 confirma que el recurso existe
 * (CLAUDE.md §4, capa 4). En F1 todavía no hay recursos con id; el error queda
 * definido acá para que el middleware de errores ya lo traduzca.
 */
export class NotFoundError extends Error {
  constructor(message = 'No encontrado') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'No autorizado') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

/** ADMIN no está implícito: si una ruta lo admite, tiene que listarlo. */
export function hasRole(actor: Pick<Actor, 'role'> | null, allowed: readonly Role[]): boolean {
  if (!actor) return false
  return allowed.includes(actor.role)
}
```

- [ ] **Step 4: Exportar `./access/*` desde core**

En `packages/core/package.json`, el campo `exports` queda:

```json
"exports": {
  "./domain/*": "./src/domain/*.ts",
  "./validators/*": "./src/validators/*.ts",
  "./access/*": "./src/access/*.ts"
}
```

- [ ] **Step 5: Correr para ver que pasa**

Run: `pnpm --filter @coachlab/core test && pnpm --filter @coachlab/core typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/access/rbac.ts packages/core/src/access/rbac.test.ts packages/core/package.json
git commit -m "feat(access): add hasRole and domain errors with 404-not-403 semantics"
```

---

### Task 5: Migración 0004 — lookup del invite code para el registro

**Files:**
- Create: `supabase/migrations/0004_invite_code_lookup.sql`
- Modify: `scripts/verify-setup.mjs`
- Regenerate: `packages/web/types/database.ts`

- [ ] **Step 1: Escribir la migración**

`supabase/migrations/0004_invite_code_lookup.sql`:

```sql
-- El formulario de registro necesita validar el código de invitación ANTES del
-- signUp, y un usuario anónimo no puede leer profiles (RLS). Esta función corre
-- como SECURITY DEFINER y revela lo mínimo: el nombre del coach dueño del
-- código, que además sirve para la UX ("Te vas a unir al plantel de X").
--
-- El trigger handle_new_user (0002) NO falla con un código inválido: crea el
-- jugador sin vincular. Esta función es lo que evita llegar a ese estado desde
-- la UI; el estado "jugador sin coach" sigue siendo válido y el guard de 0002
-- permite canjear un código después (pantalla de perfil, F3).
--
-- Adivinar códigos por fuerza bruta no paga: 31^6 ≈ 887M combinaciones y lo
-- único que devuelve es un nombre.
create or replace function public.coach_name_for_invite(code text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.name
  from public.profiles p
  where p.invite_code = upper(trim(code))
    and p.role = 'COACH'
$$;
```

(No hace falta `grant`: Postgres da EXECUTE a `public` por defecto y PostgREST la expone como
`/rest/v1/rpc/coach_name_for_invite` para `anon` y `authenticated`, que es lo que queremos.)

- [ ] **Step 2: Aplicar contra el proyecto real**

```powershell
pnpm exec supabase db push
```

Si pide credenciales que no están disponibles (password de Postgres — ver
`docs/IMPLEMENTATION-F0.md` §6.2 para el formato con `--db-url` y el host del pooler
`aws-0-sa-east-1.pooler.supabase.com`), **pedírselas al dueño del repo antes de seguir con los
pasos 3 y 5** — el resto de las tasks no dependen de esto.

Expected: `Applying migration 0004_invite_code_lookup.sql... Finished supabase db push.`

- [ ] **Step 3: Regenerar los tipos del schema**

```powershell
$env:SUPABASE_ACCESS_TOKEN="sbp_..."   # supabase.com/dashboard/account/tokens
pnpm exec supabase gen types typescript --project-id hiceiurkvznfhujtjfar --schema public > packages/web/types/database.ts
```

Expected: `packages/web/types/database.ts` ahora lista `coach_name_for_invite` en `Functions`.

- [ ] **Step 4: Extender `verify-setup.mjs`**

Después del bloque `--- trigger de alta: COACH ---` (que deja `coach.invite_code` disponible),
agregar:

```js
  // --- RPC de validación del invite code (anon, para el form de registro) ---
  const anonClient = createClient(URL, ANON, { auth: { persistSession: false } })
  const { data: coachName } = await anonClient.rpc('coach_name_for_invite', {
    code: coach.invite_code.toLowerCase(),
  })
  check('coach_name_for_invite resuelve el código (case-insensitive)', coachName === 'Coach Test', `-> ${coachName}`)

  const { data: noCoach } = await anonClient.rpc('coach_name_for_invite', { code: 'ZZZZZZ' })
  check('coach_name_for_invite devuelve null con código inexistente', noCoach === null, `-> ${noCoach}`)

  // --- signUp real (el camino que usa la app, no el admin API) ----------------
  const { data: signUpData, error: signUpError } = await anonClient.auth.signUp({
    email: 'signup.test@coachlab.local',
    password: 'TestPassw0rd!x9',
    options: { data: { name: 'SignUp Test', role: 'PLAYER', invite_code: coach.invite_code } },
  })
  if (signUpData?.user) created.push(signUpData.user.id)
  check('signUp anónimo funciona', !signUpError, signUpError?.message ?? '')
  check(
    'signUp devuelve sesión (confirmación de email apagada)',
    !!signUpData?.session,
    signUpData?.session ? '' : 'ENCENDIDA: apagar en Authentication → Sign In / Providers → Email',
  )
  const { data: signedUpProfile } = await admin
    .from('profiles')
    .select('coach_id')
    .eq('id', signUpData?.user?.id ?? '')
    .single()
  check('el signUp real vinculó al coach por invite code', signedUpProfile?.coach_id === coachId)
```

- [ ] **Step 5: Correr la verificación en vivo**

```powershell
# Necesita SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y SUPABASE_ANON_KEY en el entorno
pnpm verify:setup
```

Expected: los 15 checks de F0 **más** los 5 nuevos en OK. Si "confirmación de email apagada"
falla: en el dashboard de Supabase → Authentication → Sign In / Providers → Email → apagar
**Confirm email** (para el MVP: sin servidor SMTP propio los mails de confirmación de Supabase
tienen cuota mínima y el club no la necesita). Volver a correr.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0004_invite_code_lookup.sql scripts/verify-setup.mjs packages/web/types/database.ts
git commit -m "feat(db): add coach_name_for_invite rpc for pre-signup validation"
```

---

### Task 6: Middleware de la API — `withActor`, `requireRole`, errores

**Files:**
- Modify: `packages/api/src/db/client.ts`
- Create: `packages/api/src/middleware/auth.ts`
- Create: `packages/api/src/middleware/error.ts`
- Test: `packages/api/src/middleware/auth.test.ts`

- [ ] **Step 1: Cliente por request en `db/client.ts`**

Agregar al final de `packages/api/src/db/client.ts` (los imports se suman a los existentes):

```ts
import { createServerClient, type CookieMethodsServer } from '@supabase/ssr'

/**
 * Cliente reconstruido desde las cookies del request (las escribe @supabase/ssr
 * del lado de Nuxt). Es el cliente de la capa de datos de TODAS las rutas
 * autenticadas: viaja con el JWT del usuario, así que auth.uid() resuelve en
 * las políticas y RLS filtra sola (CLAUDE.md §4).
 */
export function createRequestClient(cookies: CookieMethodsServer): SupabaseClient {
  return createServerClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    cookies,
  })
}
```

- [ ] **Step 2: `middleware/auth.ts`**

`packages/api/src/middleware/auth.ts`:

```ts
import { parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createMiddleware } from 'hono/factory'
import { hasRole, UnauthorizedError, type Actor } from '@coachlab/core/access/rbac'
import type { Role } from '@coachlab/core/validators/auth'
import { createRequestClient } from '../db/client'

export type AuthVariables = {
  actor: Actor | null
  db: SupabaseClient
}

/**
 * Reconstruye la sesión desde el header Cookie y resuelve el actor. NO rechaza:
 * eso es tarea de requireRole — así las rutas públicas (health, openapi) pueden
 * convivir con este middleware montado global.
 *
 * Sin cookies no hay ningún viaje a Supabase: getUser() corta en memoria con
 * "session missing", y el health que UptimeRobot golpea cada 5 minutos sigue
 * costando lo mismo que en F0.
 */
export const withActor = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const supabase = createRequestClient({
    getAll: () =>
      parseCookieHeader(c.req.header('cookie') ?? '').map(({ name, value }) => ({
        name,
        value: value ?? '',
      })),
    // Si Supabase refresca el token durante el request, el Set-Cookie viaja en
    // esta misma respuesta y el browser queda al día.
    setAll: (cookies) => {
      for (const { name, value, options } of cookies) {
        c.header('Set-Cookie', serializeCookieHeader(name, value, options), { append: true })
      }
    },
  })

  c.set('db', supabase)
  c.set('actor', null)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return next()

  // El rol vive en profiles.role, no en el JWT (CLAUDE.md §4). Esta query va
  // con el JWT del usuario: RLS garantiza que solo puede leer su propia fila.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, name, role, invite_code, coach_id')
    .eq('id', user.id)
    .single()

  if (profile) {
    c.set('actor', {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: profile.role as Role,
      inviteCode: profile.invite_code,
      coachId: profile.coach_id,
    })
  }

  return next()
})

/** Capa 2 de CLAUDE.md §4: cuelga de los prefijos /coach/*, /player/* y /admin/* en app.ts. */
export function requireRole(allowed: readonly Role[]) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    if (!hasRole(c.get('actor'), allowed)) throw new UnauthorizedError()
    return next()
  })
}
```

- [ ] **Step 3: `middleware/error.ts`**

`packages/api/src/middleware/error.ts`:

```ts
import type { ErrorHandler } from 'hono'
import { NotFoundError, UnauthorizedError } from '@coachlab/core/access/rbac'

/**
 * Traduce errores de dominio a status tipados (CLAUDE.md §5: nunca una
 * excepción cruda al cliente). El 404 de NotFoundError es deliberado: hace
 * indistinguible "no existe" de "no es tuyo".
 */
export const onError: ErrorHandler = (error, c) => {
  if (error instanceof UnauthorizedError) {
    return c.json({ ok: false as const, error: 'No autorizado' }, 401)
  }
  if (error instanceof NotFoundError) {
    return c.json({ ok: false as const, error: 'No encontrado' }, 404)
  }
  console.error('[api]', error)
  return c.json({ ok: false as const, error: 'Error interno' }, 500)
}
```

- [ ] **Step 4: Tests del middleware (offline, sin Supabase)**

`packages/api/src/middleware/auth.test.ts` — `requireRole` se testea inyectando el actor con un
middleware de fixture; `withActor` sin cookies se testea vía `app.request()` en la Task 7 (sin
cookie no hay red). **No inventar cookies de sesión en unit tests**: eso pediría red; la matriz
por rol con sesiones reales vive en la verificación en vivo (Task 11).

```ts
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { Actor } from '@coachlab/core/access/rbac'
import type { Role } from '@coachlab/core/validators/auth'
import { requireRole, type AuthVariables } from './auth'
import { onError } from './error'

function fakeActor(role: Role): Actor {
  return {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    email: 'test@coachlab.local',
    name: 'Test',
    role,
    inviteCode: null,
    coachId: null,
  }
}

function appAs(role: Role | null) {
  const app = new Hono<{ Variables: AuthVariables }>()
  app.onError(onError)
  app.use('*', async (c, next) => {
    c.set('actor', role ? fakeActor(role) : null)
    await next()
  })
  app.use('/coach/*', requireRole(['COACH', 'ADMIN']))
  app.get('/coach/ping', (c) => c.json({ ok: true }))
  return app
}

describe('requireRole', () => {
  it('deja pasar al rol permitido', async () => {
    const res = await appAs('COACH').request('/coach/ping')
    expect(res.status).toBe(200)
  })

  it('ADMIN pasa cuando está listado', async () => {
    const res = await appAs('ADMIN').request('/coach/ping')
    expect(res.status).toBe(200)
  })

  it('rechaza el rol equivocado con 401 tipado', async () => {
    const res = await appAs('PLAYER').request('/coach/ping')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false, error: 'No autorizado' })
  })

  it('rechaza sin sesión', async () => {
    const res = await appAs(null).request('/coach/ping')
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 5: Correr**

Run: `pnpm --filter @coachlab/api test && pnpm --filter @coachlab/api typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/db/client.ts packages/api/src/middleware
git commit -m "feat(api): add supabase session middleware and typed error handler"
```

---

### Task 7: Rutas `/auth/me`, `/coach/players`, `/admin/stats` y guards por prefijo

**Files:**
- Create: `packages/api/src/routes/schemas.ts`
- Create: `packages/api/src/routes/auth.ts`
- Create: `packages/api/src/routes/players.ts`
- Create: `packages/api/src/routes/admin.ts`
- Modify: `packages/api/src/app.ts`
- Modify: `packages/api/src/app.test.ts`

- [ ] **Step 1: Schema de error compartido**

`packages/api/src/routes/schemas.ts`:

```ts
import { z } from '@hono/zod-openapi'

/** El shape de error de CLAUDE.md §5, una sola vez para todo el spec. */
export const ErrorResponse = z
  .object({ ok: z.literal(false), error: z.string() })
  .openapi('ErrorResponse')
```

- [ ] **Step 2: `routes/auth.ts` — `GET /auth/me`**

```ts
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { UnauthorizedError } from '@coachlab/core/access/rbac'
import { sessionUserSchema } from '@coachlab/core/validators/auth'
import type { AuthVariables } from '../middleware/auth'
import { ErrorResponse } from './schemas'

const MeResponse = z
  .object({ ok: z.literal(true), user: sessionUserSchema })
  .openapi('MeResponse')

const meRoute = createRoute({
  method: 'get',
  path: '/auth/me',
  summary: 'El usuario de la sesión actual, con el rol leído de profiles',
  responses: {
    200: { description: 'Sesión válida', content: { 'application/json': { schema: MeResponse } } },
    401: { description: 'Sin sesión', content: { 'application/json': { schema: ErrorResponse } } },
  },
})

/**
 * Única ruta de auth en la API: registro, login y logout van directo del
 * frontend a Supabase Auth vía @supabase/ssr, que ya resuelve cookies y
 * refresh. Esto es lo que Nuxt y los tests usan para preguntar "¿quién soy
 * para la API?".
 */
export const auth = new OpenAPIHono<{ Variables: AuthVariables }>().openapi(meRoute, (c) => {
  const actor = c.get('actor')
  if (!actor) throw new UnauthorizedError()
  return c.json({ ok: true as const, user: actor }, 200)
})
```

- [ ] **Step 3: `routes/players.ts` — `GET /coach/players`**

```ts
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { AuthVariables } from '../middleware/auth'
import { ErrorResponse } from './schemas'

const CoachPlayer = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string(),
    positionId: z.string().nullable(),
  })
  .openapi('CoachPlayer')

const CoachPlayersResponse = z
  .object({ ok: z.literal(true), players: z.array(CoachPlayer) })
  .openapi('CoachPlayersResponse')

const playersRoute = createRoute({
  method: 'get',
  path: '/coach/players',
  summary: 'El plantel del coach de la sesión',
  responses: {
    200: { description: 'Plantel', content: { 'application/json': { schema: CoachPlayersResponse } } },
    401: { description: 'Sin sesión o rol equivocado', content: { 'application/json': { schema: ErrorResponse } } },
  },
})

export const players = new OpenAPIHono<{ Variables: AuthVariables }>().openapi(
  playersRoute,
  async (c) => {
    // El guard del prefijo /coach/* (app.ts) ya corrió: actor no es null acá.
    const actor = c.get('actor')!

    // Capa 4: scoping explícito por coach_id del actor. RLS (capa 1) filtra
    // igual aunque este .eq() no estuviera — por eso un ADMIN acá ve [] y no
    // el plantel de otro: no ES coach de nadie.
    const { data, error } = await c.get('db')
      .from('profiles')
      .select('id, name, email, position_id')
      .eq('coach_id', actor.id)
      .eq('role', 'PLAYER')
      .order('name')

    if (error) throw new Error(error.message)

    return c.json(
      {
        ok: true as const,
        players: (data ?? []).map((p) => ({
          id: p.id as string,
          name: p.name as string,
          email: p.email as string,
          positionId: (p.position_id as string | null) ?? null,
        })),
      },
      200,
    )
  },
)
```

- [ ] **Step 4: `routes/admin.ts` — `GET /admin/stats`**

```ts
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { AuthVariables } from '../middleware/auth'
import { ErrorResponse } from './schemas'

const AdminStatsResponse = z
  .object({
    ok: z.literal(true),
    stats: z.object({
      coaches: z.number(),
      players: z.number(),
      admins: z.number(),
      exercises: z.number(),
    }),
  })
  .openapi('AdminStatsResponse')

const statsRoute = createRoute({
  method: 'get',
  path: '/admin/stats',
  summary: 'Contadores globales (solo ADMIN, que por RLS ve todas las filas)',
  responses: {
    200: { description: 'Contadores', content: { 'application/json': { schema: AdminStatsResponse } } },
    401: { description: 'Sin sesión o rol equivocado', content: { 'application/json': { schema: ErrorResponse } } },
  },
})

export const admin = new OpenAPIHono<{ Variables: AuthVariables }>().openapi(
  statsRoute,
  async (c) => {
    const db = c.get('db')

    const countProfiles = async (role: string) => {
      const { count, error } = await db
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('role', role)
      if (error) throw new Error(error.message)
      return count ?? 0
    }

    const [coaches, playersCount, admins, exercisesResult] = await Promise.all([
      countProfiles('COACH'),
      countProfiles('PLAYER'),
      countProfiles('ADMIN'),
      db.from('exercises').select('*', { count: 'exact', head: true }),
    ])
    if (exercisesResult.error) throw new Error(exercisesResult.error.message)

    return c.json(
      {
        ok: true as const,
        stats: {
          coaches,
          players: playersCount,
          admins,
          exercises: exercisesResult.count ?? 0,
        },
      },
      200,
    )
  },
)
```

- [ ] **Step 5: Recablear `app.ts`**

`packages/api/src/app.ts` completo:

```ts
import { OpenAPIHono } from '@hono/zod-openapi'
import { requireRole, withActor, type AuthVariables } from './middleware/auth'
import { onError } from './middleware/error'
import { admin } from './routes/admin'
import { auth } from './routes/auth'
import { health } from './routes/health'
import { players } from './routes/players'

/**
 * App Hono de CoachLab.
 *
 * No es un servicio aparte: la monta Nitro en packages/web/server/api/[...].ts,
 * así que todo el proyecto es un solo deployable en Vercel. El basePath '/api'
 * coincide con la ruta desde la que Nitro la llama, y por eso los tests piden
 * '/api/health' igual que producción.
 */
export const app = new OpenAPIHono<{ Variables: AuthVariables }>().basePath('/api')

app.onError(onError)

app.use('*', withActor)

// Capa 2 de CLAUDE.md §4: el guard cuelga del PREFIJO, no de cada ruta. Toda
// ruta nueva bajo /coach, /player o /admin nace protegida. /player/* queda
// guardado desde ya aunque sus rutas lleguen en F3.
app.use('/coach/*', requireRole(['COACH', 'ADMIN']))
app.use('/player/*', requireRole(['PLAYER']))
app.use('/admin/*', requireRole(['ADMIN']))

app.route('/', health)
app.route('/', auth)
app.route('/', players)
app.route('/', admin)

app.notFound((c) => c.json({ ok: false as const, error: 'No encontrado' }, 404))

// El spec que consume hey-api para generar el cliente tipado del frontend.
app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: { version: '0.1.0', title: 'CoachLab API' },
})

export type App = typeof app
```

- [ ] **Step 6: Tests de rutas en `app.test.ts`**

Agregar al `describe('app')` existente (o en un describe nuevo en el mismo archivo). Sin cookie no
hay ningún viaje a Supabase, así que corren offline:

```ts
describe('guards de F1', () => {
  it('GET /api/auth/me sin sesión → 401 tipado', async () => {
    const res = await app.request('/api/auth/me')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false, error: 'No autorizado' })
  })

  it('GET /api/coach/players sin sesión → 401', async () => {
    const res = await app.request('/api/coach/players')
    expect(res.status).toBe(401)
  })

  it('GET /api/admin/stats sin sesión → 401', async () => {
    const res = await app.request('/api/admin/stats')
    expect(res.status).toBe(401)
  })

  it('el prefijo /player/* ya nace guardado aunque no tenga rutas', async () => {
    const res = await app.request('/api/player/anything')
    expect(res.status).toBe(401)
  })

  it('el spec incluye las rutas nuevas', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as { paths: Record<string, unknown> }
    expect(spec.paths).toHaveProperty('/api/auth/me')
    expect(spec.paths).toHaveProperty('/api/coach/players')
    expect(spec.paths).toHaveProperty('/api/admin/stats')
  })

  it('el health sigue público y vivo (UptimeRobot depende de él)', async () => {
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 7: Correr**

Run: `pnpm --filter @coachlab/api test && pnpm --filter @coachlab/api typecheck`
Expected: PASS (los 4 tests de F0 + los de la Task 6 + estos 6).

- [ ] **Step 8: Commit**

```bash
git add packages/api/src
git commit -m "feat(api): add auth/me, coach/players and admin/stats behind prefix guards"
```

---

### Task 8: Regenerar el contrato

**Files:**
- Regenerate: `packages/web/openapi.json`, `packages/web/generated/`

- [ ] **Step 1: Dump del spec y regeneración del cliente**

```powershell
pnpm dump:openapi
pnpm --filter @coachlab/web generate:api
```

Expected: el dump reporta 4 paths; `packages/web/generated/types.gen.ts` ahora exporta
`MeResponse`, `CoachPlayersResponse`, `AdminStatsResponse` y `ErrorResponse`.

- [ ] **Step 2: Verificar que la web sigue compilando**

Run: `pnpm --filter @coachlab/web typecheck`
Expected: verde (la página de F0 usa `HealthResponse`, que no cambió).

- [ ] **Step 3: Commit**

```bash
git add packages/web/openapi.json packages/web/generated
git commit -m "chore(web): regenerate api client with f1 routes"
```

---

### Task 9: Sesión en Nuxt — plugin, `useAuth`, guard de rutas

**Files:**
- Create: `packages/web/app/plugins/supabase.ts`
- Create: `packages/web/app/composables/useAuth.ts`
- Create: `packages/web/app/middleware/auth.global.ts`

- [ ] **Step 1: Plugin del cliente Supabase**

`packages/web/app/plugins/supabase.ts`:

```ts
import {
  createBrowserClient,
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/types/database'

/**
 * Un cliente de Supabase por contexto: browser client en el navegador (guarda
 * la sesión en cookies) y server client en SSR (la lee de las cookies del
 * request y, si refresca tokens, los Set-Cookie salen en esta misma respuesta).
 *
 * El ciclo de vida de la sesión vive ACÁ, en la web. La API solo la lee para
 * autorizar (packages/api/src/middleware/auth.ts).
 */
export default defineNuxtPlugin(() => {
  const {
    public: { supabaseUrl, supabaseAnonKey },
  } = useRuntimeConfig()

  let supabase: SupabaseClient<Database>

  if (import.meta.server) {
    const event = useRequestEvent()!
    supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll: () =>
          parseCookieHeader(event.node.req.headers.cookie ?? '').map(({ name, value }) => ({
            name,
            value: value ?? '',
          })),
        setAll: (cookies) => {
          for (const { name, value, options } of cookies) {
            event.node.res.appendHeader('Set-Cookie', serializeCookieHeader(name, value, options))
          }
        },
      },
    })
  } else {
    supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
  }

  return { provide: { supabase } }
})
```

- [ ] **Step 2: `useAuth`**

`packages/web/app/composables/useAuth.ts`:

```ts
import type { LoginInput, RegisterInput, SessionUser } from '@coachlab/core/validators/auth'

/** Home de cada rol. La usa el middleware, el login y el registro. */
export const ROLE_HOME: Record<SessionUser['role'], string> = {
  COACH: '/coach/players',
  PLAYER: '/player/week',
  ADMIN: '/admin',
}

/**
 * Estado de sesión compartido SSR→cliente.
 * `undefined` = todavía no se resolvió; `null` = no hay sesión.
 */
export function useAuth() {
  const user = useState<SessionUser | null | undefined>('session-user', () => undefined)
  const { $supabase } = useNuxtApp()

  async function refresh(): Promise<void> {
    const {
      data: { user: authUser },
    } = await $supabase.auth.getUser()

    if (!authUser) {
      user.value = null
      return
    }

    // RLS solo deja leer la fila propia; el rol sale de la tabla, no del JWT.
    const { data: profile } = await $supabase
      .from('profiles')
      .select('id, email, name, role, invite_code, coach_id')
      .eq('id', authUser.id)
      .single()

    user.value = profile
      ? {
          id: profile.id,
          email: profile.email,
          name: profile.name,
          role: profile.role as SessionUser['role'],
          inviteCode: profile.invite_code,
          coachId: profile.coach_id,
        }
      : null
  }

  async function login(input: LoginInput): Promise<void> {
    const { error } = await $supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    })
    if (error) {
      // Mismo mensaje para email inexistente y contraseña mala: no filtramos
      // qué emails están registrados. Supabase ya devuelve un error genérico.
      throw new Error(
        /confirm/i.test(error.message)
          ? 'Confirmá tu email antes de entrar'
          : 'Email o contraseña incorrectos',
      )
    }
    await refresh()
  }

  async function register(input: RegisterInput): Promise<{ needsEmailConfirm: boolean }> {
    if (input.role === 'PLAYER') {
      // Un anónimo no puede leer profiles: la RPC security definer resuelve el
      // código sin abrir la tabla (migración 0004).
      const { data: coachName } = await $supabase.rpc('coach_name_for_invite', {
        code: input.inviteCode!,
      })
      if (!coachName) throw new Error('Ese código no existe. Pedile el suyo a tu entrenador.')
    }

    const { data, error } = await $supabase.auth.signUp({
      email: input.email,
      password: input.password,
      // El trigger handle_new_user (migración 0002) lee esto y crea el perfil:
      // rol, invite code propio si es coach, vínculo al coach si es jugador.
      options: {
        data: {
          name: input.name,
          role: input.role,
          invite_code: input.role === 'PLAYER' ? input.inviteCode : null,
        },
      },
    })

    if (error) {
      throw new Error(
        /already|registered/i.test(error.message)
          ? 'Ya existe una cuenta con ese email'
          : 'No se pudo crear la cuenta. Probá de nuevo.',
      )
    }

    // Con confirmación de email encendida, signUp no devuelve sesión.
    if (!data.session) return { needsEmailConfirm: true }

    await refresh()
    return { needsEmailConfirm: false }
  }

  async function logout(): Promise<void> {
    await $supabase.auth.signOut()
    user.value = null
    await navigateTo('/login')
  }

  return { user, refresh, login, register, logout }
}
```

- [ ] **Step 3: Guard global de rutas**

`packages/web/app/middleware/auth.global.ts`:

```ts
import type { SessionUser } from '@coachlab/core/validators/auth'

const PUBLIC_PATHS = new Set(['/login', '/register'])

const PREFIX_ROLES: ReadonlyArray<readonly [string, ReadonlyArray<SessionUser['role']>]> = [
  ['/coach', ['COACH', 'ADMIN']],
  ['/player', ['PLAYER']],
  ['/admin', ['ADMIN']],
]

/**
 * Capa 5 de CLAUDE.md §4 — esto es UX, no seguridad. Lo que de verdad frena a
 * un jugador en /coach/* es requireRole en la API y RLS en la base.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { user, refresh } = useAuth()

  // Primera resolución (SSR o primer render): una vez por sesión de navegación.
  if (user.value === undefined) await refresh()

  const current = user.value

  if (!current) {
    if (PUBLIC_PATHS.has(to.path)) return
    return navigateTo(
      to.path === '/' ? '/login' : { path: '/login', query: { redirect: to.fullPath } },
    )
  }

  if (PUBLIC_PATHS.has(to.path) || to.path === '/') {
    return navigateTo(ROLE_HOME[current.role])
  }

  const rule = PREFIX_ROLES.find(([prefix]) => to.path.startsWith(prefix))
  if (rule && !rule[1].includes(current.role)) {
    // Rol equivocado: a su home, no un 403 (CLAUDE.md §4, capa 5).
    return navigateTo(ROLE_HOME[current.role])
  }
})
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @coachlab/web typecheck`
Expected: verde. Si `coach_name_for_invite` no aparece en los tipos, la Task 5 Step 3 quedó
pendiente — resolverla antes de seguir, no casteares el rpc.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/plugins/supabase.ts packages/web/app/composables/useAuth.ts packages/web/app/middleware/auth.global.ts
git commit -m "feat(web): add supabase session plugin, useAuth and role route guard"
```

---

### Task 10: Pantallas de login y registro

**Files:**
- Create: `packages/web/app/layouts/auth.vue`
- Create: `packages/web/app/pages/login.vue`
- Create: `packages/web/app/pages/register.vue`

- [ ] **Step 1: Layout `auth`**

`packages/web/app/layouts/auth.vue`:

```vue
<template>
  <div class="min-h-screen flex items-center justify-center bg-elevated p-4">
    <div class="w-full max-w-sm">
      <div class="mb-6 text-center">
        <h1 class="text-2xl font-bold">CoachLab</h1>
        <p class="mt-1 text-sm text-muted">La rutina del plantel, en un solo lugar</p>
      </div>
      <slot />
    </div>
  </div>
</template>
```

- [ ] **Step 2: `login.vue`**

`packages/web/app/pages/login.vue`:

```vue
<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { loginSchema, type LoginInput } from '@coachlab/core/validators/auth'

definePageMeta({ layout: 'auth' })

const { login, user } = useAuth()
const route = useRoute()

const state = reactive({ email: '', password: '' })
const formError = ref<string | null>(null)
const loading = ref(false)

async function onSubmit(event: FormSubmitEvent<LoginInput>) {
  formError.value = null
  loading.value = true
  try {
    await login(event.data)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : null
    await navigateTo(redirect ?? ROLE_HOME[user.value!.role])
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'No se pudo entrar'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UCard>
    <!-- El mismo schema Zod que valida en cualquier borde: no se redefine. -->
    <UForm :schema="loginSchema" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField label="Email" name="email">
        <UInput v-model="state.email" type="email" autocomplete="email" class="w-full" />
      </UFormField>

      <UFormField label="Contraseña" name="password">
        <UInput
          v-model="state.password"
          type="password"
          autocomplete="current-password"
          class="w-full"
        />
      </UFormField>

      <UAlert v-if="formError" color="error" variant="subtle" :title="formError" />

      <UButton type="submit" block :loading="loading">Entrar</UButton>
    </UForm>

    <template #footer>
      <p class="text-center text-sm text-muted">
        ¿No tenés cuenta?
        <NuxtLink to="/register" class="font-medium text-primary">Registrate</NuxtLink>
      </p>
    </template>
  </UCard>
</template>
```

- [ ] **Step 3: `register.vue`**

`packages/web/app/pages/register.vue`:

```vue
<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { registerSchema, type RegisterInput } from '@coachlab/core/validators/auth'

definePageMeta({ layout: 'auth' })

const { register, user } = useAuth()

const state = reactive({
  name: '',
  email: '',
  password: '',
  role: 'PLAYER' as 'PLAYER' | 'COACH',
  inviteCode: '',
})

const ROLE_ITEMS = [
  { label: 'Jugador', value: 'PLAYER' },
  { label: 'Entrenador', value: 'COACH' },
]

const formError = ref<string | null>(null)
const loading = ref(false)
const needsEmailConfirm = ref(false)

async function onSubmit(event: FormSubmitEvent<RegisterInput>) {
  formError.value = null
  loading.value = true
  try {
    const result = await register(event.data)
    if (result.needsEmailConfirm) {
      needsEmailConfirm.value = true
      return
    }
    await navigateTo(ROLE_HOME[user.value!.role])
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'No se pudo crear la cuenta'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UCard>
    <UAlert
      v-if="needsEmailConfirm"
      color="success"
      variant="subtle"
      title="Cuenta creada"
      description="Revisá tu correo para confirmarla y después entrá con tu email y contraseña."
    />

    <UForm
      v-else
      :schema="registerSchema"
      :state="state"
      class="space-y-4"
      @submit="onSubmit"
    >
      <UFormField label="Soy" name="role">
        <USelect v-model="state.role" :items="ROLE_ITEMS" class="w-full" />
      </UFormField>

      <UFormField label="Nombre" name="name">
        <UInput v-model="state.name" autocomplete="name" class="w-full" />
      </UFormField>

      <UFormField label="Email" name="email">
        <UInput v-model="state.email" type="email" autocomplete="email" class="w-full" />
      </UFormField>

      <UFormField label="Contraseña" name="password" hint="Mínimo 8 caracteres">
        <UInput
          v-model="state.password"
          type="password"
          autocomplete="new-password"
          class="w-full"
        />
      </UFormField>

      <UFormField
        v-if="state.role === 'PLAYER'"
        label="Código de tu entrenador"
        name="inviteCode"
        hint="Te lo pasa tu entrenador"
      >
        <UInput
          v-model="state.inviteCode"
          placeholder="ABC234"
          maxlength="6"
          autocapitalize="characters"
          class="w-full font-mono uppercase"
        />
      </UFormField>

      <UAlert v-if="formError" color="error" variant="subtle" :title="formError" />

      <UButton type="submit" block :loading="loading">Crear cuenta</UButton>
    </UForm>

    <template #footer>
      <p class="text-center text-sm text-muted">
        ¿Ya tenés cuenta?
        <NuxtLink to="/login" class="font-medium text-primary">Entrá</NuxtLink>
      </p>
    </template>
  </UCard>
</template>
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @coachlab/web typecheck`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/layouts/auth.vue packages/web/app/pages/login.vue packages/web/app/pages/register.vue
git commit -m "feat(web): add login and register screens"
```

---

### Task 11: Shell con sidebar y páginas por rol

**Files:**
- Create: `packages/web/app/layouts/default.vue`
- Create: `packages/web/app/components/AppSidebar.vue`
- Create: `packages/web/app/pages/coach/players/index.vue`
- Create: `packages/web/app/pages/player/week.vue`
- Create: `packages/web/app/pages/admin/index.vue`
- Modify: `packages/web/app/pages/index.vue`

- [ ] **Step 1: `AppSidebar.vue`**

Nav por rol. Solo links a páginas que EXISTEN en F1 — Grupos/Programas (F2) y Mi perfil (F3) se
agregan cuando exista la página, para no navegar a un 404. En mobile (<768px) colapsa a una barra
inferior: los jugadores entran desde el celular y tres iconos abajo rinden más que un drawer.

`packages/web/app/components/AppSidebar.vue`:

```vue
<script setup lang="ts">
import type { SessionUser } from '@coachlab/core/validators/auth'

const { user, logout } = useAuth()

type NavItem = { to: string; label: string; icon: string }

// Solo páginas que existen: Grupos y Programas se suman en F2, Mi perfil en F3.
const NAV: Record<SessionUser['role'], NavItem[]> = {
  COACH: [{ to: '/coach/players', label: 'Plantel', icon: 'i-lucide-users' }],
  PLAYER: [{ to: '/player/week', label: 'Mi semana', icon: 'i-lucide-calendar-days' }],
  ADMIN: [{ to: '/admin', label: 'Administración', icon: 'i-lucide-shield' }],
}

const items = computed(() => (user.value ? NAV[user.value.role] : []))
</script>

<template>
  <div>
    <!-- Desktop: sidebar fija -->
    <aside
      class="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-default bg-default p-4 md:flex"
    >
      <div class="flex items-center justify-between">
        <span class="text-lg font-bold">CoachLab</span>
        <ColorModeToggle />
      </div>

      <nav class="mt-6 flex-1 space-y-1">
        <NuxtLink
          v-for="item in items"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-elevated"
          active-class="bg-elevated font-medium text-primary"
        >
          <UIcon :name="item.icon" class="size-4" />
          {{ item.label }}
        </NuxtLink>
      </nav>

      <div class="border-t border-default pt-3">
        <p class="truncate text-sm font-medium">{{ user?.name }}</p>
        <p class="truncate text-xs text-muted">{{ user?.email }}</p>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-log-out"
          size="sm"
          class="mt-2"
          @click="logout"
        >
          Salir
        </UButton>
      </div>
    </aside>

    <!-- Mobile: barra inferior -->
    <nav class="fixed inset-x-0 bottom-0 z-10 flex border-t border-default bg-default md:hidden">
      <NuxtLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="flex flex-1 flex-col items-center gap-1 py-2 text-xs text-muted"
        active-class="text-primary"
      >
        <UIcon :name="item.icon" class="size-5" />
        {{ item.label }}
      </NuxtLink>
      <button
        type="button"
        class="flex flex-1 flex-col items-center gap-1 py-2 text-xs text-muted"
        @click="logout"
      >
        <UIcon name="i-lucide-log-out" class="size-5" />
        Salir
      </button>
    </nav>
  </div>
</template>
```

- [ ] **Step 2: Layout `default`**

`packages/web/app/layouts/default.vue`:

```vue
<template>
  <div class="min-h-screen">
    <AppSidebar />
    <main class="pb-16 md:pb-0 md:pl-60">
      <div class="p-4 md:p-8">
        <slot />
      </div>
    </main>
  </div>
</template>
```

- [ ] **Step 3: `/coach/players`**

> **Nombre de archivo:** va `players/index.vue`, no `players.vue` — en F2 llega
> `players/[playerId].vue` y tienen que ser rutas hermanas (`CLAUDE.md` §5, regla de nombres).

`packages/web/app/pages/coach/players/index.vue`:

```vue
<script setup lang="ts">
import type { CoachPlayersResponse } from '~~/generated'

const { user } = useAuth()

// En SSR el fetch interno no arrastra la cookie solo: se reenvía explícita.
const { data, error } = await useFetch<CoachPlayersResponse>('/api/coach/players', {
  headers: useRequestHeaders(['cookie']),
})

const copied = ref(false)
async function copyCode() {
  if (!user.value?.inviteCode) return
  await navigator.clipboard.writeText(user.value.inviteCode)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Plantel</h1>

    <!-- Lo primero que un coach recién registrado necesita: su código. -->
    <UCard v-if="user?.inviteCode">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p class="text-sm text-muted">Tu código de invitación</p>
          <p class="font-mono text-3xl font-bold tracking-widest">{{ user.inviteCode }}</p>
        </div>
        <UButton
          :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
          color="neutral"
          variant="outline"
          @click="copyCode"
        >
          {{ copied ? 'Copiado' : 'Copiar' }}
        </UButton>
      </div>
      <p class="mt-3 text-sm text-muted">
        Pasáselo a tus jugadores: lo ingresan al registrarse y quedan en tu plantel.
      </p>
    </UCard>

    <UAlert
      v-if="error"
      color="error"
      title="No se pudo cargar el plantel"
      :description="error.message"
    />

    <UCard v-else-if="data && data.players.length === 0">
      <p class="text-muted">
        Todavía no hay jugadores. Compartí tu código y van a aparecer acá al registrarse.
      </p>
    </UCard>

    <UCard v-else-if="data">
      <ul class="divide-y divide-default">
        <li v-for="player in data.players" :key="player.id" class="flex items-center gap-3 py-3">
          <UIcon name="i-lucide-user" class="size-5 text-muted" />
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium">{{ player.name }}</p>
            <p class="truncate text-sm text-muted">{{ player.email }}</p>
          </div>
          <span class="text-sm text-muted">{{ player.positionId ?? 'Sin puesto' }}</span>
        </li>
      </ul>
    </UCard>
  </div>
</template>
```

- [ ] **Step 4: `/player/week` placeholder**

`packages/web/app/pages/player/week.vue`:

```vue
<script setup lang="ts">
const { user } = useAuth()
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Mi semana</h1>

    <!-- Jugador sin coach: el trigger no vincula si el código no matcheó. -->
    <UAlert
      v-if="user && !user.coachId"
      color="warning"
      variant="subtle"
      title="Tu cuenta no está vinculada a un entrenador"
      description="Pedile el código a tu entrenador. En la pantalla de perfil (próximamente) vas a poder ingresarlo."
    />

    <UCard v-else>
      <p class="text-muted">
        Todavía no tenés un programa asignado. Cuando tu entrenador te asigne uno, lo vas a ver acá.
      </p>
    </UCard>
  </div>
</template>
```

- [ ] **Step 5: `/admin` landing**

El seed crea un ADMIN desde F0 y el middleware lo manda a `/admin`; sin esta página, el único
usuario que existe caería en un 404.

`packages/web/app/pages/admin/index.vue`:

```vue
<script setup lang="ts">
import type { AdminStatsResponse } from '~~/generated'

const { data, error } = await useFetch<AdminStatsResponse>('/api/admin/stats', {
  headers: useRequestHeaders(['cookie']),
})

const CARDS = [
  { key: 'coaches', label: 'Entrenadores', icon: 'i-lucide-clipboard-list' },
  { key: 'players', label: 'Jugadores', icon: 'i-lucide-users' },
  { key: 'admins', label: 'Admins', icon: 'i-lucide-shield' },
  { key: 'exercises', label: 'Ejercicios', icon: 'i-lucide-dumbbell' },
] as const
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Administración</h1>

    <UAlert v-if="error" color="error" title="No se pudo cargar" :description="error.message" />

    <div v-else-if="data" class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <UCard v-for="card in CARDS" :key="card.key">
        <div class="flex items-center gap-3">
          <UIcon :name="card.icon" class="size-6 text-muted" />
          <div>
            <p class="text-2xl font-bold">{{ data.stats[card.key] }}</p>
            <p class="text-sm text-muted">{{ card.label }}</p>
          </div>
        </div>
      </UCard>
    </div>

    <p class="text-sm text-muted">
      El CRUD del catálogo de ejercicios queda fuera del MVP: se gestiona con el seed.
    </p>
  </div>
</template>
```

- [ ] **Step 6: Reemplazar la página de humo**

`packages/web/app/pages/index.vue` completo (la página de F0 cumplió su ciclo; el estado de la
base sigue visible en `/api/health`):

```vue
<script setup lang="ts">
// auth.global.ts nunca deja renderizar esta ruta: redirige a /login o a la
// home del rol. El template existe solo para que la ruta '/' sea válida.
</script>

<template>
  <div />
</template>
```

- [ ] **Step 7: Typecheck + build**

Run: `pnpm --filter @coachlab/web typecheck && pnpm build`
Expected: verde y `Build complete`.

- [ ] **Step 8: Commit**

```bash
git add packages/web/app
git commit -m "feat(web): add authenticated shell with role-based sidebar and pages"
```

---

### Task 12: Verificación en vivo, auditoría y cierre

- [ ] **Step 1: Suite completa**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: todo verde (34 tests de F0 + los nuevos de core y api).

- [ ] **Step 2: Flujo completo contra el proyecto real**

```powershell
pnpm dev
```

En el browser (`http://localhost:3000`):

1. `/` sin sesión → redirige a `/login`.
2. `/register` → crear un coach (rol Entrenador). Expected: entra directo a `/coach/players` y ve
   su código de 6 caracteres en grande.
3. Copiar el código. "Salir".
4. `/register` → jugador con código inventado `ZZZZZZ`. Expected: error "Ese código no existe"
   sin crear la cuenta.
5. Registrar el jugador con el código real. Expected: entra a `/player/week` con el placeholder
   (sin el warning de "no vinculado").
6. Como jugador, navegar a `/coach/players` a mano. Expected: rebota a `/player/week`.
7. `GET http://localhost:3000/api/coach/players` con la sesión del jugador (curl con la cookie o
   la pestaña Network). Expected: **401** — la capa que de verdad frena no es el redirect.
8. "Salir" → `/coach/players` sin sesión → `/login?redirect=/coach/players`. Entrar como coach →
   cae en `/coach/players` y el jugador aparece en el plantel.
9. Recargar con F5. Expected: la sesión sobrevive (SSR leyó la cookie, sin flash de login).
10. Entrar con el admin del seed (`admin@coachlab.local`). Expected: cae en `/admin` con los
    contadores.
11. Registrar de nuevo el email del coach. Expected: "Ya existe una cuenta con ese email".

Limpieza: borrar los usuarios de prueba desde el dashboard de Supabase (Authentication → Users)
o dejarlos como datos de desarrollo.

- [ ] **Step 3: Auditoría RBAC**

Dispatch del agente `rbac-auditor` sobre `packages/api/src/` y las políticas nuevas. Foco: los
tres prefijos con `requireRole`, `/auth/me` como única ruta autenticada sin guard de rol, que el
rol se lea de `profiles` y no del JWT, que `coach_name_for_invite` revele solo el nombre, y que
ninguna ruta use `service_role`. Resolver hallazgos antes de cerrar.

- [ ] **Step 4: Documentar y marcar la fase**

1. En `CLAUDE.md` §6, marcar F1:

```markdown
- [x] **F1 — Auth y shell**: registro/login con Supabase Auth, trigger que crea el `profile`, middleware de rol en Hono, guards de ruta en Nuxt, layout con sidebar, vínculo jugador↔coach por invite code.
```

2. Escribir `docs/IMPLEMENTATION-F1.md` con el mismo formato que el de F0: qué se hizo, mapa de
   archivos, decisiones (auth client-side vs rutas propias, la RPC del invite code, 401 vs 404),
   problemas encontrados y deuda.
3. En `docs/superpowers/plans/2026-07-27-f1-auth-shell.md`, reemplazar el aviso de "parcialmente
   obsoleto" por una línea al tope: `> **OBSOLETO — reemplazado por 2026-07-28-f1-auth-shell.md
   tras el cambio de stack. Se conserva como registro.**`

- [ ] **Step 5: Commit final**

```bash
git add CLAUDE.md docs
git commit -m "docs: mark F1 complete and record implementation notes"
```

El merge a `main` y el deploy quedan para cuando el dueño del repo revise la rama
(`superpowers:finishing-a-development-branch`).

---

## Definición de terminado

- Un coach se registra y ve su código de invitación de 6 caracteres en `/coach/players`.
- Un jugador se registra con ese código y aparece en el plantel del coach; con un código
  inexistente el registro no crea la cuenta.
- Login/logout funcionan; la sesión sobrevive un F5 (SSR lee la cookie).
- Rol equivocado en una ruta del frontend → redirect a su home; en la API → 401 tipado.
- `/api/health` sigue respondiendo igual (UptimeRobot no se entera de F1).
- `pnpm verify:setup` en verde con los 5 checks nuevos (RPC + signUp real).
- `rbac-auditor` sin hallazgos abiertos.
- `pnpm lint && pnpm typecheck && pnpm test` en verde.
