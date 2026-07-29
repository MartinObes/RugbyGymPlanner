import { describe, expect, it } from 'vitest'
import { positionGroupSchema } from './group'

describe('positionGroupSchema', () => {
  it('acepta nombre y puestos', () => {
    expect(
      positionGroupSchema.safeParse({
        name: 'Primeras y Segundas',
        positionIds: ['primera-linea', 'segunda-linea'],
      }).success,
    ).toBe(true)
  })

  it('exige al menos un puesto', () => {
    expect(positionGroupSchema.safeParse({ name: 'Vacío', positionIds: [] }).success).toBe(false)
  })

  it('rechaza puestos repetidos', () => {
    expect(positionGroupSchema.safeParse({ name: 'Repe', positionIds: ['wing', 'wing'] }).success).toBe(
      false,
    )
  })

  it('rechaza un puesto inventado', () => {
    expect(positionGroupSchema.safeParse({ name: 'X', positionIds: ['hooker'] }).success).toBe(false)
  })

  it('rechaza nombre de menos de 2 caracteres', () => {
    expect(positionGroupSchema.safeParse({ name: 'A', positionIds: ['wing'] }).success).toBe(false)
  })

  it('acepta las 8 posiciones pero no más entradas', () => {
    const all = [
      'primera-linea',
      'segunda-linea',
      'tercera-linea',
      'medio-scrum',
      'apertura',
      'centro',
      'wing',
      'fullback',
    ]
    expect(positionGroupSchema.safeParse({ name: 'Todos', positionIds: all }).success).toBe(true)
    expect(
      positionGroupSchema.safeParse({ name: 'Nueve', positionIds: [...all, 'wing'] }).success,
    ).toBe(false)
  })

  it('recorta el nombre', () => {
    expect(positionGroupSchema.parse({ name: '  Backs rápidos  ', positionIds: ['wing'] }).name).toBe(
      'Backs rápidos',
    )
  })
})
