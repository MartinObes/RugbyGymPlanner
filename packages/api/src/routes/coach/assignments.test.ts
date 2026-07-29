import { describe, expect, it } from 'vitest'
import { app } from '../../app'

const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

describe('rutas de assignments sin sesión', () => {
  const cases: [string, RequestInit | undefined][] = [
    [`/api/coach/programs/${ID}/assignments`, undefined],
    [`/api/coach/programs/${ID}/assignments`, { method: 'POST', body: '{}' }],
    [`/api/coach/assignments/${ID}`, { method: 'DELETE' }],
    ['/api/coach/assignments/preview', undefined],
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

describe('spec de assignments', () => {
  it('incluye las rutas', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as { paths: Record<string, unknown> }
    expect(spec.paths).toHaveProperty('/api/coach/programs/{programId}/assignments')
    expect(spec.paths).toHaveProperty('/api/coach/assignments/{assignmentId}')
    expect(spec.paths).toHaveProperty('/api/coach/assignments/preview')
  })
})
