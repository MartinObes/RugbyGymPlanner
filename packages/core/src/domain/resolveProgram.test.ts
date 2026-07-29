import { describe, expect, it } from 'vitest'
import { BASE_PRIORITY, type CandidateAssignment, resolveProgram, scoreOf } from './resolveProgram'

const at = (iso: string) => new Date(iso)

function candidate(over: Partial<CandidateAssignment> = {}): CandidateAssignment {
  return {
    assignmentId: 'a1',
    programId: 'p1',
    kind: 'POSITION',
    priority: 0,
    createdAt: at('2026-01-01T00:00:00Z'),
    ...over,
  }
}

describe('BASE_PRIORITY', () => {
  it('respeta el orden individual > grupo custom > grupo system > puesto', () => {
    expect(BASE_PRIORITY.PLAYER).toBe(100)
    expect(BASE_PRIORITY.POSITION_GROUP).toBe(50)
    expect(BASE_PRIORITY.SYSTEM_GROUP).toBe(30)
    expect(BASE_PRIORITY.POSITION).toBe(10)
  })
})

describe('scoreOf', () => {
  it('suma el override de prioridad a la base', () => {
    expect(scoreOf(candidate({ kind: 'POSITION', priority: 5 }))).toBe(15)
  })

  it('acepta override negativo', () => {
    expect(scoreOf(candidate({ kind: 'PLAYER', priority: -80 }))).toBe(20)
  })
})

describe('resolveProgram', () => {
  it('sin candidatos devuelve null', () => {
    expect(resolveProgram([])).toBeNull()
  })

  it('con un solo candidato lo devuelve', () => {
    expect(resolveProgram([candidate({ programId: 'solo' })])?.programId).toBe('solo')
  })

  it('individual le gana a grupo custom', () => {
    expect(
      resolveProgram([
        candidate({ assignmentId: 'g', kind: 'POSITION_GROUP', programId: 'grupo' }),
        candidate({ assignmentId: 'i', kind: 'PLAYER', programId: 'individual' }),
      ])?.programId,
    ).toBe('individual')
  })

  it('grupo custom le gana a grupo system', () => {
    expect(
      resolveProgram([
        candidate({ assignmentId: 's', kind: 'SYSTEM_GROUP', programId: 'forwards' }),
        candidate({ assignmentId: 'c', kind: 'POSITION_GROUP', programId: 'primeras' }),
      ])?.programId,
    ).toBe('primeras')
  })

  it('grupo system le gana a puesto', () => {
    expect(
      resolveProgram([
        candidate({ assignmentId: 'p', kind: 'POSITION', programId: 'puesto' }),
        candidate({ assignmentId: 's', kind: 'SYSTEM_GROUP', programId: 'system' }),
      ])?.programId,
    ).toBe('system')
  })

  it('respeta los 4 niveles a la vez', () => {
    expect(
      resolveProgram([
        candidate({ assignmentId: '1', kind: 'POSITION', programId: 'puesto' }),
        candidate({ assignmentId: '2', kind: 'SYSTEM_GROUP', programId: 'system' }),
        candidate({ assignmentId: '3', kind: 'POSITION_GROUP', programId: 'custom' }),
        candidate({ assignmentId: '4', kind: 'PLAYER', programId: 'individual' }),
      ])?.programId,
    ).toBe('individual')
  })

  it('el override de prioridad puede dar vuelta el orden natural', () => {
    expect(
      resolveProgram([
        candidate({ assignmentId: 'i', kind: 'PLAYER', programId: 'individual', priority: 0 }),
        candidate({ assignmentId: 'p', kind: 'POSITION', programId: 'puesto', priority: 200 }),
      ])?.programId,
    ).toBe('puesto')
  })

  it('ante empate gana el createdAt más reciente', () => {
    expect(
      resolveProgram([
        candidate({ assignmentId: 'v', programId: 'viejo', createdAt: at('2026-01-01T00:00:00Z') }),
        candidate({ assignmentId: 'n', programId: 'nuevo', createdAt: at('2026-06-01T00:00:00Z') }),
      ])?.programId,
    ).toBe('nuevo')
  })

  it('el empate desempata por fecha aun entre kinds distintos con el mismo score', () => {
    expect(
      resolveProgram([
        candidate({
          assignmentId: 'a',
          kind: 'SYSTEM_GROUP', // 30 + 20 = 50
          priority: 20,
          programId: 'system-boosteado',
          createdAt: at('2026-03-01T00:00:00Z'),
        }),
        candidate({
          assignmentId: 'b',
          kind: 'POSITION_GROUP', // 50 + 0 = 50
          priority: 0,
          programId: 'custom',
          createdAt: at('2026-01-01T00:00:00Z'),
        }),
      ])?.programId,
    ).toBe('system-boosteado')
  })

  it('no muta el array de entrada', () => {
    const list = [
      candidate({ assignmentId: '1', kind: 'POSITION' }),
      candidate({ assignmentId: '2', kind: 'PLAYER' }),
    ]
    resolveProgram(list)
    expect(list.map((c) => c.assignmentId)).toEqual(['1', '2'])
  })
})
