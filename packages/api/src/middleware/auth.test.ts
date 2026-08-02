import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { Actor } from '@coachlab/core/access/rbac'
import type { Role } from '@coachlab/core/validators/auth'
import { requireRole, type AuthVariables } from './auth'
import { onError } from './error'

// requireRole se testea inyectando el actor con un middleware de fixture.
// withActor sin cookies se cubre vía app.request() en app.test.ts (sin cookie
// no hay red). NO se inventan cookies de sesión acá: eso pediría hablar con
// Supabase — la matriz por rol con sesiones reales vive en la verificación en
// vivo de la fase.
function fakeActor(role: Role): Actor {
  return {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    email: 'test@coachlab.local',
    name: 'Test',
    role,
    inviteCode: null,
    coachId: null,
    positionId: null,
    selectedProgramId: null,
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
