import { describe, expect, it } from 'vitest'
import { app } from '../../app'

const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

/**
 * Sin cookie no hay viaje a Supabase (getUser corta en memoria), así que estos
 * tests corren offline. Su valor es garantizar que ninguna ruta nueva nació sin
 * guard: /player/* lleva requireRole(['PLAYER']) montado en el prefijo, y si
 * alguien montara esto fuera del prefijo, acá se cae.
 *
 * El scoping real —que un jugador no pueda elegir una rutina ajena— lo verifica
 * verify:setup contra la base, que es el único lugar donde RLS existe de verdad.
 */
describe('rutas de rutinas del jugador sin sesión', () => {
  const cases: [string, RequestInit | undefined][] = [
    ['/api/player/programs', undefined],
    ['/api/player/programs/selected', { method: 'PUT', body: JSON.stringify({ programId: ID }) }],
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

describe('spec de rutinas del jugador', () => {
  it('incluye las rutas', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as { paths: Record<string, unknown> }

    expect(spec.paths).toHaveProperty('/api/player/programs')
    expect(spec.paths).toHaveProperty('/api/player/programs/selected')
  })

  /**
   * null es "la última asignada", NO "ninguna" (F4-B §3). Si el contrato dejara
   * de aceptar null, el jugador no tendría cómo volver al default.
   */
  it('la eleccion acepta null para volver al default', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as {
      paths: Record<
        string,
        {
          put: {
            requestBody: {
              content: {
                'application/json': {
                  schema: { properties: { programId: Record<string, unknown> } }
                }
              }
            }
          }
        }
      >
    }
    const schema =
      spec.paths['/api/player/programs/selected']!.put.requestBody.content['application/json'].schema

    expect(schema.properties.programId).toHaveProperty('nullable', true)
  })

  it('cada rutina dice si es la que el jugador esta viendo', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as {
      components: { schemas: { PlayerProgram: { properties: Record<string, unknown> } } }
    }

    expect(spec.components.schemas.PlayerProgram.properties).toHaveProperty('current')
  })
})
