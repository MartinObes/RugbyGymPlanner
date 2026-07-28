import { describe, expect, it } from 'vitest'
import { rmFor } from './rmFor'

const oneRms = [
  { normalizedName: 'press banca', kg: 140 },
  { normalizedName: 'sentadilla', kg: 180 },
  { normalizedName: 'sentadilla frontal', kg: 120 },
]

describe('rmFor', () => {
  it('matchea exacto', () => {
    expect(rmFor(oneRms, 'Press Banca')).toBe(140)
  })

  it('matchea ignorando acentos y mayúsculas', () => {
    expect(rmFor([{ normalizedName: 'sentadilla bulgara', kg: 90 }], 'Sentadilla Búlgara')).toBe(90)
  })

  it('matchea por inclusión cuando el programa es más específico', () => {
    expect(rmFor(oneRms, 'Press Banca con Mancuernas')).toBe(140)
  })

  it('matchea por inclusión cuando el 1RM es más específico', () => {
    expect(rmFor([{ normalizedName: 'press banca plano', kg: 130 }], 'Press Banca')).toBe(130)
  })

  it('ante varias inclusiones gana la coincidencia más larga', () => {
    expect(rmFor(oneRms, 'Sentadilla Frontal')).toBe(120)
  })

  it('devuelve null si no hay ninguna coincidencia', () => {
    expect(rmFor(oneRms, 'Remo con Barra')).toBeNull()
  })

  it('devuelve null con lista vacía', () => {
    expect(rmFor([], 'Press Banca')).toBeNull()
  })
})
