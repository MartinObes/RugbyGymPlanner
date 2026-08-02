import { describe, expect, it } from 'vitest'
import { resolveProgram, type CandidateAssignment } from './resolveProgram'

const at = (iso: string, over: Partial<CandidateAssignment> = {}): CandidateAssignment => ({
  assignmentId: `a-${iso}`,
  programId: `p-${iso}`,
  kind: 'PLAYER',
  createdAt: new Date(iso),
  ...over,
})

describe('resolveProgram', () => {
  it('sin candidatas no hay programa', () => {
    expect(resolveProgram([])).toBeNull()
  })

  it('con una sola candidata gana esa', () => {
    const only = at('2026-01-01')
    expect(resolveProgram([only])).toBe(only)
  })

  it('gana la asignada mas recientemente, sin importar el destino', () => {
    // La vieja regla habria hecho ganar a PLAYER (base 100) sobre SYSTEM_GROUP (30).
    const older = at('2026-01-01', { kind: 'PLAYER' })
    const newer = at('2026-02-01', { kind: 'SYSTEM_GROUP' })
    expect(resolveProgram([older, newer])?.assignmentId).toBe(newer.assignmentId)
  })

  it('el orden en que llegan las candidatas no cambia el resultado', () => {
    const older = at('2026-01-01')
    const newer = at('2026-02-01')
    expect(resolveProgram([newer, older])?.assignmentId).toBe(newer.assignmentId)
    expect(resolveProgram([older, newer])?.assignmentId).toBe(newer.assignmentId)
  })

  it('ante un empate exacto de createdAt es estable: gana la primera', () => {
    const a = at('2026-01-01', { assignmentId: 'a1' })
    const b = at('2026-01-01', { assignmentId: 'b1' })
    expect(resolveProgram([a, b])?.assignmentId).toBe('a1')
  })

  it('honra la eleccion del jugador cuando ese programa sigue entre las candidatas', () => {
    const older = at('2026-01-01', { programId: 'vieja' })
    const newer = at('2026-02-01', { programId: 'nueva' })
    expect(resolveProgram([older, newer], 'vieja')?.programId).toBe('vieja')
  })

  it('ignora una eleccion que ya no alcanza al jugador y cae en la ultima asignada', () => {
    // El coach le quito el assignment de 'vieja': la FK no se entera, la regla si.
    const newer = at('2026-02-01', { programId: 'nueva' })
    expect(resolveProgram([newer], 'vieja')?.programId).toBe('nueva')
  })

  it('una eleccion null significa "la ultima asignada", no "ninguna"', () => {
    const newer = at('2026-02-01', { programId: 'nueva' })
    expect(resolveProgram([newer], null)?.programId).toBe('nueva')
  })

  it('si dos assignments apuntan al mismo programa elegido, devuelve el mas reciente', () => {
    const a = at('2026-01-01', { programId: 'x', assignmentId: 'viejo' })
    const b = at('2026-03-01', { programId: 'x', assignmentId: 'nuevo' })
    expect(resolveProgram([a, b], 'x')?.assignmentId).toBe('nuevo')
  })

  it('no muta el array de entrada', () => {
    const list = [
      at('2026-01-01', { assignmentId: '1' }),
      at('2026-02-01', { assignmentId: '2' }),
    ]
    resolveProgram(list)
    expect(list.map((c) => c.assignmentId)).toEqual(['1', '2'])
  })
})
