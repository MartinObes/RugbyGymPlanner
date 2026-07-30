import { describe, expect, it } from 'vitest'
import { app } from '../../app'

describe('el dashboard del jugador', () => {
  it('sin sesión → 401', async () => {
    const res = await app.request('/api/player/dashboard')
    expect(res.status).toBe(401)
  })

  it('el spec lo declara', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as { paths: Record<string, unknown> }
    expect(spec.paths).toHaveProperty('/api/player/dashboard')
  })

  it('el spec declara el progreso y las tendencias', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as {
      components: { schemas: Record<string, { properties?: Record<string, unknown> }> }
    }
    const schema = spec.components.schemas.PlayerDashboardResponse
    expect(schema?.properties).toHaveProperty('progress')
    expect(schema?.properties).toHaveProperty('trends')
  })
})
