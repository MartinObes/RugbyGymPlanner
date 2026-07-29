import { describe, expect, it } from 'vitest'
import { app } from '../../app'

const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

describe('rutas de grupos sin sesión', () => {
  const cases: [string, RequestInit | undefined][] = [
    ['/api/coach/groups', undefined],
    ['/api/coach/groups', { method: 'POST', body: '{}' }],
    [`/api/coach/groups/${ID}`, { method: 'PATCH', body: '{}' }],
    [`/api/coach/groups/${ID}`, { method: 'DELETE' }],
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

describe('spec de grupos', () => {
  it('incluye las rutas', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as { paths: Record<string, unknown> }
    expect(spec.paths).toHaveProperty('/api/coach/groups')
    expect(spec.paths).toHaveProperty('/api/coach/groups/{groupId}')
  })
})
