import { describe, expect, it } from 'vitest'
import { parsedProgramSchema } from '../validators/parsedProgram'
import { parseGrid } from './parseGrid'

const HEADERS = ['semana', 'dia', 'bloque', 'vueltas', 'ejercicio', 'series', 'reps', 'carga', 'rpe']

const row = (values: (string | number | null)[]) => values

describe('parseGrid', () => {
  it('devuelve un programa vacío sin filas', () => {
    expect(parseGrid([])).toEqual({ weeks: [], issues: [] })
  })

  it('parsea una fila con porcentaje', () => {
    const result = parseGrid([
      HEADERS,
      row(['Semana 1', 'Día 1', 'Fuerza', null, 'Press Banca', 4, '5', '80%', 8]),
    ])
    expect(result.issues).toEqual([])
    expect(result.weeks[0]!.days[0]!.blocks[0]!.exercises[0]!).toEqual({
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

  it('acepta los encabezados en cualquier orden y con acentos o mayúsculas', () => {
    const result = parseGrid([
      ['Ejercicio', 'SEMANA', 'Día', 'Series', 'Reps', 'Carga'],
      row(['Sentadilla', 'Semana 1', 'Día 1', 5, '3', '100kg']),
    ])
    const exercise = result.weeks[0]!.days[0]!.blocks[0]!.exercises[0]!
    expect(exercise.exerciseName).toBe('Sentadilla')
    expect(exercise.loadType).toBe('WEIGHT')
    expect(exercise.weight).toBe(100)
  })

  it('sin la columna ejercicio reporta un issue en la fila 1 y no devuelve semanas', () => {
    const result = parseGrid([['semana', 'dia', 'series', 'reps']])
    expect(result.weeks).toEqual([])
    expect(result.issues[0]!.row).toBe(1)
    expect(result.issues[0]!.message).toContain('ejercicio')
  })

  it('acepta series como número o como texto', () => {
    const result = parseGrid([
      HEADERS,
      row(['Semana 1', 'Día 1', null, null, 'Press Banca', '4', 5, null, null]),
    ])
    const exercise = result.weeks[0]!.days[0]!.blocks[0]!.exercises[0]!
    expect(exercise.sets).toBe(4)
    expect(exercise.reps).toBe('5')
  })

  it('carga vacía o "-" es sin peso', () => {
    const result = parseGrid([
      HEADERS,
      row(['Semana 1', 'Día 1', null, null, 'Plancha', 3, '30s', '', null]),
      row(['Semana 1', 'Día 1', null, null, 'Puente', 3, '30s', '-', null]),
    ])
    const exercises = result.weeks[0]!.days[0]!.blocks[0]!.exercises
    expect(exercises).toHaveLength(2)
    expect(exercises.every((e) => e.loadType === 'NONE')).toBe(true)
  })

  it('carga numérica sin unidad se interpreta como kg', () => {
    const result = parseGrid([
      HEADERS,
      row(['Semana 1', 'Día 1', null, null, 'Remo', 3, '10', 60, null]),
    ])
    const exercise = result.weeks[0]!.days[0]!.blocks[0]!.exercises[0]!
    expect(exercise.loadType).toBe('WEIGHT')
    expect(exercise.weight).toBe(60)
  })

  it('agrupa por semana y día repetidos', () => {
    const result = parseGrid([
      HEADERS,
      row(['Semana 1', 'Día 1', null, null, 'Remo', 3, '10', null, null]),
      row(['Semana 1', 'Día 1', null, null, 'Curl', 3, '10', null, null]),
      row(['Semana 1', 'Día 2', null, null, 'Peso Muerto', 3, '10', null, null]),
      row(['Semana 2', 'Día 1', null, null, 'Dominadas', 3, '10', null, null]),
    ])
    expect(result.weeks).toHaveLength(2)
    expect(result.weeks[0]!.days).toHaveLength(2)
    expect(result.weeks[0]!.days[0]!.blocks[0]!.exercises).toHaveLength(2)
    expect(result.weeks[1]!.days).toHaveLength(1)
  })

  it('un bloque con vueltas es un circuito', () => {
    const result = parseGrid([
      HEADERS,
      row(['Semana 1', 'Día 1', 'Core', 3, 'Plancha', 3, '30s', null, null]),
    ])
    const block = result.weeks[0]!.days[0]!.blocks[0]!
    expect(block.type).toBe('CIRCUIT')
    expect(block.rounds).toBe(3)
  })

  it('filas del mismo bloque se agrupan y un bloque distinto abre otro', () => {
    const result = parseGrid([
      HEADERS,
      row(['Semana 1', 'Día 1', 'Fuerza', null, 'Remo', 3, '10', null, null]),
      row(['Semana 1', 'Día 1', 'Fuerza', null, 'Curl', 3, '10', null, null]),
      row(['Semana 1', 'Día 1', 'Core', 3, 'Plancha', 3, '30s', null, null]),
    ])
    const blocks = result.weeks[0]!.days[0]!.blocks
    expect(blocks).toHaveLength(2)
    expect(blocks[0]!.exercises).toHaveLength(2)
    expect(blocks[1]!.type).toBe('CIRCUIT')
  })

  it('saltea filas totalmente vacías sin generar issues', () => {
    const result = parseGrid([
      HEADERS,
      row([null, null, null, null, null, null, null, null, null]),
      row(['Semana 1', 'Día 1', null, null, 'Remo', 3, '10', null, null]),
      row(['', '', '', '', '', '', '', '', '']),
    ])
    expect(result.issues).toEqual([])
    expect(result.weeks[0]!.days[0]!.blocks[0]!.exercises).toHaveLength(1)
  })

  it('una fila sin ejercicio reporta issue con su número de fila real', () => {
    const result = parseGrid([
      HEADERS,
      row(['Semana 1', 'Día 1', null, null, '', 3, '10', null, null]),
    ])
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]!.row).toBe(2)
  })

  it('una fila sin semana usa Semana 1 implícita', () => {
    const result = parseGrid([HEADERS, row([null, null, null, null, 'Remo', 3, '10', null, null])])
    expect(result.weeks[0]!.name).toBe('Semana 1')
    expect(result.weeks[0]!.days[0]!.name).toBe('Día 1')
  })

  it('el resultado pasa parsedProgramSchema', () => {
    const result = parseGrid([
      HEADERS,
      row(['Semana 1', 'Día 1', 'Core', 3, 'Plancha', 3, '30s', null, 7.5]),
    ])
    expect(parsedProgramSchema.safeParse(result).success).toBe(true)
  })
})
