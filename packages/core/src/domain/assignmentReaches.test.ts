import { describe, expect, it } from 'vitest'
import { assignmentReaches } from './assignmentReaches'

const player = {
  id: 'jugador-1',
  positionId: 'wing',
  customGroupIds: ['g-lesionados'],
}

describe('assignmentReaches', () => {
  it('un assignment al propio jugador lo alcanza', () => {
    expect(assignmentReaches({ playerId: 'jugador-1' }, player)).toBe(true)
  })

  it('un assignment a otro jugador no lo alcanza', () => {
    expect(assignmentReaches({ playerId: 'jugador-2' }, player)).toBe(false)
  })

  it('un assignment al grupo system de su puesto lo alcanza', () => {
    // wing es BACK.
    expect(assignmentReaches({ systemGroupId: 'backs' }, player)).toBe(true)
  })

  it('un assignment al otro grupo system no lo alcanza', () => {
    expect(assignmentReaches({ systemGroupId: 'forwards' }, player)).toBe(false)
  })

  it('un assignment a un grupo custom que lo contiene lo alcanza', () => {
    expect(assignmentReaches({ positionGroupId: 'g-lesionados' }, player)).toBe(true)
  })

  it('un assignment a un grupo custom que no lo contiene no lo alcanza', () => {
    expect(assignmentReaches({ positionGroupId: 'g-primera' }, player)).toBe(false)
  })

  it('un jugador sin puesto no lo alcanza ningun grupo system', () => {
    const sinPuesto = { id: 'jugador-1', positionId: null, customGroupIds: [] }
    expect(assignmentReaches({ systemGroupId: 'backs' }, sinPuesto)).toBe(false)
    expect(assignmentReaches({ systemGroupId: 'forwards' }, sinPuesto)).toBe(false)
  })

  it('un jugador sin puesto igual lo alcanza un assignment directo', () => {
    const sinPuesto = { id: 'jugador-1', positionId: null, customGroupIds: [] }
    expect(assignmentReaches({ playerId: 'jugador-1' }, sinPuesto)).toBe(true)
  })

  it('un destino vacio no alcanza a nadie', () => {
    // El CHECK de la base garantiza que esto no pasa, pero la funcion no puede
    // devolver true por descarte: seria un reset de la eleccion de todo el plantel.
    expect(assignmentReaches({}, player)).toBe(false)
  })
})
