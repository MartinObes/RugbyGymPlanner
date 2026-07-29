import { describe, expect, it } from 'vitest'
import { kindOf, toCandidate, type AssignmentRow } from './assignments'

const base: AssignmentRow = {
  id: 'a1',
  program_id: 'p1',
  player_id: null,
  position_group_id: null,
  system_group_id: null,
  position_id: null,
  priority: 0,
  created_at: '2026-01-01T00:00:00Z',
}

describe('kindOf', () => {
  it('deriva PLAYER de player_id', () => {
    expect(kindOf({ ...base, player_id: 'pl1' })).toBe('PLAYER')
  })

  it('deriva POSITION_GROUP de position_group_id', () => {
    expect(kindOf({ ...base, position_group_id: 'g1' })).toBe('POSITION_GROUP')
  })

  it('deriva SYSTEM_GROUP de system_group_id', () => {
    expect(kindOf({ ...base, system_group_id: 'forwards' })).toBe('SYSTEM_GROUP')
  })

  it('deriva POSITION de position_id', () => {
    expect(kindOf({ ...base, position_id: 'wing' })).toBe('POSITION')
  })

  it('respeta la precedencia del CHECK: si viniera más de uno, gana el más específico', () => {
    // El CHECK program_assignments_one_target lo hace imposible en la base; el
    // orden acá es para que la derivación sea determinística de todos modos.
    expect(kindOf({ ...base, player_id: 'pl1', position_id: 'wing' })).toBe('PLAYER')
  })
})

describe('toCandidate', () => {
  it('mapea las columnas al contrato de resolveProgram', () => {
    const candidate = toCandidate({ ...base, position_id: 'wing', priority: 7 })
    expect(candidate).toEqual({
      assignmentId: 'a1',
      programId: 'p1',
      kind: 'POSITION',
      priority: 7,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })
  })

  it('convierte created_at a Date para que el desempate funcione', () => {
    expect(toCandidate({ ...base, position_id: 'wing' }).createdAt).toBeInstanceOf(Date)
  })
})
