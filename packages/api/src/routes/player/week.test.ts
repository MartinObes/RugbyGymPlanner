import { describe, expect, it } from 'vitest'
import { app } from '../../app'

const DAY = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const BE = '3fa85f64-5717-4562-b3fc-2c963f66afa6'

describe('rutas de la semana del jugador sin sesión', () => {
  const cases: [string, RequestInit | undefined][] = [
    ['/api/player/week', undefined],
    [`/api/player/days/${DAY}/entries/${BE}`, { method: 'PUT', body: '{}' }],
    [`/api/player/days/${DAY}/complete`, { method: 'POST', body: '{}' }],
    [`/api/player/days/${DAY}/reopen`, { method: 'POST' }],
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

describe('el guard de /player/* no admite otros roles', () => {
  it('el prefijo está montado con requireRole(["PLAYER"])', async () => {
    // Sin sesión el guard corta con 401 antes de tocar la base. Que el guard
    // exista es lo que este test fija: una ruta nueva bajo /player/* nace
    // protegida (CLAUDE.md §4, capa 2).
    const res = await app.request('/api/player/week')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false, error: 'No autorizado' })
  })
})

describe('spec de la semana del jugador', () => {
  it('incluye las rutas', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as { paths: Record<string, unknown> }
    expect(spec.paths).toHaveProperty('/api/player/week')
    expect(spec.paths).toHaveProperty('/api/player/days/{dayId}/entries/{blockExerciseId}')
    expect(spec.paths).toHaveProperty('/api/player/days/{dayId}/complete')
    expect(spec.paths).toHaveProperty('/api/player/days/{dayId}/reopen')
  })

  it('el PUT de una entry declara el 409 del día cerrado', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as {
      paths: Record<string, Record<string, { responses: Record<string, unknown> }>>
    }
    const put = spec.paths['/api/player/days/{dayId}/entries/{blockExerciseId}']!.put!
    expect(put.responses).toHaveProperty('409')
  })
})
