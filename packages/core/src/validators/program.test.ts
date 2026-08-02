import { describe, expect, it } from 'vitest'
import {
  assignmentSchema,
  blockExerciseSchema,
  blockSchema,
  programSchema,
  weekSchema,
} from './program'

const base = { exerciseId: '7c9e6679-7425-40de-944b-e07fc1f90ae7', sets: 4, reps: '8' }

describe('blockExerciseSchema', () => {
  it('WEIGHT con weight es válido', () => {
    expect(blockExerciseSchema.safeParse({ ...base, loadType: 'WEIGHT', weight: 80 }).success).toBe(true)
  })

  it('WEIGHT sin weight falla en el campo weight', () => {
    const result = blockExerciseSchema.safeParse({ ...base, loadType: 'WEIGHT' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['weight'])
  })

  it('WEIGHT con percentage falla', () => {
    expect(
      blockExerciseSchema.safeParse({ ...base, loadType: 'WEIGHT', weight: 80, percentage: 70 }).success,
    ).toBe(false)
  })

  it('PERCENTAGE con percentage 1..100 es válido', () => {
    expect(blockExerciseSchema.safeParse({ ...base, loadType: 'PERCENTAGE', percentage: 80 }).success).toBe(
      true,
    )
  })

  it('PERCENTAGE con 0 o 101 falla', () => {
    expect(blockExerciseSchema.safeParse({ ...base, loadType: 'PERCENTAGE', percentage: 0 }).success).toBe(
      false,
    )
    expect(blockExerciseSchema.safeParse({ ...base, loadType: 'PERCENTAGE', percentage: 101 }).success).toBe(
      false,
    )
  })

  it('PERCENTAGE sin percentage falla en el campo percentage', () => {
    const result = blockExerciseSchema.safeParse({ ...base, loadType: 'PERCENTAGE' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['percentage'])
  })

  it('NONE sin carga es válido', () => {
    expect(blockExerciseSchema.safeParse({ ...base, loadType: 'NONE' }).success).toBe(true)
  })

  it('NONE con weight falla', () => {
    expect(blockExerciseSchema.safeParse({ ...base, loadType: 'NONE', weight: 50 }).success).toBe(false)
  })

  it('acepta null explícito en la carga que no corresponde', () => {
    expect(
      blockExerciseSchema.safeParse({ ...base, loadType: 'NONE', weight: null, percentage: null }).success,
    ).toBe(true)
  })

  it('targetRpe fuera de 1..10 falla', () => {
    expect(blockExerciseSchema.safeParse({ ...base, loadType: 'NONE', targetRpe: 11 }).success).toBe(false)
    expect(blockExerciseSchema.safeParse({ ...base, loadType: 'NONE', targetRpe: 0 }).success).toBe(false)
  })

  it('acepta RPE con medio punto', () => {
    expect(blockExerciseSchema.safeParse({ ...base, loadType: 'NONE', targetRpe: 7.5 }).success).toBe(true)
  })

  it('reps de solo espacios falla', () => {
    expect(blockExerciseSchema.safeParse({ ...base, reps: '   ', loadType: 'NONE' }).success).toBe(false)
  })

  it('reps acepta rangos y AMRAP', () => {
    expect(blockExerciseSchema.safeParse({ ...base, reps: '8-10', loadType: 'NONE' }).success).toBe(true)
    expect(blockExerciseSchema.safeParse({ ...base, reps: 'AMRAP', loadType: 'NONE' }).success).toBe(true)
  })

  it('exerciseId tiene que ser un uuid', () => {
    expect(blockExerciseSchema.safeParse({ ...base, exerciseId: 'no-uuid', loadType: 'NONE' }).success).toBe(
      false,
    )
  })
})

describe('blockSchema', () => {
  it('CIRCUIT con vueltas es válido', () => {
    expect(blockSchema.safeParse({ type: 'CIRCUIT', rounds: 3 }).success).toBe(true)
  })

  it('CIRCUIT sin vueltas falla', () => {
    const result = blockSchema.safeParse({ type: 'CIRCUIT' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['rounds'])
  })

  it('SINGLE sin vueltas es válido', () => {
    expect(blockSchema.safeParse({ type: 'SINGLE' }).success).toBe(true)
  })

  it('SINGLE con vueltas falla — lo mismo que el CHECK blocks_type_shape', () => {
    expect(blockSchema.safeParse({ type: 'SINGLE', rounds: 3 }).success).toBe(false)
  })
})

describe('programSchema y weekSchema', () => {
  it('aceptan un nombre válido', () => {
    expect(programSchema.safeParse({ name: 'Mesociclo 1' }).success).toBe(true)
    expect(weekSchema.safeParse({ name: 'Semana 1' }).success).toBe(true)
  })

  it('rechazan nombre vacío o de solo espacios', () => {
    expect(programSchema.safeParse({ name: '  ' }).success).toBe(false)
    expect(weekSchema.safeParse({ name: '' }).success).toBe(false)
  })

  it('recortan espacios', () => {
    expect(programSchema.parse({ name: '  Mesociclo 1  ' }).name).toBe('Mesociclo 1')
  })
})

describe('assignmentSchema', () => {
  const uuid = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

  it('acepta exactamente un destino, en sus tres formas', () => {
    expect(assignmentSchema.safeParse({ playerId: uuid }).success).toBe(true)
    expect(assignmentSchema.safeParse({ systemGroupId: 'forwards' }).success).toBe(true)
    expect(assignmentSchema.safeParse({ positionGroupId: uuid }).success).toBe(true)
  })

  it('rechaza dos destinos a la vez — lo mismo que el CHECK de la base', () => {
    expect(
      assignmentSchema.safeParse({ playerId: uuid, systemGroupId: 'forwards' }).success,
    ).toBe(false)
  })

  it('rechaza cero destinos', () => {
    expect(assignmentSchema.safeParse({}).success).toBe(false)
  })

  it('rechaza un systemGroupId inventado', () => {
    expect(assignmentSchema.safeParse({ systemGroupId: 'centros' }).success).toBe(false)
  })

  it('el puesto ya no es un destino: un positionId solo no alcanza', () => {
    // F4-B §2.2: un puesto suelto se modela como grupo custom de una posición.
    // Zod descarta la clave desconocida y el refine ve cero destinos.
    expect(assignmentSchema.safeParse({ positionId: 'wing' }).success).toBe(false)
  })

  it('un positionId de mas no ensucia un destino valido', () => {
    const result = assignmentSchema.safeParse({ playerId: uuid, positionId: 'wing' })
    expect(result.success).toBe(true)
    expect(result.success && result.data).not.toHaveProperty('positionId')
  })

  it('priority ya no existe: se descarta en vez de romper al cliente viejo', () => {
    const parsed = assignmentSchema.parse({ playerId: uuid, priority: 50 })
    expect(parsed).not.toHaveProperty('priority')
  })
})
