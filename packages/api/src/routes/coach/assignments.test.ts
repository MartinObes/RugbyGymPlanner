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

  /**
   * F4-B dejó tres destinos y sacó la prioridad. El contrato es lo único de eso
   * que se puede verificar sin sesión, y alcanza para que una regresión no pase
   * silenciosa: si alguien devuelve `priority` otra vez, el frontend generado lo
   * vuelve a mostrar.
   */
  it('el assignment ya no expone prioridades', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as {
      components: { schemas: { Assignment: { properties: Record<string, unknown> } } }
    }
    const props = spec.components.schemas.Assignment.properties

    expect(props).not.toHaveProperty('priority')
    expect(props).not.toHaveProperty('basePriority')
    expect(props).not.toHaveProperty('totalPriority')
  })

  it('el destino de un assignment es uno de tres, sin POSITION', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as {
      components: { schemas: { Assignment: { properties: { kind: { enum: string[] } } } } }
    }

    expect(spec.components.schemas.Assignment.properties.kind.enum).toEqual([
      'PLAYER',
      'POSITION_GROUP',
      'SYSTEM_GROUP',
    ])
  })

  /**
   * El coach tiene que poder ver cuándo un jugador está mirando otra rutina
   * (F4-B §2.4). Sin este campo la pantalla le mentiría.
   */
  it('el preview distingue lo asignado de lo que el jugador ve', async () => {
    const res = await app.request('/api/openapi.json')
    const spec = (await res.json()) as {
      components: { schemas: { AssignmentPreviewRow: { properties: Record<string, unknown> } } }
    }
    const props = spec.components.schemas.AssignmentPreviewRow.properties

    expect(props).toHaveProperty('programId')
    expect(props).toHaveProperty('assignedProgramId')
  })
})
