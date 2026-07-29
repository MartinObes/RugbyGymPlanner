import { describe, expect, it } from 'vitest'
import { buildPlayerDay, type PlayerDayInput } from './buildPlayerDay'

function makeInput(): PlayerDayInput {
  return {
    day: {
      id: 'day-w3',
      name: 'Día 1',
      blocks: [
        {
          id: 'b1',
          type: 'SINGLE',
          rounds: null,
          exercises: [
            {
              id: 'be1',
              exerciseName: 'Press Banca',
              sets: 4,
              reps: '5',
              loadType: 'PERCENTAGE',
              weight: null,
              percentage: 80,
              loadLabel: null,
              targetRpe: 8,
            },
            {
              id: 'be2',
              exerciseName: 'Dominadas',
              sets: 3,
              reps: 'AMRAP',
              loadType: 'NONE',
              weight: null,
              percentage: null,
              loadLabel: null,
              targetRpe: null,
            },
          ],
        },
        {
          id: 'b2',
          type: 'CIRCUIT',
          rounds: 3,
          exercises: [
            {
              id: 'be3',
              exerciseName: 'Plancha',
              sets: 1,
              reps: "40''",
              loadType: 'LABEL',
              weight: null,
              percentage: null,
              loadLabel: 'p.corp',
              targetRpe: null,
            },
          ],
        },
      ],
    },
    weekName: 'Semana 3',
    oneRms: [{ normalizedName: 'press banca', kg: 140 }],
    history: [
      {
        normalizedName: 'press banca',
        dayId: 'day-w2',
        weekName: 'Semana 2',
        dayName: 'Día 1',
        weight: 105,
        reps: 5,
        rpe: 8,
        performedAt: new Date('2026-01-12T00:00:00Z'),
      },
    ],
    entries: [{ blockExerciseId: 'be1', weight: 112, reps: 5, rpe: 9 }],
  }
}

describe('buildPlayerDay', () => {
  it('calcula los kg del porcentaje con el 1RM del jugador', () => {
    const row = buildPlayerDay(makeInput()).blocks[0]!.exercises[0]!
    expect(row.load.kind).toBe('percentage')
    expect(row.load.label).toBe('80% → 112 kg')
  })

  it('marca el ejercicio sin 1RM en vez de ocultarlo', () => {
    const row = buildPlayerDay({ ...makeInput(), oneRms: [] }).blocks[0]!.exercises[0]!
    expect(row.load.kind).toBe('missing-1rm')
    expect(row.load.label).toContain('falta tu 1RM de Press Banca')
  })

  it('expone la lista de 1RM faltantes del día', () => {
    expect(buildPlayerDay({ ...makeInput(), oneRms: [] }).missingOneRms).toEqual(['Press Banca'])
  })

  it('no repite un ejercicio en missingOneRms', () => {
    const input = makeInput()
    input.oneRms = []
    input.day.blocks[0]!.exercises.push({
      ...input.day.blocks[0]!.exercises[0]!,
      id: 'be4',
    })
    expect(buildPlayerDay(input).missingOneRms).toEqual(['Press Banca'])
  })

  it('muestra la etiqueta de una carga LABEL', () => {
    const row = buildPlayerDay(makeInput()).blocks[1]!.exercises[0]!
    expect(row.load.kind).toBe('label')
    expect(row.load.label).toBe('p.corp')
  })

  it('conserva el tipo y las vueltas del bloque', () => {
    const block = buildPlayerDay(makeInput()).blocks[1]!
    expect(block.type).toBe('CIRCUIT')
    expect(block.rounds).toBe(3)
  })

  it('adjunta la última vez formateada', () => {
    expect(buildPlayerDay(makeInput()).blocks[0]!.exercises[0]!.lastPerfLabel).toBe(
      'Semana 2 · Día 1: 105 kg · 5 reps · RPE 8',
    )
  })

  it('deja lastPerfLabel en null sin historial', () => {
    expect(buildPlayerDay(makeInput()).blocks[0]!.exercises[1]!.lastPerfLabel).toBeNull()
  })

  it('no se autorreferencia: descarta el historial del propio día', () => {
    const input = makeInput()
    input.history[0]!.dayId = input.day.id
    expect(buildPlayerDay(input).blocks[0]!.exercises[0]!.lastPerfLabel).toBeNull()
  })

  it('adjunta la entrada ya registrada', () => {
    expect(buildPlayerDay(makeInput()).blocks[0]!.exercises[0]!.entry).toEqual({
      blockExerciseId: 'be1',
      weight: 112,
      reps: 5,
      rpe: 9,
    })
  })

  it('deja entry en null cuando no se registró', () => {
    expect(buildPlayerDay(makeInput()).blocks[0]!.exercises[1]!.entry).toBeNull()
  })

  it('cuenta el progreso del día sobre todos los bloques', () => {
    const day = buildPlayerDay(makeInput())
    expect(day.loggedCount).toBe(1)
    expect(day.totalCount).toBe(3)
  })

  it('una entry sin ningún dato no cuenta como registrada', () => {
    const input = makeInput()
    input.entries = [{ blockExerciseId: 'be1', weight: null, reps: null, rpe: null }]
    expect(buildPlayerDay(input).loggedCount).toBe(0)
  })

  it('una entry con solo RPE cuenta como registrada', () => {
    const input = makeInput()
    input.entries = [{ blockExerciseId: 'be1', weight: null, reps: null, rpe: 7 }]
    expect(buildPlayerDay(input).loggedCount).toBe(1)
  })

  it('un ejercicio sin peso queda en kind none', () => {
    expect(buildPlayerDay(makeInput()).blocks[0]!.exercises[1]!.load.kind).toBe('none')
  })

  it('pasa el nombre de la semana al día', () => {
    expect(buildPlayerDay(makeInput()).weekName).toBe('Semana 3')
  })

  it('no muta la entrada', () => {
    const input = makeInput()
    const copy = structuredClone(input)
    buildPlayerDay(input)
    expect(input).toEqual(copy)
  })
})
