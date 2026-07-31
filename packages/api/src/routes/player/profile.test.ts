import { describe, expect, it } from 'vitest'
import { playerProfileSchema } from '@coachlab/core/validators/player'
import { app } from '../../app'

const EXERCISE = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

describe('rutas del perfil del jugador sin sesión', () => {
  const cases: [string, RequestInit | undefined][] = [
    ['/api/player/profile', undefined],
    ['/api/player/profile', { method: 'PATCH', body: '{}' }],
    ['/api/player/one-rms', { method: 'PUT', body: '{}' }],
    [`/api/player/one-rms/${EXERCISE}`, { method: 'DELETE' }],
    ['/api/player/redeem-invite', { method: 'POST', body: '{}' }],
  ]

  for (const [path, init] of cases) {
    it(`${init?.method ?? 'GET'} ${path} → 401`, async () => {
      const res = await app.request(path, {
        ...init,
        headers: { 'content-type': 'application/json' },
      })
      expect(res.status).toBe(401)
    })
  }
})

describe('el PATCH del perfil no acepta escalada de privilegios', () => {
  it('el schema descarta role, coachId, email e inviteCode', () => {
    const result = playerProfileSchema.parse({
      name: 'Juan',
      role: 'ADMIN',
      coachId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      email: 'otro@example.com',
      inviteCode: 'ABCDEF',
    })
    expect(Object.keys(result)).toEqual(['name'])
  })
})

describe('spec del perfil del jugador', () => {
  it('incluye las rutas', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as { paths: Record<string, unknown> }
    expect(spec.paths).toHaveProperty('/api/player/profile')
    expect(spec.paths).toHaveProperty('/api/player/one-rms')
    expect(spec.paths).toHaveProperty('/api/player/one-rms/{exerciseId}')
    expect(spec.paths).toHaveProperty('/api/player/redeem-invite')
  })
})
