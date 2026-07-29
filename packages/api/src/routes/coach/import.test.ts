import { describe, expect, it } from 'vitest'
import { importRequestSchema } from '@coachlab/core/validators/parsedProgram'
import { app } from '../../app'

const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

describe('rutas de import y catálogo sin sesión', () => {
  const cases: [string, RequestInit | undefined][] = [
    [`/api/coach/programs/${ID}/import`, { method: 'POST', body: '{}' }],
    ['/api/catalog/exercises', undefined],
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

/**
 * Estos schemas son lo que impide que un payload malformado borre el árbol del
 * programa: la ruta hace el delete DESPUÉS de validar, así que si la validación
 * no espeja los CHECK de la base, el insert falla con el programa ya vacío.
 */
describe('importRequestSchema', () => {
  const exercise = {
    exerciseName: 'Press Banca',
    sets: 4,
    reps: '5',
    loadType: 'NONE' as const,
    weight: null,
    percentage: null,
    targetRpe: null,
  }
  const wrap = (blocks: unknown[]) => ({
    weeks: [{ name: 'Semana 1', days: [{ name: 'Día 1', blocks }] }],
    issues: [],
  })

  it('acepta un árbol válido', () => {
    expect(
      importRequestSchema.safeParse(wrap([{ type: 'SINGLE', rounds: null, exercises: [exercise] }]))
        .success,
    ).toBe(true)
  })

  it('rechaza un CIRCUIT sin vueltas — antes esto reventaba en el insert', () => {
    expect(
      importRequestSchema.safeParse(wrap([{ type: 'CIRCUIT', rounds: null, exercises: [] }])).success,
    ).toBe(false)
  })

  it('rechaza un SINGLE con vueltas', () => {
    expect(
      importRequestSchema.safeParse(wrap([{ type: 'SINGLE', rounds: 3, exercises: [] }])).success,
    ).toBe(false)
  })

  it('rechaza WEIGHT sin kg', () => {
    expect(
      importRequestSchema.safeParse(
        wrap([{ type: 'SINGLE', rounds: null, exercises: [{ ...exercise, loadType: 'WEIGHT' }] }]),
      ).success,
    ).toBe(false)
  })

  it('rechaza PERCENTAGE con kg fijos', () => {
    expect(
      importRequestSchema.safeParse(
        wrap([
          {
            type: 'SINGLE',
            rounds: null,
            exercises: [{ ...exercise, loadType: 'PERCENTAGE', percentage: 80, weight: 100 }],
          },
        ]),
      ).success,
    ).toBe(false)
  })

  it('rechaza weeks vacío: vaciaría el programa devolviendo ok', () => {
    expect(importRequestSchema.safeParse({ weeks: [], issues: [] }).success).toBe(false)
  })

  it('acota el tamaño del payload', () => {
    const day = { name: 'Día', blocks: [] }
    const week = { name: 'Semana', days: Array.from({ length: 15 }, () => day) }
    expect(importRequestSchema.safeParse({ weeks: [week], issues: [] }).success).toBe(false)
    expect(
      importRequestSchema.safeParse({
        weeks: Array.from({ length: 53 }, () => ({ name: 'S', days: [] })),
        issues: [],
      }).success,
    ).toBe(false)
  })
})
