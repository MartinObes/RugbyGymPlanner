import { describe, expect, it } from 'vitest'
import { evaluationSchema } from './evaluation'

const EXERCISE = '3fa85f64-5717-4562-b3fc-2c963f66afa6'
const today = () => new Date().toISOString().slice(0, 10)

describe('evaluationSchema', () => {
  it('acepta lo mínimo: ejercicio y kg', () => {
    expect(evaluationSchema.safeParse({ exerciseId: EXERCISE, kg: 140 }).success).toBe(true)
  })

  it('acepta medio kilo, como la columna numeric(5,1)', () => {
    expect(evaluationSchema.safeParse({ exerciseId: EXERCISE, kg: 142.5 }).success).toBe(true)
  })

  it('exige un ejercicio del catálogo, no un nombre libre', () => {
    // ensure_exercise rechaza a PLAYER a propósito (migraciones 0012/0014): el
    // jugador ELIGE del catálogo, no lo escribe.
    expect(evaluationSchema.safeParse({ exerciseId: 'Sentadilla', kg: 140 }).success).toBe(false)
  })

  it('rechaza 0 y negativos: espeja el check (kg > 0)', () => {
    expect(evaluationSchema.safeParse({ exerciseId: EXERCISE, kg: 0 }).success).toBe(false)
    expect(evaluationSchema.safeParse({ exerciseId: EXERCISE, kg: -5 }).success).toBe(false)
  })

  it('rechaza un peso que es un error de tipeo', () => {
    expect(evaluationSchema.safeParse({ exerciseId: EXERCISE, kg: 5000 }).success).toBe(false)
  })

  it('acepta la fecha de hoy', () => {
    expect(evaluationSchema.safeParse({ exerciseId: EXERCISE, kg: 140, testedOn: today() }).success).toBe(true)
  })

  it('acepta una fecha pasada: se cargan tests de una instancia anterior', () => {
    expect(
      evaluationSchema.safeParse({ exerciseId: EXERCISE, kg: 140, testedOn: '2026-01-15' }).success,
    ).toBe(true)
  })

  it('rechaza una fecha futura', () => {
    expect(
      evaluationSchema.safeParse({ exerciseId: EXERCISE, kg: 140, testedOn: '2099-01-01' }).success,
    ).toBe(false)
  })

  it('rechaza una fecha que no tiene forma de fecha', () => {
    expect(
      evaluationSchema.safeParse({ exerciseId: EXERCISE, kg: 140, testedOn: '15/01/2026' }).success,
    ).toBe(false)
  })
})
