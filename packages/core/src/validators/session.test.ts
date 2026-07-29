import { describe, expect, it } from 'vitest'
import { dayNoteSchema, exerciseEntrySchema } from './session'

describe('exerciseEntrySchema', () => {
  it('acepta una entry completa', () => {
    const result = exerciseEntrySchema.safeParse({ weight: 112.5, reps: 5, rpe: 9 })
    expect(result.success).toBe(true)
  })

  // Los tres en null es válido: significa "borrá la fila".
  it('acepta los tres campos en null', () => {
    expect(exerciseEntrySchema.safeParse({ weight: null, reps: null, rpe: null }).success).toBe(true)
  })

  it('acepta un objeto vacío', () => {
    expect(exerciseEntrySchema.safeParse({}).success).toBe(true)
  })

  it('acepta peso 0 (la columna permite >= 0)', () => {
    expect(exerciseEntrySchema.safeParse({ weight: 0 }).success).toBe(true)
  })

  it('rechaza peso negativo', () => {
    expect(exerciseEntrySchema.safeParse({ weight: -1 }).success).toBe(false)
  })

  it('rechaza un peso absurdo', () => {
    expect(exerciseEntrySchema.safeParse({ weight: 501 }).success).toBe(false)
  })

  it('rechaza reps con decimales', () => {
    expect(exerciseEntrySchema.safeParse({ reps: 5.5 }).success).toBe(false)
  })

  it('rechaza reps negativas', () => {
    expect(exerciseEntrySchema.safeParse({ reps: -1 }).success).toBe(false)
  })

  // Espeja el CHECK rpe between 1 and 10.
  it('rechaza RPE 0 y RPE 11', () => {
    expect(exerciseEntrySchema.safeParse({ rpe: 0 }).success).toBe(false)
    expect(exerciseEntrySchema.safeParse({ rpe: 11 }).success).toBe(false)
  })

  // La columna es numeric(3,1): medio punto es válido.
  it('acepta RPE con un decimal', () => {
    expect(exerciseEntrySchema.safeParse({ rpe: 7.5 }).success).toBe(true)
  })

  it('descarta campos que no son del schema', () => {
    const result = exerciseEntrySchema.parse({ weight: 100, sessionLogId: 'ajeno' })
    expect(result).not.toHaveProperty('sessionLogId')
  })
})

describe('dayNoteSchema', () => {
  it('acepta una nota', () => {
    expect(dayNoteSchema.parse({ note: '  Me sentí bien  ' }).note).toBe('Me sentí bien')
  })

  it('acepta null', () => {
    expect(dayNoteSchema.safeParse({ note: null }).success).toBe(true)
  })

  it('acepta la ausencia de nota', () => {
    expect(dayNoteSchema.safeParse({}).success).toBe(true)
  })

  it('rechaza una nota kilométrica', () => {
    expect(dayNoteSchema.safeParse({ note: 'a'.repeat(1001) }).success).toBe(false)
  })
})
