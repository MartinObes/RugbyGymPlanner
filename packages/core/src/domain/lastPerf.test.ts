import { describe, expect, it } from 'vitest'
import { formatLastPerf, hasData, lastPerf, type PerfRecord } from './lastPerf'

const at = (iso: string) => new Date(iso)

const history: PerfRecord[] = [
  {
    normalizedName: 'press banca',
    dayId: 'day-w1',
    weekName: 'Semana 1',
    dayName: 'Día 1',
    weight: 100,
    reps: 5,
    rpe: 7,
    performedAt: at('2026-01-05T10:00:00Z'),
  },
  {
    normalizedName: 'press banca',
    dayId: 'day-w2',
    weekName: 'Semana 2',
    dayName: 'Día 1',
    weight: 105,
    reps: 5,
    rpe: 8,
    performedAt: at('2026-01-12T10:00:00Z'),
  },
  {
    normalizedName: 'sentadilla',
    dayId: 'day-w2b',
    weekName: 'Semana 2',
    dayName: 'Día 2',
    weight: 160,
    reps: 3,
    rpe: 9,
    performedAt: at('2026-01-13T10:00:00Z'),
  },
]

describe('hasData', () => {
  it('es false con los tres campos nulos', () => {
    expect(hasData({ weight: null, reps: null, rpe: null })).toBe(false)
  })

  it('es true con cualquiera de los tres', () => {
    expect(hasData({ weight: 100, reps: null, rpe: null })).toBe(true)
    expect(hasData({ weight: null, reps: 8, rpe: null })).toBe(true)
    expect(hasData({ weight: null, reps: null, rpe: 7 })).toBe(true)
  })

  it('cuenta un 0 como dato', () => {
    expect(hasData({ weight: 0, reps: null, rpe: null })).toBe(true)
  })
})

describe('lastPerf', () => {
  it('devuelve el registro más reciente del ejercicio', () => {
    expect(lastPerf(history, 'Press Banca')?.weight).toBe(105)
  })

  it('no mezcla ejercicios distintos', () => {
    expect(lastPerf(history, 'Sentadilla')?.weight).toBe(160)
  })

  it('matchea ignorando acentos y mayúsculas', () => {
    const withAccents: PerfRecord[] = [{ ...history[0]!, normalizedName: 'sentadilla bulgara' }]
    expect(lastPerf(withAccents, 'Sentadilla Búlgara')).not.toBeNull()
  })

  it('devuelve null si el ejercicio no tiene historial', () => {
    expect(lastPerf(history, 'Remo con Barra')).toBeNull()
  })

  it('devuelve null con historial vacío', () => {
    expect(lastPerf([], 'Press Banca')).toBeNull()
  })

  it('devuelve null con nombre vacío', () => {
    expect(lastPerf(history, '   ')).toBeNull()
  })

  it('ignora los registros sin ningún dato', () => {
    const empty: PerfRecord[] = [
      {
        ...history[1]!,
        dayId: 'day-w3',
        weight: null,
        reps: null,
        rpe: null,
        performedAt: at('2026-02-01T00:00:00Z'),
      },
    ]
    expect(lastPerf([...history, ...empty], 'Press Banca')?.weight).toBe(105)
  })

  it('acepta un registro sin peso pero con reps (ejercicio sin carga)', () => {
    const bodyweight: PerfRecord[] = [
      {
        normalizedName: 'dominadas',
        dayId: 'day-w3',
        weekName: 'Semana 3',
        dayName: 'Día 1',
        weight: null,
        reps: 12,
        rpe: 8,
        performedAt: at('2026-01-20T00:00:00Z'),
      },
    ]
    expect(lastPerf(bodyweight, 'Dominadas')?.reps).toBe(12)
  })

  // El día que se está mostrando no es "última vez": es hoy. Se excluye por
  // dayId y no comparando nombres, porque los ids son exactos y el coach puede
  // llamar "Día 1" a dos días distintos.
  it('descarta el día que se está mostrando', () => {
    expect(lastPerf(history, 'Press Banca', 'day-w2')?.weight).toBe(100)
  })

  it('excluir un día que no está en el historial no cambia nada', () => {
    expect(lastPerf(history, 'Press Banca', 'day-inexistente')?.weight).toBe(105)
  })

  it('no muta el historial recibido', () => {
    const copy = structuredClone(history)
    lastPerf(history, 'Press Banca')
    expect(history).toEqual(copy)
  })
})

describe('formatLastPerf', () => {
  it('arma la línea completa', () => {
    expect(formatLastPerf(history[1]!)).toBe('Semana 2 · Día 1: 105 kg · 5 reps · RPE 8')
  })

  it('omite los kg cuando no hubo peso', () => {
    expect(formatLastPerf({ ...history[1]!, weight: null })).toBe('Semana 2 · Día 1: 5 reps · RPE 8')
  })

  it('omite el RPE cuando no se registró', () => {
    expect(formatLastPerf({ ...history[1]!, rpe: null })).toBe('Semana 2 · Día 1: 105 kg · 5 reps')
  })

  it('muestra decimales solo cuando los hay', () => {
    expect(formatLastPerf({ ...history[1]!, weight: 102.5 })).toContain('102.5 kg')
  })

  it('devuelve null sin registro', () => {
    expect(formatLastPerf(null)).toBeNull()
  })
})
