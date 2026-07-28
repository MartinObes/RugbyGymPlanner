import { describe, expect, it } from 'vitest'
import {
  POSITIONS,
  SYSTEM_GROUPS,
  isPositionId,
  positionById,
  systemGroupForPosition,
} from './positions'

describe('POSITIONS', () => {
  it('tiene las 8 posiciones de rugby', () => {
    expect(POSITIONS).toHaveLength(8)
  })

  it('se reparte 4 forwards y 4 backs', () => {
    expect(POSITIONS.filter((p) => p.type === 'FORWARD')).toHaveLength(4)
    expect(POSITIONS.filter((p) => p.type === 'BACK')).toHaveLength(4)
  })

  it('usa ids slug estables', () => {
    expect(POSITIONS.map((p) => p.id)).toEqual([
      'primera-linea',
      'segunda-linea',
      'tercera-linea',
      'medio-scrum',
      'apertura',
      'centro',
      'wing',
      'fullback',
    ])
  })

  it('no repite ids', () => {
    expect(new Set(POSITIONS.map((p) => p.id)).size).toBe(8)
  })
})

describe('positionById', () => {
  it('devuelve la posición', () => {
    expect(positionById('wing')?.name).toBe('Wing')
  })

  it('devuelve undefined con un id inventado', () => {
    expect(positionById('hooker')).toBeUndefined()
  })
})

describe('isPositionId', () => {
  it('acepta un id válido', () => {
    expect(isPositionId('apertura')).toBe(true)
  })

  it('rechaza cualquier otra cosa', () => {
    expect(isPositionId('')).toBe(false)
    expect(isPositionId('APERTURA')).toBe(false)
  })
})

describe('SYSTEM_GROUPS', () => {
  it('son forwards y backs', () => {
    expect(SYSTEM_GROUPS.map((g) => g.id)).toEqual(['forwards', 'backs'])
  })

  it('cada uno contiene sus 4 posiciones', () => {
    expect(SYSTEM_GROUPS[0]!.positionIds).toHaveLength(4)
    expect(SYSTEM_GROUPS[1]!.positionIds).toHaveLength(4)
  })

  it('entre los dos cubren las 8 sin solaparse', () => {
    const all = SYSTEM_GROUPS.flatMap((g) => g.positionIds)
    expect(new Set(all).size).toBe(8)
  })
})

describe('systemGroupForPosition', () => {
  it('manda una primera línea a forwards', () => {
    expect(systemGroupForPosition('primera-linea')?.id).toBe('forwards')
  })

  it('manda un wing a backs', () => {
    expect(systemGroupForPosition('wing')?.id).toBe('backs')
  })

  it('devuelve null sin posición', () => {
    expect(systemGroupForPosition(null)).toBeNull()
  })
})
