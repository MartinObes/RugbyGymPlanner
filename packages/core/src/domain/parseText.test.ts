import { describe, expect, it } from 'vitest'
import { parsedProgramSchema } from '../validators/parsedProgram'
import { parseText } from './parseText'

const first = (input: string) => parseText(input).weeks[0]!.days[0]!.blocks[0]!

describe('parseText', () => {
  it('devuelve un programa vacío con entrada vacía', () => {
    expect(parseText('')).toEqual({ weeks: [], issues: [] })
  })

  it('parsea un ejercicio con porcentaje y RPE', () => {
    expect(first('Semana 1\nDía 1\nPress Banca 4x5 @80% RPE8').exercises[0]!).toEqual({
      exerciseName: 'Press Banca',
      sets: 4,
      reps: '5',
      loadType: 'PERCENTAGE',
      weight: null,
      percentage: 80,
      loadLabel: null,
      targetRpe: 8,
    })
  })

  it('parsea kg fijos', () => {
    const e = first('Semana 1\nDía 1\nRemo con Barra 3x10 @60kg').exercises[0]!
    expect(e.loadType).toBe('WEIGHT')
    expect(e.weight).toBe(60)
    expect(e.percentage).toBeNull()
  })

  it('sin carga usa NONE y conserva reps con unidad', () => {
    const e = first('Semana 1\nDía 1\nPlancha 3x30s').exercises[0]!
    expect(e.loadType).toBe('NONE')
    expect(e.reps).toBe('30s')
  })

  it('acepta rangos de reps', () => {
    expect(first('Semana 1\nDía 1\nSentadilla 4x8-10').exercises[0]!.reps).toBe('8-10')
  })

  it('abre un circuito con # y x<n>', () => {
    const b = first('Semana 1\nDía 1\n# Core circuito x3\nPlancha 3x30s')
    expect(b.type).toBe('CIRCUIT')
    expect(b.rounds).toBe(3)
  })

  it('un # sin x abre un bloque simple', () => {
    const b = first('Semana 1\nDía 1\n# Fuerza\nSentadilla 4x5')
    expect(b.type).toBe('SINGLE')
    expect(b.rounds).toBeNull()
  })

  it('acepta "Dia" sin tilde', () => {
    expect(parseText('Semana 1\nDia 2\nPlancha 3x30s').weeks[0]!.days[0]!.name).toBe('Día 2')
  })

  it('agrupa varias semanas y días', () => {
    const r = parseText(
      'Semana 1\nDía 1\nPlancha 3x30s\nDía 2\nSentadilla 4x5\nSemana 2\nDía 1\nRemo 3x10',
    )
    expect(r.weeks).toHaveLength(2)
    expect(r.weeks[0]!.days).toHaveLength(2)
    expect(r.weeks[1]!.days).toHaveLength(1)
  })

  it('ignora líneas en blanco', () => {
    const r = parseText('Semana 1\n\nDía 1\n\nPlancha 3x30s\n\n')
    expect(r.issues).toHaveLength(0)
    expect(r.weeks[0]!.days[0]!.blocks[0]!.exercises).toHaveLength(1)
  })

  it('reporta una línea sin sets x reps como issue con su número de fila', () => {
    const r = parseText('Semana 1\nDía 1\nPress Banca')
    expect(r.issues).toHaveLength(1)
    expect(r.issues[0]!.row).toBe(3)
  })

  it('reporta un ejercicio antes de cualquier Semana', () => {
    const r = parseText('Press Banca 4x5')
    expect(r.weeks).toHaveLength(0)
    expect(r.issues[0]!.message).toContain('Semana')
  })

  it('un ejercicio sin bloque explícito crea un bloque simple', () => {
    expect(first('Semana 1\nDía 1\nSentadilla 4x5').type).toBe('SINGLE')
  })

  it('un ejercicio sin día explícito abre un Día 1', () => {
    const r = parseText('Semana 1\nSentadilla 4x5')
    expect(r.weeks[0]!.days[0]!.name).toBe('Día 1')
    expect(r.issues).toHaveLength(0)
  })

  it('tolera CRLF', () => {
    const r = parseText('Semana 1\r\nDía 1\r\nSentadilla 4x5\r\n')
    expect(r.weeks[0]!.days[0]!.blocks[0]!.exercises).toHaveLength(1)
    expect(r.issues).toHaveLength(0)
  })

  it('acepta el porcentaje sin el símbolo y con decimales en el RPE', () => {
    const e = first('Semana 1\nDía 1\nPress Banca 4x5 @80 RPE7.5').exercises[0]!
    expect(e.loadType).toBe('PERCENTAGE')
    expect(e.percentage).toBe(80)
    expect(e.targetRpe).toBe(7.5)
  })

  it('rechaza un porcentaje fuera de 1..100 con un issue', () => {
    const r = parseText('Semana 1\nDía 1\nPress Banca 4x5 @150%')
    expect(r.issues).toHaveLength(1)
    expect(r.weeks[0]!.days[0]!.blocks).toHaveLength(0)
  })

  it('el resultado pasa parsedProgramSchema', () => {
    const r = parseText('Semana 1\nDía 1\n# Circuito x3\nPress Banca 4x5 @80% RPE8\nPlancha 3x30s')
    expect(parsedProgramSchema.safeParse(r).success).toBe(true)
  })
})
