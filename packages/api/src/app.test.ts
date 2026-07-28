import { describe, expect, it } from 'vitest'
import { app } from './app'

type HealthBody = { ok: boolean; service: string; db: string }
type ErrorBody = { ok: false; error: string }
type OpenApiSpec = { info: { title: string }; paths: Record<string, unknown> }

// Hono se testea con app.request(), sin levantar servidor (CLAUDE.md §5).
describe('app', () => {
  it('responde el health check', async () => {
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)

    const body = (await res.json()) as HealthBody
    expect(body.ok).toBe(true)
    expect(body.service).toBe('coachlab-api')
  })

  it('reporta el estado de la base sin reventar cuando falta el entorno', async () => {
    // Sin SUPABASE_URL el health no explota: informa y sigue vivo.
    const res = await app.request('/api/health')
    const body = (await res.json()) as HealthBody
    expect(['ok', 'error', 'unconfigured']).toContain(body.db)
  })

  it('expone el spec de OpenAPI con el path de health', async () => {
    const res = await app.request('/api/openapi.json')
    expect(res.status).toBe(200)

    const spec = (await res.json()) as OpenApiSpec
    expect(spec.info.title).toBe('CoachLab API')
    expect(spec.paths).toHaveProperty('/api/health')
  })

  it('devuelve un error tipado en una ruta inexistente', async () => {
    const res = await app.request('/api/no-existe')
    expect(res.status).toBe(404)
    expect((await res.json()) as ErrorBody).toEqual({ ok: false, error: 'No encontrado' })
  })
})

// Sin cookie no hay ningún viaje a Supabase (getUser corta en memoria), así
// que estos tests corren offline.
describe('guards de F1', () => {
  it('GET /api/auth/me sin sesión → 401 tipado', async () => {
    const res = await app.request('/api/auth/me')
    expect(res.status).toBe(401)
    expect((await res.json()) as ErrorBody).toEqual({ ok: false, error: 'No autorizado' })
  })

  it('GET /api/coach/players sin sesión → 401', async () => {
    const res = await app.request('/api/coach/players')
    expect(res.status).toBe(401)
  })

  it('GET /api/admin/stats sin sesión → 401', async () => {
    const res = await app.request('/api/admin/stats')
    expect(res.status).toBe(401)
  })

  it('el prefijo /player/* ya nace guardado aunque no tenga rutas', async () => {
    const res = await app.request('/api/player/anything')
    expect(res.status).toBe(401)
  })

  it('el spec incluye las rutas nuevas', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as OpenApiSpec
    expect(spec.paths).toHaveProperty('/api/auth/me')
    expect(spec.paths).toHaveProperty('/api/coach/players')
    expect(spec.paths).toHaveProperty('/api/admin/stats')
  })

  it('el health sigue público y vivo (UptimeRobot depende de él)', async () => {
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)
  })
})
