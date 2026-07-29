import { describe, expect, it } from 'vitest'
import { app } from '../../app'

const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

describe('rutas de programas y árbol sin sesión', () => {
  const cases: [string, RequestInit | undefined][] = [
    ['/api/coach/programs', undefined],
    ['/api/coach/programs', { method: 'POST', body: '{}' }],
    [`/api/coach/programs/${ID}`, undefined],
    [`/api/coach/programs/${ID}`, { method: 'PATCH', body: '{}' }],
    [`/api/coach/programs/${ID}`, { method: 'DELETE' }],
    [`/api/coach/programs/${ID}/weeks`, { method: 'POST', body: '{}' }],
    [`/api/coach/weeks/${ID}`, { method: 'PATCH', body: '{}' }],
    [`/api/coach/weeks/${ID}`, { method: 'DELETE' }],
    [`/api/coach/weeks/${ID}/days`, { method: 'POST', body: '{}' }],
    [`/api/coach/days/${ID}`, { method: 'PATCH', body: '{}' }],
    [`/api/coach/days/${ID}`, { method: 'DELETE' }],
    [`/api/coach/days/${ID}/blocks`, { method: 'POST', body: '{}' }],
    [`/api/coach/blocks/${ID}`, { method: 'PATCH', body: '{}' }],
    [`/api/coach/blocks/${ID}`, { method: 'DELETE' }],
    [`/api/coach/blocks/${ID}/exercises`, { method: 'POST', body: '{}' }],
    [`/api/coach/blocks/${ID}/exercises/reorder`, { method: 'PATCH', body: '{}' }],
    [`/api/coach/block-exercises/${ID}`, { method: 'PATCH', body: '{}' }],
    [`/api/coach/block-exercises/${ID}`, { method: 'DELETE' }],
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

describe('spec del árbol', () => {
  it('incluye todas las rutas del programa y del árbol', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as { paths: Record<string, unknown> }

    for (const path of [
      '/api/coach/programs',
      '/api/coach/programs/{programId}',
      '/api/coach/programs/{programId}/weeks',
      '/api/coach/weeks/{weekId}',
      '/api/coach/weeks/{weekId}/days',
      '/api/coach/days/{dayId}',
      '/api/coach/days/{dayId}/blocks',
      '/api/coach/blocks/{blockId}',
      '/api/coach/blocks/{blockId}/exercises',
      '/api/coach/blocks/{blockId}/exercises/reorder',
      '/api/coach/block-exercises/{blockExerciseId}',
    ]) {
      expect(spec.paths, path).toHaveProperty(path)
    }
  })
})
