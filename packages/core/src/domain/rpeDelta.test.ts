import { describe, expect, it } from 'vitest'
import { dayTargetRpe, rpeDelta, summarizeRpe } from './rpeDelta'

describe('dayTargetRpe', () => {
  it('promedia los target del dia', () => {
    expect(dayTargetRpe([8, 8, 8])).toBe(8)
  })

  it('ignora los ejercicios sin target', () => {
    expect(dayTargetRpe([8, null, 6, null])).toBe(7)
  })

  it('redondea a un decimal para no mostrar 7.333333', () => {
    expect(dayTargetRpe([7, 7, 8])).toBe(7.3)
  })

  it('sin ningun target el dia no tiene objetivo', () => {
    // Caso real: target_rpe es nullable y las planillas del club lo dejan vacio.
    expect(dayTargetRpe([null, null])).toBeNull()
  })

  it('con lista vacia no rompe', () => {
    expect(dayTargetRpe([])).toBeNull()
  })
})

describe('rpeDelta', () => {
  it('en el objetivo devuelve severidad ok', () => {
    expect(rpeDelta(8, 8)).toEqual({ delta: 0, severity: 'ok', label: 'En el objetivo' })
  })

  it('1 punto de diferencia sigue siendo ok', () => {
    expect(rpeDelta(8, 9).severity).toBe('ok')
    expect(rpeDelta(8, 7).severity).toBe('ok')
  })

  it('2 puntos por encima avisa que la carga quedo pesada', () => {
    const result = rpeDelta(7, 9)
    expect(result.delta).toBe(2)
    expect(result.severity).toBe('heavy')
    expect(result.label).toBe('2 puntos más pesado de lo pedido')
  })

  it('2 puntos por debajo avisa que quedo liviana', () => {
    const result = rpeDelta(9, 7)
    expect(result.delta).toBe(-2)
    expect(result.severity).toBe('light')
    expect(result.label).toBe('2 puntos más liviano de lo pedido')
  })

  it('el label usa la magnitud, no el delta con signo', () => {
    expect(rpeDelta(6, 9).label).toBe('3 puntos más pesado de lo pedido')
    expect(rpeDelta(10, 7).label).toBe('3 puntos más liviano de lo pedido')
  })

  it('sin RPE objetivo no compara', () => {
    expect(rpeDelta(null, 8)).toEqual({ delta: null, severity: 'unknown', label: 'Sin objetivo' })
  })

  it('sin RPE percibido no compara', () => {
    expect(rpeDelta(8, null)).toEqual({ delta: null, severity: 'unknown', label: 'Sin registrar' })
  })

  it('un objetivo promediado con decimales no rompe la comparacion', () => {
    // dayTargetRpe devuelve decimales, asi que rpeDelta los tiene que aguantar.
    const result = rpeDelta(7.3, 10)
    expect(result.severity).toBe('heavy')
    expect(result.delta).toBe(2.7)
  })

  it('la tolerancia es inclusiva: exactamente 1 punto sigue siendo ok', () => {
    expect(rpeDelta(8, 9).severity).toBe('ok')
    expect(rpeDelta(8, 9.1).severity).toBe('heavy')
  })
})

describe('summarizeRpe', () => {
  it('promedia solo los dias comparables', () => {
    const summary = summarizeRpe([
      { targetRpe: 8, perceivedRpe: 9 },
      { targetRpe: 8, perceivedRpe: 10 },
      { targetRpe: null, perceivedRpe: 7 },
      { targetRpe: 8, perceivedRpe: null },
    ])
    expect(summary.comparable).toBe(2)
    expect(summary.averageDelta).toBe(1.5)
  })

  it('cuenta cuantos se fueron para arriba y para abajo', () => {
    const summary = summarizeRpe([
      { targetRpe: 7, perceivedRpe: 9 },
      { targetRpe: 7, perceivedRpe: 10 },
      { targetRpe: 9, perceivedRpe: 7 },
      { targetRpe: 8, perceivedRpe: 8 },
    ])
    expect(summary.heavy).toBe(2)
    expect(summary.light).toBe(1)
    expect(summary.ok).toBe(1)
  })

  it('sin pares comparables devuelve averageDelta null', () => {
    expect(summarizeRpe([{ targetRpe: null, perceivedRpe: null }]).averageDelta).toBeNull()
  })

  it('con lista vacia no rompe', () => {
    expect(summarizeRpe([])).toEqual({
      comparable: 0,
      averageDelta: null,
      ok: 0,
      heavy: 0,
      light: 0,
    })
  })
})
