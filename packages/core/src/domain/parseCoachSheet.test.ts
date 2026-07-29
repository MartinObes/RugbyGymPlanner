import { describe, expect, it } from 'vitest'
import { parsedProgramSchema } from '../validators/parsedProgram'
import { findWeekColumns, isRoutineSheet, parseCoachSheet } from './parseCoachSheet'

/**
 * Fixtures calcados de la estructura real de las planillas del club
 * (Ms-Ap-Wi-Fb.xlsx, hojas "14.15.16", "Fuerza 1.2", "Aerobico 1.2"), con los
 * nombres de ejercicio recortados y sin ningún dato personal.
 */

// Layout con columna C separadora: semanas en D-F, G-I, J-L.
const THREE_WEEKS: unknown[][] = [
  ['MEDIOSCRUM-APERTURA-WING-FB', null, null, 'ABRIL 13 al 19', null, null, 'ABRIL 20 al 26', null, null, 'ABRIL 27 al 3', null, null],
  [null, 'SESION 1 - LUNES', null, 'CIRCULO', null, null, 'CHAMPAGNAT', null, null, 'SEMINARIO', null, null],
  [null, "5' BICICLETA - FLEXIBILIDAD", null, 'kilos', 'repet', 'S', 'kilos', 'repet', 'S', 'kilos', 'repet', 'S'],
  ['bloque 1', 'CIRCUITO CALENTAMIENTO', null, '2 vueltas', null, null, '2 vueltas', null, null, '2 vueltas', null, null],
  [null, 'Lagartijas pronos en trx', null, 'p.corp', 10, null, 'p.corp', 10, null, 'p.corp', 10, null],
  [null, 'Vuelos disociados', null, 10, 10, null, 10, 10, null, 10, 10, null],
  ['bloque 2', 'C 1', null, '4 VUELTAS', null, null, '4 VUELTAS', null, null, '4 VUELTAS', null, null],
  [null, 'Cuadriceps 1p - 2p', null, '60 . 120', '6 c/p.6', null, '60 . 120', '6 c/p.6', null, '60 . 120', '6 c/p.6', null],
  [null, 'Pecho plano', null, 100, 6, null, 110, 5, null, 120, 4, null],
  [null, 'FLEXIBILIDAD', null, null, null, null, null, null, null, null, null, null],
  [null, 'SESION 2 - MARTES', null, null, null, null, null, null, null, null, null, null],
  ['bloque 1', 'CIRCUITO CALENTAMIENTO', null, '2 VUELTAS', null, null, '2 VUELTAS', null, null, '2 VUELTAS', null, null],
  [null, 'Sentadilla', null, 110, 6, null, 120, 5, null, 130, 4, null],
]

// Layout sin separadora: una sola semana en C-E.
const ONE_WEEK_NO_SPACER: unknown[][] = [
  ['AEROBICO BACKS', null, null, null, null],
  ['ENERO', null, null, null, null],
  ['SESION 1 - MARTES 13', null, null, null, null],
  [null, 'MOVILIDAD - FLEXIBILIDAD', 'kilos', 'repet', 'S'],
  ['bloque 1', 'CIRCUITO CALENTAMIENTO', '2 vueltas', null, null],
  [null, 'Dorsales 3 posiciones', 'p.corp', '10 c/u', null],
  [null, 'Abdominal + me paro', 'p.corp', 10, null],
]

describe('isRoutineSheet', () => {
  it('reconoce una hoja de rutina por su fila de encabezados', () => {
    expect(isRoutineSheet(THREE_WEEKS)).toBe(true)
    expect(isRoutineSheet(ONE_WEEK_NO_SPACER)).toBe(true)
  })

  it('descarta una hoja vacía', () => {
    expect(isRoutineSheet([])).toBe(false)
  })

  it('descarta el calendario de micros (no tiene kilos/repet)', () => {
    expect(
      isRoutineSheet([
        ['BLOQUE 1 : MICROS 1 al 4'],
        [null, 'LUNES 12', 'MARTES 13', 'MIERCOLES 14'],
        ['M', 'FUERZA', 'AEROBICO', 'FUERZA'],
      ]),
    ).toBe(false)
  })

  it('descarta la hoja de plantel', () => {
    expect(
      isRoutineSheet([
        [null, 'BACKS'],
        [null, 'GRUPO 1'],
        [1, 'APELLIDO', 'APODO', 437],
      ]),
    ).toBe(false)
  })
})

describe('findWeekColumns', () => {
  it('encuentra las tres semanas en D, G y J', () => {
    expect(findWeekColumns(THREE_WEEKS)).toEqual({
      headerRow: 2,
      groups: [
        { load: 3, reps: 4 },
        { load: 6, reps: 7 },
        { load: 9, reps: 10 },
      ],
    })
  })

  it('encuentra la única semana en C cuando no hay columna separadora', () => {
    expect(findWeekColumns(ONE_WEEK_NO_SPACER)).toEqual({
      headerRow: 3,
      groups: [{ load: 2, reps: 3 }],
    })
  })

  it('devuelve null cuando no hay fila de encabezados', () => {
    expect(findWeekColumns([['cualquier cosa']])).toBeNull()
  })
})

describe('parseCoachSheet', () => {
  it('crea una semana del programa por cada columna de semana', () => {
    const result = parseCoachSheet(THREE_WEEKS, '14.15.16')
    expect(result.weeks).toHaveLength(3)
    expect(result.weeks.map((w) => w.name)).toEqual(['Semana 14', 'Semana 15', 'Semana 16'])
  })

  it('usa el nombre de la hoja para numerar las semanas, tolerando prefijos', () => {
    expect(parseCoachSheet(THREE_WEEKS, 'Fuerza 1.2').weeks.map((w) => w.name)).toEqual([
      'Semana 1',
      'Semana 2',
      'Semana 3',
    ])
  })

  it('cae a numeración genérica si el nombre de hoja no tiene números', () => {
    expect(parseCoachSheet(ONE_WEEK_NO_SPACER, 'Aerobico').weeks[0]!.name).toBe('Semana 1')
  })

  it('parte los días por SESION n', () => {
    const week = parseCoachSheet(THREE_WEEKS, '14.15.16').weeks[0]!
    expect(week.days.map((d) => d.name)).toEqual(['Sesión 1 - Lunes', 'Sesión 2 - Martes'])
  })

  it('un bloque con VUELTAS es circuito con esas vueltas', () => {
    const block = parseCoachSheet(THREE_WEEKS, '14.15.16').weeks[0]!.days[0]!.blocks[0]!
    expect(block.type).toBe('CIRCUIT')
    expect(block.rounds).toBe(2)
  })

  it('las vueltas se leen por semana: pueden diferir', () => {
    const sheet: unknown[][] = [
      [null, 'SESION 1 - LUNES', null, 'S1', null, null, 'S2', null, null],
      [null, null, null, 'kilos', 'repet', 'S', 'kilos', 'repet', 'S'],
      ['bloque 1', 'C 1', null, '3 VUELTAS', null, null, '2 VUELTAS', null, null],
      [null, 'Sentadilla', null, 100, 5, null, 110, 4, null],
    ]
    const result = parseCoachSheet(sheet, '8.9')
    expect(result.weeks[0]!.days[0]!.blocks[0]!.rounds).toBe(3)
    expect(result.weeks[1]!.days[0]!.blocks[0]!.rounds).toBe(2)
  })

  it('un sub-bloque sin marcador en la columna A también abre bloque', () => {
    // Los C 1 / C 2 / C 3 de un día no llevan "bloque n": su única señal son las
    // vueltas en la celda de carga. Sin esto entraban como ejercicios con carga
    // "3 VUELTAS", que es justo lo que apareció al correrlo contra las planillas.
    const sheet: unknown[][] = [
      [null, 'SESION 1 - LUNES', null, null, null, null],
      [null, null, null, 'kilos', 'repet', 'S'],
      ['bloque 2', 'C 1', null, '3 VUELTAS', null, null],
      [null, 'Sentadilla', null, 120, 4, null],
      [null, 'C 2', null, '2 VUELTAS', null, null],
      [null, 'Press hombro', null, 70, 4, null],
    ]
    const day = parseCoachSheet(sheet, '29.30').weeks[0]!.days[0]!

    expect(day.blocks).toHaveLength(2)
    expect(day.blocks.map((b) => b.rounds)).toEqual([3, 2])
    const names = day.blocks.flatMap((b) => b.exercises.map((e) => e.exerciseName))
    expect(names).toEqual(['Sentadilla', 'Press hombro'])
    // Ninguna carga puede ser una cantidad de vueltas.
    const labels = day.blocks.flatMap((b) => b.exercises.map((e) => e.loadLabel))
    expect(labels.every((l) => l === null || !/vueltas/i.test(l))).toBe(true)
  })

  it('una carga numérica es WEIGHT', () => {
    const exercise = parseCoachSheet(THREE_WEEKS, '14.15.16').weeks[0]!.days[0]!.blocks[1]!.exercises[1]!
    expect(exercise.exerciseName).toBe('Pecho plano')
    expect(exercise.loadType).toBe('WEIGHT')
    expect(exercise.weight).toBe(100)
  })

  it('la misma fila lleva cargas distintas en cada semana', () => {
    const result = parseCoachSheet(THREE_WEEKS, '14.15.16')
    const weights = result.weeks.map(
      (w) => w.days[0]!.blocks[1]!.exercises[1]!.weight,
    )
    expect(weights).toEqual([100, 110, 120])
  })

  it('p.corp es una etiqueta, no ausencia de carga', () => {
    const exercise = parseCoachSheet(THREE_WEEKS, '14.15.16').weeks[0]!.days[0]!.blocks[0]!.exercises[0]!
    expect(exercise.loadType).toBe('LABEL')
    expect(exercise.loadLabel).toBe('p.corp')
    expect(exercise.weight).toBeNull()
  })

  it('una fila doble se conserva entera, con la carga como etiqueta', () => {
    const exercise = parseCoachSheet(THREE_WEEKS, '14.15.16').weeks[0]!.days[0]!.blocks[1]!.exercises[0]!
    expect(exercise.exerciseName).toBe('Cuadriceps 1p - 2p')
    expect(exercise.loadType).toBe('LABEL')
    expect(exercise.loadLabel).toBe('60 . 120')
    expect(exercise.reps).toBe('6 c/p.6')
  })

  it('conserva la notación de reps tal cual', () => {
    const result = parseCoachSheet(ONE_WEEK_NO_SPACER, 'Aerobico 1.2')
    expect(result.weeks[0]!.days[0]!.blocks[0]!.exercises[0]!.reps).toBe('10 c/u')
  })

  it('las filas de cierre como FLEXIBILIDAD no son ejercicios', () => {
    const names = parseCoachSheet(THREE_WEEKS, '14.15.16')
      .weeks[0]!.days[0]!.blocks.flatMap((b) => b.exercises.map((e) => e.exerciseName))
    expect(names).not.toContain('FLEXIBILIDAD')
  })

  it('una hoja sin encabezados devuelve cero semanas y un issue', () => {
    const result = parseCoachSheet([['MICROS'], ['M', 'FUERZA']], 'Micros')
    expect(result.weeks).toEqual([])
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]!.message).toContain('kilos')
  })

  it('una hoja vacía devuelve cero semanas sin explotar', () => {
    expect(parseCoachSheet([], '31.32.33')).toEqual({
      weeks: [],
      issues: [{ row: 1, message: 'La hoja está vacía' }],
    })
  })

  it('el resultado pasa parsedProgramSchema', () => {
    expect(parsedProgramSchema.safeParse(parseCoachSheet(THREE_WEEKS, '14.15.16')).success).toBe(true)
  })

  it('no genera semanas con días vacíos', () => {
    const result = parseCoachSheet(THREE_WEEKS, '14.15.16')
    for (const week of result.weeks) {
      expect(week.days.length).toBeGreaterThan(0)
      for (const day of week.days) expect(day.blocks.length).toBeGreaterThan(0)
    }
  })
})
