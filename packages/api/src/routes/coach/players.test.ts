import { describe, expect, it } from 'vitest'
import { app } from '../../app'

const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

/**
 * Sin cookie no hay ningún viaje a Supabase (getUser corta en memoria), así que
 * estos tests corren offline. Su valor es garantizar que ninguna ruta nueva nació
 * sin guard: si alguien monta una fuera del prefijo /coach/*, este test la caza.
 */
describe('rutas del plantel sin sesión', () => {
  const cases: [string, RequestInit | undefined][] = [
    ['/api/coach/players', undefined],
    [`/api/coach/players/${ID}`, undefined],
    [`/api/coach/players/${ID}`, { method: 'PATCH', body: '{}' }],
    [`/api/coach/players/${ID}/one-rm`, { method: 'PUT', body: '{}' }],
    [`/api/coach/players/${ID}/one-rm/${ID}`, { method: 'DELETE' }],
    [`/api/coach/players/${ID}/release`, { method: 'POST' }],
  ]

  for (const [path, init] of cases) {
    it(`${init?.method ?? 'GET'} ${path} → 401`, async () => {
      const res = await app.request(path, {
        ...init,
        headers: { 'content-type': 'application/json' },
      })
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ ok: false, error: 'No autorizado' })
    })
  }
})

describe('spec de OpenAPI', () => {
  it('incluye las rutas del plantel', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as { paths: Record<string, unknown> }

    expect(spec.paths).toHaveProperty('/api/coach/players')
    expect(spec.paths).toHaveProperty('/api/coach/players/{playerId}')
    expect(spec.paths).toHaveProperty('/api/coach/players/{playerId}/one-rm')
    expect(spec.paths).toHaveProperty('/api/coach/players/{playerId}/one-rm/{exerciseId}')
    expect(spec.paths).toHaveProperty('/api/coach/players/{playerId}/release')
  })
})

describe('evaluaciones del plantel', () => {
  const PLAYER = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

  it('sin sesión no se listan', async () => {
    const res = await app.request(`/api/coach/players/${PLAYER}/evaluations`)
    expect(res.status).toBe(401)
  })

  it('sin sesión no se cargan', async () => {
    const res = await app.request(`/api/coach/players/${PLAYER}/evaluations`, {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    })
    expect(res.status).toBe(401)
  })

  it('el spec declara las dos rutas y el 404 de plantel ajeno', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as {
      paths: Record<string, Record<string, { responses: Record<string, unknown> }>>
    }
    const path = spec.paths['/api/coach/players/{playerId}/evaluations']
    expect(path).toBeDefined()
    expect(path!.get).toBeDefined()
    expect(path!.post!.responses).toHaveProperty('404')
  })
})
