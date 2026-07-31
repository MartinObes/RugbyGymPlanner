import { describe, expect, it } from 'vitest'
import { app } from '../../app'

const EVALUATION = '9c858901-8a57-4791-81fe-4c455b099bc9'

describe('rutas de evaluaciones del jugador sin sesión', () => {
  const cases: [string, RequestInit | undefined][] = [
    ['/api/player/evaluations', undefined],
    ['/api/player/evaluations', { method: 'POST', body: '{}' }],
    [`/api/player/evaluations/${EVALUATION}`, { method: 'DELETE' }],
  ]

  for (const [path, init] of cases) {
    it(`${init?.method ?? 'GET'} ${path} → 401`, async () => {
      const res = await app.request(path, { ...init, headers: { 'content-type': 'application/json' } })
      expect(res.status).toBe(401)
    })
  }
})

describe('spec de las evaluaciones del jugador', () => {
  it('declara las rutas', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as { paths: Record<string, unknown> }
    expect(spec.paths).toHaveProperty('/api/player/evaluations')
    expect(spec.paths).toHaveProperty('/api/player/evaluations/{evaluationId}')
  })

  it('el POST declara el 404 de recurso ajeno o inexistente', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as {
      paths: Record<string, Record<string, { responses: Record<string, unknown> }>>
    }
    expect(spec.paths['/api/player/evaluations']!.post!.responses).toHaveProperty('404')
  })
})
