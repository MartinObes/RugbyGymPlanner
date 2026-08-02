import { describe, expect, it } from 'vitest'
import { app } from '../../app'

const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

/**
 * Sin cookie no hay viaje a Supabase (getUser corta en memoria), así que estos
 * tests corren offline. Su valor es garantizar que la ruta nueva no nació sin
 * guard: /coach/* lleva requireRole(['COACH','ADMIN']) montado en el prefijo.
 *
 * El scoping real —que un coach no vea el feedback de un plantel ajeno, y que
 * eso dé 404 y no 403— lo verifica verify:setup contra la base, que es el único
 * lugar donde RLS existe de verdad. Acá se fija el contrato.
 */
describe('rutas de feedback sin sesión', () => {
  const cases = ['/api/coach/feedback', `/api/coach/feedback/${ID}`]

  for (const path of cases) {
    it(`GET ${path} → 401`, async () => {
      const res = await app.request(path, { headers: { 'content-type': 'application/json' } })
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ ok: false, error: 'No autorizado' })
    })
  }
})

describe('spec de feedback', () => {
  it('incluye las dos rutas', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as { paths: Record<string, unknown> }

    expect(spec.paths).toHaveProperty('/api/coach/feedback')
    expect(spec.paths).toHaveProperty('/api/coach/feedback/{playerId}')
  })

  /**
   * El 404 del detalle es la capa 4 de CLAUDE.md §4. Que esté DECLARADO importa
   * tanto como que funcione: si alguien lo cambiara por un 403, el cliente
   * generado dejaría de tratar "no es tuyo" como "no existe".
   */
  it('el detalle declara 404 y no 403', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as {
      paths: Record<string, { get: { responses: Record<string, unknown> } }>
    }
    const responses = spec.paths['/api/coach/feedback/{playerId}']!.get.responses

    expect(responses).toHaveProperty('404')
    expect(responses).not.toHaveProperty('403')
  })

  it('el progreso del dia viene como hechos sobre total', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as {
      components: { schemas: { PlayerFeedback: { properties: Record<string, unknown> } } }
    }
    const props = spec.components.schemas.PlayerFeedback.properties

    expect(props).toHaveProperty('daysDone')
    expect(props).toHaveProperty('daysTotal')
    expect(props).toHaveProperty('lastNote')
  })

  /**
   * Desde F3.5 el RPE percibido es del DÍA, no del ejercicio. El día lleva la
   * comparación; el ejercicio sólo su target. Si alguien volviera a poner un
   * `rpe` percibido por ejercicio, estaría modelando algo que la app no captura.
   */
  it('la comparacion de RPE vive en el dia, no en el ejercicio', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as {
      components: { schemas: Record<string, { properties: Record<string, unknown> }> }
    }

    const day = spec.components.schemas.FeedbackDay!.properties
    expect(day).toHaveProperty('comparison')
    expect(day).toHaveProperty('perceivedRpe')
    expect(day).toHaveProperty('targetRpe')

    const exercise = spec.components.schemas.FeedbackExercise!.properties
    expect(exercise).toHaveProperty('targetRpe')
    expect(exercise).not.toHaveProperty('perceivedRpe')
    expect(exercise).not.toHaveProperty('comparison')
  })
})
