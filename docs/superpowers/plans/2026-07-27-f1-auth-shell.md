# F1 — Auth y shell Implementation Plan

> ## ⚠ PARCIALMENTE OBSOLETO — cambio de stack del 2026-07-27
>
> Este plan se escribió contra **AWS + DynamoDB + ElectroDB + JWT propio**, stack que se
> descartó a mitad de F0. Las razones están en `CLAUDE.md` §1 ("Historial de stack").
>
> **Qué sigue siendo válido:** todo lo que describe *comportamiento de producto* — pantallas,
> flujos, textos de UI, reglas de negocio, criterios de aceptación y casos borde. Esa parte
> es la que costó pensar y no cambió.
>
> **Qué NO usar:** cualquier paso que mencione ElectroDB, entidades, `pk`/`sk`, GSI1/GSI2,
> `TransactWrite`, items de unicidad, `Resource`, SST, Lambda, argon2 o el JWT propio.
> El equivalente actual está en `CLAUDE.md` §3 (tablas y `CHECK`) y §4 (RLS + 5 capas).
>
> **Antes de ejecutar esta fase:** regenerar el plan contra el stack vigente. Es más barato
> y más confiable que parchear los pasos de abajo uno por uno.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un coach se registre y obtenga su código de invitación, que un jugador se registre con ese
código y quede vinculado, que ambos entren con email+contraseña, y que cada rol solo alcance sus rutas
— con las 4 capas de RBAC de `CLAUDE.md` §4 construidas y testeadas.

**Architecture:** La API emite un JWT firmado con el secreto de SST y lo devuelve en una cookie
httpOnly. Para que esa cookie sirva, **web y API tienen que vivir bajo el mismo dominio**: eso lo
resuelve un `Router` de CloudFront que rutea `/api/*` a la Lambda de la API y todo lo demás a la de
Nuxt. En Hono, `/coach/*`, `/player/*` y `/admin/*` son sub-apps montadas con su middleware de rol, y
todo acceso a datos pasa por los helpers de scope de `packages/core/src/access/`.

**Tech Stack:** Hono + `hono/jwt`, `@node-rs/argon2`, ElectroDB `TransactWrite`, Zod, Nuxt UI, Vitest.

**Precondición:** F0 mergeado en `main`.

---

### Task 1: Un solo dominio para web y API

Sin esto, la cookie de sesión no funciona: la API vive en una URL de Lambda y Nuxt en otra de
CloudFront, y una cookie httpOnly emitida por un dominio no viaja al otro. Se arregla antes de escribir
una línea de auth, no después de pelearse con `SameSite`.

**Files:**
- Modify: `infra/api.ts`, `infra/web.ts`, `sst.config.ts`

- [ ] **Step 1: Router en `infra/api.ts`**

```ts
import { jwtSecret } from './secrets'
import { table } from './storage'

export const api = new sst.aws.Function('Api', {
  handler: 'packages/api/src/index.handler',
  runtime: 'nodejs22.x',
  architecture: 'arm64',
  link: [table, jwtSecret],
  url: true,
  nodejs: { install: ['@node-rs/argon2'] },
})

/**
 * Un solo dominio para todo. `/api/*` va a la Lambda de la API y el resto a Nuxt,
 * así la cookie httpOnly de sesión viaja a ambos sin CORS ni SameSite=None.
 */
export const router = new sst.aws.Router('Router', {
  routes: {
    '/api/*': api.url,
  },
})
```

- [ ] **Step 2: Colgar Nuxt del mismo Router**

`infra/web.ts`:

```ts
import { api, router } from './api'

export const web = new sst.aws.Nuxt('Web', {
  path: 'packages/web',
  link: [api],
  router: { instance: router },
  environment: {
    // Mismo origen: el cliente generado pega a rutas relativas.
    NUXT_PUBLIC_API_BASE: '/api',
  },
})
```

- [ ] **Step 3: Prefijar las rutas de la API**

En `packages/api/src/index.ts`, montar todo bajo `/api` (`app.route('/api', …)` o `basePath('/api')`)
para que el path que llega desde CloudFront coincida.

- [ ] **Step 4: Regenerar el cliente apuntando al nuevo origen**

En `packages/web/openapi-ts.config.ts`, el `baseUrl` del cliente pasa a `/api`.

- [ ] **Step 5: Desplegar y verificar**

```powershell
pnpm dlx sst deploy --stage <tu-nombre>
curl "<router-url>/api/health"
```

Expected: `{"ok":true,...}` desde el **mismo** dominio donde carga la web.

- [ ] **Step 6: Commit**

```bash
git checkout -b feature/f1-auth-shell
git add infra packages/api packages/web
git commit -m "feat(infra): serve web and api from a single cloudfront domain"
```

---

### Task 2: `inviteCode` — generación pura

**Files:**
- Create: `packages/core/src/domain/inviteCode.ts`
- Test: `packages/core/src/domain/inviteCode.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { describe, expect, it } from 'vitest'
import { INVITE_CODE_ALPHABET, generateInviteCode, isValidInviteCode } from './inviteCode'

describe('generateInviteCode', () => {
  it('genera 6 caracteres del alfabeto permitido', () => {
    const code = generateInviteCode()
    expect(code).toHaveLength(6)
    for (const char of code) expect(INVITE_CODE_ALPHABET).toContain(char)
  })

  it('excluye caracteres ambiguos (0/O, 1/I/L)', () => {
    for (const char of '01OIL') expect(INVITE_CODE_ALPHABET).not.toContain(char)
  })

  it('usa la fuente de aleatoriedad inyectada', () => {
    expect(generateInviteCode(() => 0)).toBe(INVITE_CODE_ALPHABET[0]!.repeat(6))
  })

  it('no repite en 1000 generaciones', () => {
    const codes = new Set(Array.from({ length: 1000 }, () => generateInviteCode()))
    expect(codes.size).toBe(1000)
  })
})

describe('isValidInviteCode', () => {
  it('acepta un código válido', () => {
    expect(isValidInviteCode('ABC234')).toBe(true)
  })

  it('normaliza minúsculas antes de validar', () => {
    expect(isValidInviteCode('abc234')).toBe(true)
  })

  it('rechaza largo incorrecto', () => {
    expect(isValidInviteCode('ABC23')).toBe(false)
    expect(isValidInviteCode('ABC2345')).toBe(false)
  })

  it('rechaza caracteres ambiguos', () => {
    expect(isValidInviteCode('ABC01O')).toBe(false)
  })
})
```

- [ ] **Step 2: Correr para ver que falla** → FAIL.

- [ ] **Step 3: Implementar**

`packages/core/src/domain/inviteCode.ts`:

```ts
/** Sin 0/O ni 1/I/L: se dictan por teléfono y por WhatsApp. */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export const INVITE_CODE_LENGTH = 6

/** `randomInt(max)` devuelve un entero en [0, max). Inyectable para tests. */
export type RandomInt = (max: number) => number

const defaultRandomInt: RandomInt = (max) => Math.floor(Math.random() * max)

export function generateInviteCode(randomInt: RandomInt = defaultRandomInt): string {
  let code = ''
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)]
  }
  return code
}

export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase()
}

export function isValidInviteCode(raw: string): boolean {
  const code = normalizeInviteCode(raw)
  if (code.length !== INVITE_CODE_LENGTH) return false
  return [...code].every((char) => INVITE_CODE_ALPHABET.includes(char))
}
```

- [ ] **Step 4: Correr para ver que pasa** → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/domain/inviteCode*
git commit -m "feat(domain): add invite code generation and validation"
```

---

### Task 3: Schemas Zod de auth

**Files:**
- Create: `packages/core/src/validators/auth.ts`
- Test: `packages/core/src/validators/auth.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { describe, expect, it } from 'vitest'
import { loginSchema, registerSchema } from './auth'

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

  it('normaliza el email a minúsculas', () => {
    expect(registerSchema.parse({ ...validCoach, email: 'Ana@Club.UY' }).email).toBe('ana@club.uy')
  })

  it('rechaza contraseña de menos de 8 caracteres', () => {
    expect(registerSchema.safeParse({ ...validCoach, password: 'corta12' }).success).toBe(false)
  })

  it('exige invite code cuando el rol es PLAYER', () => {
    const result = registerSchema.safeParse({ ...validCoach, role: 'PLAYER' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['inviteCode'])
  })

  it('acepta un jugador con invite code y lo normaliza', () => {
    const result = registerSchema.parse({ ...validCoach, role: 'PLAYER', inviteCode: 'abc234' })
    expect(result.inviteCode).toBe('ABC234')
  })

  it('rechaza un invite code con caracteres ambiguos', () => {
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
```

- [ ] **Step 2: Correr para ver que falla** → FAIL.

- [ ] **Step 3: Implementar**

`packages/core/src/validators/auth.ts`:

```ts
import { z } from 'zod'
import { isValidInviteCode, normalizeInviteCode } from '../domain/inviteCode'

export const loginSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase().trim(),
  password: z.string().min(1, 'Ingresá tu contraseña'),
})

export type LoginInput = z.infer<typeof loginSchema>

export const registerSchema = z
  .object({
    name: z.string().min(2, 'Mínimo 2 caracteres').max(80).trim(),
    email: z.string().email('Email inválido').toLowerCase().trim(),
    password: z.string().min(8, 'Mínimo 8 caracteres').max(200),
    // ADMIN queda afuera a propósito: solo por seed o CLI (CLAUDE.md §4).
    role: z.enum(['COACH', 'PLAYER']),
    inviteCode: z
      .string()
      .transform(normalizeInviteCode)
      .refine((code) => code === '' || isValidInviteCode(code), 'Código inválido')
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === 'PLAYER' && !data.inviteCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['inviteCode'],
        message: 'Necesitás el código de tu entrenador',
      })
    }
  })

export type RegisterInput = z.infer<typeof registerSchema>

export const sessionUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.enum(['PLAYER', 'COACH', 'ADMIN']),
  inviteCode: z.string().nullable(),
})

export type SessionUser = z.infer<typeof sessionUserSchema>
```

- [ ] **Step 4: Correr para ver que pasa** → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/validators
git commit -m "feat(validators): add login and register zod schemas"
```

---

### Task 4: Permisos puros — capa de decisión

**Files:**
- Create: `packages/core/src/access/rbac.ts`
- Test: `packages/core/src/access/rbac.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { describe, expect, it } from 'vitest'
import { NotFoundError, assertFound, can, hasRole } from './rbac'

const coach = { id: 'u1', role: 'COACH' as const }
const player = { id: 'u2', role: 'PLAYER' as const }
const admin = { id: 'u3', role: 'ADMIN' as const }

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

  it('ADMIN no hereda roles automáticamente', () => {
    // Si una ruta es solo de COACH, ADMIN también tiene que listarse explícitamente.
    expect(hasRole(admin, ['COACH'])).toBe(false)
  })
})

describe('can', () => {
  it('el coach gestiona su propio plantel', () => {
    expect(can(coach, 'manage', { kind: 'player', coachUserId: 'u1' })).toBe(true)
  })

  it('el coach NO gestiona plantel ajeno', () => {
    expect(can(coach, 'manage', { kind: 'player', coachUserId: 'otro' })).toBe(false)
  })

  it('el jugador lee lo suyo', () => {
    expect(can(player, 'read', { kind: 'player', userId: 'u2', coachUserId: 'u1' })).toBe(true)
  })

  it('el jugador no lee a otro jugador', () => {
    expect(can(player, 'read', { kind: 'player', userId: 'otro', coachUserId: 'u1' })).toBe(false)
  })

  it('el admin puede todo', () => {
    expect(can(admin, 'manage', { kind: 'player', coachUserId: 'cualquiera' })).toBe(true)
  })

  it('sin actor no puede nada', () => {
    expect(can(null, 'read', { kind: 'player', userId: 'u2', coachUserId: 'u1' })).toBe(false)
  })
})

describe('assertFound', () => {
  it('devuelve el recurso cuando existe', () => {
    expect(assertFound({ id: 'x' })).toEqual({ id: 'x' })
  })

  it('lanza NotFoundError con null — nunca un 403', () => {
    expect(() => assertFound(null)).toThrow(NotFoundError)
  })

  it('lanza NotFoundError con undefined', () => {
    expect(() => assertFound(undefined)).toThrow(NotFoundError)
  })
})
```

- [ ] **Step 2: Correr para ver que falla** → FAIL.

- [ ] **Step 3: Implementar**

`packages/core/src/access/rbac.ts`:

```ts
export type Role = 'PLAYER' | 'COACH' | 'ADMIN'

export type Actor = { id: string; role: Role } | null

export type Action = 'read' | 'manage'

export type Resource =
  | { kind: 'player'; userId?: string; coachUserId: string }
  | { kind: 'program'; coachUserId: string }
  | { kind: 'group'; coachUserId: string | null; isSystem: boolean }

/**
 * Recurso ajeno responde 404, nunca 403: un 403 confirma que el recurso existe
 * (CLAUDE.md §4, capa 3).
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

export function assertFound<T>(resource: T | null | undefined): T {
  if (resource === null || resource === undefined) throw new NotFoundError()
  return resource
}

/** ADMIN no está implícito: si una ruta lo admite, tiene que listarlo. */
export function hasRole(actor: Actor, allowed: Role[]): boolean {
  if (!actor) return false
  return allowed.includes(actor.role)
}

export function can(actor: Actor, action: Action, resource: Resource): boolean {
  if (!actor) return false
  if (actor.role === 'ADMIN') return true

  switch (resource.kind) {
    case 'player':
      if (actor.role === 'COACH') return resource.coachUserId === actor.id
      if (actor.role === 'PLAYER') return action === 'read' && resource.userId === actor.id
      return false

    case 'program':
      if (actor.role === 'COACH') return resource.coachUserId === actor.id
      return action === 'read'

    case 'group':
      if (actor.role === 'COACH') {
        if (resource.isSystem) return action === 'read'
        return resource.coachUserId === actor.id
      }
      return action === 'read'
  }
}
```

- [ ] **Step 4: Correr para ver que pasa** → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/access
git commit -m "feat(access): add pure rbac decisions with 404-not-403 semantics"
```

---

### Task 5: Registro con `TransactWrite`

La parte donde DynamoDB muerde si se hace de más. Dos usuarios registrándose con el mismo email en el
mismo segundo tienen que fallar uno, y eso solo lo garantiza una transacción condicional.

**Files:**
- Create: `packages/core/src/access/users.ts`
- Modify: `packages/core/src/entities/index.ts`

- [ ] **Step 1: Escribir el helper de registro**

`packages/core/src/access/users.ts`:

```ts
import { ulid } from 'ulid'
import { db, UniqueEmailEntity, UniqueInviteCodeEntity, UserEntity } from '../entities'
import { generateInviteCode } from '../domain/inviteCode'
import type { Role } from './rbac'

export type CreateUserInput = {
  name: string
  email: string
  passwordHash: string
  role: Exclude<Role, 'ADMIN'>
  coachId?: string
}

export type CreateUserResult =
  | { ok: true; userId: string; inviteCode: string | null }
  | { ok: false; reason: 'email-taken' | 'invite-code-collision' }

/**
 * Crea el User y su item de unicidad en UNA transacción condicional.
 * Un GSI no sirve para esto: es eventualmente consistente y dos registros
 * simultáneos con el mismo email pasarían los dos.
 */
export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
  const userId = ulid()
  const inviteCode = input.role === 'COACH' ? generateInviteCode() : null

  try {
    await db.transaction
      .write(({ user, uniqueEmail, uniqueInviteCode }) => [
        user
          .create({
            userId,
            email: input.email,
            passwordHash: input.passwordHash,
            name: input.name,
            role: input.role,
            ...(inviteCode ? { inviteCode } : {}),
            ...(input.coachId ? { coachId: input.coachId } : {}),
          })
          .commit(),
        // .create() agrega attribute_not_exists sobre la clave: es el candado.
        uniqueEmail.create({ email: input.email, userId }).commit(),
        ...(inviteCode
          ? [uniqueInviteCode.create({ inviteCode, coachId: userId }).commit()]
          : []),
      ])
      .go()
  } catch (error) {
    // La transacción falla entera si CUALQUIER condición no se cumple.
    // El caso abrumadoramente probable es el email; la colisión de código
    // tiene 1 en 887M y se resuelve reintentando.
    const taken = await UniqueEmailEntity.get({ email: input.email }).go()
    return { ok: false, reason: taken.data ? 'email-taken' : 'invite-code-collision' }
  }

  return { ok: true, userId, inviteCode }
}

/** Login: dos gets fuertemente consistentes, sin pasar por un GSI. */
export async function findUserByEmail(email: string) {
  const unique = await UniqueEmailEntity.get({ email }).go()
  if (!unique.data) return null
  const user = await UserEntity.get({ userId: unique.data.userId }).go()
  return user.data
}

export async function findCoachByInviteCode(inviteCode: string) {
  const unique = await UniqueInviteCodeEntity.get({ inviteCode }).go()
  if (!unique.data) return null
  const coach = await UserEntity.get({ userId: unique.data.coachId }).go()
  return coach.data?.role === 'COACH' ? coach.data : null
}
```

- [ ] **Step 2: Verificar**

Run: `pnpm typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/access/users.ts
git commit -m "feat(access): add transactional user creation with unique email"
```

---

### Task 6: Middleware de auth y de rol

**Files:**
- Create: `packages/api/src/middleware/auth.ts`
- Create: `packages/api/src/middleware/error.ts`

- [ ] **Step 1: JWT y sesión**

`packages/api/src/middleware/auth.ts`:

```ts
import { createMiddleware } from 'hono/factory'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { sign, verify } from 'hono/jwt'
import { Resource } from 'sst'
import { UserEntity } from '@coachlab/core/entities'
import { hasRole, UnauthorizedError, type Actor, type Role } from '@coachlab/core/access'

export const SESSION_COOKIE = 'coachlab_session'
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30

type Vars = { actor: Actor }

export async function issueSession(
  c: { header: (k: string, v: string) => void } & Parameters<typeof setCookie>[0],
  user: { userId: string; role: Role },
) {
  const token = await sign(
    { sub: user.userId, role: user.role, exp: Math.floor(Date.now() / 1000) + THIRTY_DAYS_SECONDS },
    Resource.JwtSecret.value,
  )

  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: THIRTY_DAYS_SECONDS,
  })
}

export function clearSession(c: Parameters<typeof deleteCookie>[0]) {
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}

/**
 * Resuelve el actor desde la cookie. NO rechaza: eso es tarea de requireRole,
 * para que las rutas públicas puedan saber si hay sesión sin exigirla.
 */
export const withActor = createMiddleware<{ Variables: Vars }>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) {
    c.set('actor', null)
    return next()
  }

  try {
    const payload = await verify(token, Resource.JwtSecret.value)
    const userId = String(payload.sub)

    // El rol del token sirve para el guard grueso, pero se revalida contra la tabla:
    // pudo cambiar después de emitido (CLAUDE.md §4).
    const user = await UserEntity.get({ userId }).go()
    c.set('actor', user.data ? { id: user.data.userId, role: user.data.role } : null)
  } catch {
    c.set('actor', null)
  }

  return next()
})

/** Capa 2 de CLAUDE.md §4: primera línea de toda ruta que toque datos. */
export function requireRole(allowed: Role[]) {
  return createMiddleware<{ Variables: Vars }>(async (c, next) => {
    if (!hasRole(c.get('actor'), allowed)) throw new UnauthorizedError()
    return next()
  })
}
```

- [ ] **Step 2: Manejo de errores centralizado**

`packages/api/src/middleware/error.ts`:

```ts
import type { ErrorHandler } from 'hono'
import { NotFoundError, UnauthorizedError } from '@coachlab/core/access'

/**
 * Traduce los errores del dominio a status. El 404 de NotFoundError es
 * deliberado: es lo que hace indistinguible "no existe" de "no es tuyo".
 */
export const onError: ErrorHandler = (err, c) => {
  if (err instanceof NotFoundError) {
    return c.json({ ok: false as const, error: 'No encontrado' }, 404)
  }
  if (err instanceof UnauthorizedError) {
    return c.json({ ok: false as const, error: 'No autorizado' }, 401)
  }
  console.error(err)
  return c.json({ ok: false as const, error: 'Error interno' }, 500)
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/api/src/middleware
git commit -m "feat(api): add jwt session and role middleware"
```

---

### Task 7: Rutas de auth

**Files:**
- Create: `packages/api/src/routes/auth.ts`
- Modify: `packages/api/src/index.ts`

- [ ] **Step 1: Las rutas**

`packages/api/src/routes/auth.ts` expone, todas con `@hono/zod-openapi` para que entren al spec:

| Método | Path | Guard | Comportamiento |
|---|---|---|---|
| POST | `/auth/register` | público | Valida con `registerSchema`. Si `role=PLAYER`, resuelve el coach con `findCoachByInviteCode`; si no existe → 400 "El código de invitación no existe". Hashea con argon2, llama `createUser`, emite la cookie y devuelve el `SessionUser`. `email-taken` → 409 "Ya existe una cuenta con ese email". `invite-code-collision` → reintenta una vez y si vuelve a fallar, 500 |
| POST | `/auth/login` | público | Valida con `loginSchema`, `findUserByEmail`, `verify` de argon2. **Mismo mensaje de error para usuario inexistente y contraseña incorrecta** ("Email o contraseña incorrectos"), para no filtrar qué emails están registrados. Emite la cookie |
| POST | `/auth/logout` | público | `clearSession` |
| GET | `/auth/me` | `withActor` | Devuelve el `SessionUser` o 401. Es lo que Nuxt consulta en SSR para armar el layout |

Regla que no se negocia: `register` y `login` son las **únicas** rutas sin `requireRole`, y por eso son
las dos que `rbac-auditor` mira con más atención. Cualquier ruta nueva sin guard es un hallazgo.

- [ ] **Step 2: Montar los grupos en `index.ts`**

```ts
import { OpenAPIHono } from '@hono/zod-openapi'
import { handle } from 'hono/aws-lambda'
import { onError } from './middleware/error'
import { requireRole, withActor } from './middleware/auth'
import { authRoutes } from './routes/auth'

export const app = new OpenAPIHono().basePath('/api')

app.onError(onError)
app.use('*', withActor)

app.route('/auth', authRoutes)

// Capa 1 de CLAUDE.md §4: el guard cuelga del GRUPO, no de cada ruta.
// Una ruta nueva montada acá adentro nace protegida.
app.use('/coach/*', requireRole(['COACH', 'ADMIN']))
app.use('/player/*', requireRole(['PLAYER']))
app.use('/admin/*', requireRole(['ADMIN']))

app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: { version: '0.1.0', title: 'CoachLab API' },
})

export const handler = handle(app)
```

- [ ] **Step 3: Tests de las rutas**

`packages/api/src/routes/auth.test.ts`, con `app.request()` — sin servidor ni deploy:

- `POST /api/auth/login` con email inexistente y con contraseña mala devuelven **el mismo** body y status.
- `POST /api/auth/register` con `role: 'ADMIN'` → 400.
- `POST /api/auth/register` con un invite code inexistente → 400 con el mensaje del código.
- `GET /api/auth/me` sin cookie → 401.
- `GET /api/coach/...` sin cookie → 401; con cookie de PLAYER → 401.

- [ ] **Step 4: Correr**

Run: `pnpm --filter @coachlab/api test`
Expected: PASS.

- [ ] **Step 5: Desplegar y probar a mano**

```powershell
pnpm dlx sst deploy --stage <tu-nombre>
```

1. `POST /api/auth/register` con un coach. Expected: 200, cookie `coachlab_session` en la respuesta,
   body con `inviteCode` de 6 caracteres.
2. Registrar un jugador con ese código. Expected: 200 y el jugador queda con `coachId`.
3. Registrar el mismo email dos veces. Expected: 409.
4. Registrar un jugador con código `ZZZZZZ`. Expected: 400.

- [ ] **Step 6: Commit**

```bash
git add packages/api
git commit -m "feat(api): add register, login, logout and me routes"
```

---

### Task 8: Sesión en Nuxt

**Files:**
- Create: `packages/web/app/composables/useAuth.ts`
- Create: `packages/web/app/middleware/auth.global.ts`
- Create: `packages/web/app/plugins/api.ts`

- [ ] **Step 1: Reenviar la cookie en SSR**

El detalle que rompe a todo el mundo la primera vez: en SSR, el `fetch` del servidor **no** manda
automáticamente la cookie del browser. Hay que reenviarla.

`packages/web/app/plugins/api.ts` configura el cliente generado para que, cuando corre en el server,
copie el header `cookie` de la request entrante:

```ts
export default defineNuxtPlugin(() => {
  const headers = import.meta.server ? useRequestHeaders(['cookie']) : {}
  // Configurar el cliente de hey-api con estos headers y credentials: 'include'.
})
```

- [ ] **Step 2: `useAuth`**

Composable que expone `user` (un `SessionUser | null`), `login`, `register`, `logout`. Usa
`useState` para que el valor resuelto en SSR viaje al cliente sin un segundo fetch.

- [ ] **Step 3: Middleware global de ruta**

`auth.global.ts`, la capa 4 de `CLAUDE.md` §4:

- Rutas públicas: `/login`, `/register`.
- Sin sesión en una ruta privada → redirect a `/login?redirect=<path>`.
- Con sesión en `/login` o `/register` → redirect a la home del rol.
- Rol equivocado para el prefijo → redirect a su home, **no** un 403.

Home por rol: `COACH → /coach/players`, `PLAYER → /player/week`, `ADMIN → /admin`.

> Esto es UX. Que el jugador no vea el link no es lo que lo detiene: lo detiene el `requireRole` de la
> Task 6.

- [ ] **Step 4: Commit**

```bash
git add packages/web/app
git commit -m "feat(web): add session composable and role route guards"
```

---

### Task 9: Pantallas de login y registro

**Files:**
- Create: `packages/web/app/layouts/auth.vue`
- Create: `packages/web/app/pages/login.vue`, `packages/web/app/pages/register.vue`

- [ ] **Step 1: Layout `auth`**

Centrado, ancho máximo ~24rem, fondo `bg-muted`. Lo usan login y registro.

- [ ] **Step 2: `login.vue`**

`UForm` con resolver de `loginSchema` (el mismo módulo que valida la API — no se redefine).
Campos email y contraseña, botón "Entrar", link a "Registrate". El error de la API se muestra tal cual
viene: ya está redactado para no filtrar qué emails existen.

- [ ] **Step 3: `register.vue`**

`UForm` con `registerSchema`. Campos: nombre, email, contraseña, y un `USelect` "Soy" con Jugador /
Entrenador. **El campo "Código de tu entrenador" aparece solo cuando el rol es Jugador**, con
`autocapitalize="characters"` y placeholder `ABC234`.

- [ ] **Step 4: Probar el flujo**

```powershell
pnpm dlx sst dev --stage <tu-nombre>
```

1. `/register` → crear un coach. Expected: redirige a `/coach/players`.
2. Copiar el invite code (visible en la Task 10).
3. Cerrar sesión, registrar un jugador con ese código. Expected: redirige a `/player/week`.
4. `/coach/players` como jugador. Expected: redirige a `/player/week`.
5. `/coach/players` sin sesión. Expected: redirige a `/login?redirect=/coach/players`.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app
git commit -m "feat(web): add login and register screens"
```

---

### Task 10: Shell con sidebar

**Files:**
- Create: `packages/web/app/layouts/default.vue`
- Create: `packages/web/app/components/AppSidebar.vue`
- Create: `packages/web/app/pages/coach/players/index.vue`
- Create: `packages/web/app/pages/player/week.vue`
- Create: `packages/web/app/pages/admin/index.vue`

- [ ] **Step 1: Sidebar**

`AppSidebar.vue` recibe el `user` de `useAuth`. Nav por rol:

```ts
const NAV = {
  COACH: [
    { to: '/coach/players', label: 'Plantel', icon: 'i-lucide-users' },
    { to: '/coach/groups', label: 'Grupos', icon: 'i-lucide-layout-grid' },
    { to: '/coach/programs', label: 'Programas', icon: 'i-lucide-clipboard-list' },
  ],
  PLAYER: [
    { to: '/player/week', label: 'Mi semana', icon: 'i-lucide-clipboard-list' },
    { to: '/player/profile', label: 'Mi perfil', icon: 'i-lucide-user' },
  ],
  // El panel de admin no entra en el MVP: una sola entrada a la landing.
  ADMIN: [{ to: '/admin', label: 'Administración', icon: 'i-lucide-shield' }],
}
```

Abajo, botón "Salir" que llama `logout`. En mobile (<768px) el sidebar colapsa a una barra inferior:
los jugadores entran desde el celular y un drawer lateral les cuesta más que tres iconos abajo.

- [ ] **Step 2: Layout `default`**

Sidebar + `<slot />` con padding. Es el layout de todo lo autenticado.

> **Ojo con el nombre del archivo:** va `players/index.vue`, no `players.vue`. Nuxt arma el router
> desde los directorios, y si existe `players.vue` **y** `players/[playerId].vue` (que llega en F2),
> el primero se convierte en el componente *padre* de la ruta y el detalle no se ve hasta que ese
> padre renderice `<NuxtPage />`. Con `index.vue` los dos quedan como hermanos, que es lo que
> queremos acá. Misma regla para cualquier listado que después gane una vista de detalle.

- [ ] **Step 3: `/coach/players`**

Lista el plantel (`GET /api/coach/players`, que devuelve `scopedPlayers`) y muestra el **código de
invitación en grande, monoespaciado**, con la explicación de para qué sirve. Es lo primero que un
coach recién registrado necesita.

- [ ] **Step 4: `/player/week` placeholder**

"Todavía no tenés un programa asignado. Cuando tu entrenador te asigne uno, lo vas a ver acá."

- [ ] **Step 5: `/admin` landing**

El seed crea un ADMIN desde F0 y el middleware lo manda a `/admin`; sin esta página, el único usuario
que existe entra a un 404. Muestra contadores simples (usuarios, coaches, jugadores, ejercicios) y
dice que el CRUD del catálogo queda fuera del MVP.

- [ ] **Step 6: Probar**

1. Entrar como coach. Expected: sidebar con Plantel/Grupos/Programas y el código visible.
2. Entrar como jugador. Expected: sidebar con Mi semana/Mi perfil.
3. Entrar con el admin del seed. Expected: cae en `/admin`.
4. "Salir" → vuelve a `/login` y `/coach/players` ya no es accesible.
5. Achicar a 380px. Expected: la navegación sigue siendo usable.

- [ ] **Step 7: Commit**

```bash
git add packages/web/app
git commit -m "feat(web): add authenticated shell with role-based sidebar"
```

---

### Task 11: Cierre de fase

- [ ] **Step 1: Auditoría**

Dispatch `rbac-auditor` sobre `packages/api/src/` y `packages/core/src/access/`. Foco: que los tres
grupos de ruta tengan su `requireRole`, que `register`/`login` sean las únicas públicas, y que el
`withActor` revalide el rol contra la tabla en vez de confiar en el token.

- [ ] **Step 2: Verificación**

Run: `pnpm typecheck && pnpm test`
Expected: verde.

- [ ] **Step 3: Marcar en CLAUDE.md**

```markdown
- [x] **F1 — Auth y shell**: registro/login con JWT en cookie, middleware de rol en Hono, guards de ruta en Nuxt, layout con sidebar, vínculo jugador↔coach por invite code.
```

- [ ] **Step 4: Commit y merge**

```bash
git add CLAUDE.md
git commit -m "docs: mark F1 complete"
git checkout main
git merge --no-ff feature/f1-auth-shell -m "feat: F1 auth and app shell"
```

---

## Definición de terminado

- Un coach se registra y ve su código de invitación de 6 caracteres.
- Un jugador se registra con ese código y aparece en el plantel del coach.
- Dos registros simultáneos con el mismo email: uno falla con 409.
- Login/logout funcionan; el rol equivocado redirige en vez de mostrar 403.
- Login con email inexistente y con contraseña mala son indistinguibles.
- `rbac-auditor` sin hallazgos abiertos.
- `pnpm typecheck && pnpm test` en verde.
