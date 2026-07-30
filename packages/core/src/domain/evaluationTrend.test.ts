import { describe, expect, it } from 'vitest'
import { evaluationTrend, nextOneRmFrom, type Evaluation } from './evaluationTrend'

const ev = (kg: number, testedOn: string): Evaluation => ({ kg, testedOn })

describe('evaluationTrend', () => {
  it('sin evaluaciones no hay nada que comparar', () => {
    expect(evaluationTrend([])).toEqual({
      latest: null,
      previous: null,
      deltaKg: null,
      direction: 'none',
    })
  })

  it('con una sola no hay contra qué comparar', () => {
    const trend = evaluationTrend([ev(70, '2026-07-12')])
    expect(trend.latest).toEqual(ev(70, '2026-07-12'))
    expect(trend.previous).toBeNull()
    expect(trend.deltaKg).toBeNull()
    expect(trend.direction).toBe('first')
  })

  it('subió', () => {
    const trend = evaluationTrend([ev(132, '2026-06-01'), ev(140, '2026-07-12')])
    expect(trend.latest!.kg).toBe(140)
    expect(trend.previous!.kg).toBe(132)
    expect(trend.deltaKg).toBe(8)
    expect(trend.direction).toBe('up')
  })

  it('bajó — y el delta es negativo, no absoluto', () => {
    const trend = evaluationTrend([ev(160, '2026-06-01'), ev(155, '2026-07-12')])
    expect(trend.deltaKg).toBe(-5)
    expect(trend.direction).toBe('down')
  })

  it('igual', () => {
    const trend = evaluationTrend([ev(100, '2026-06-01'), ev(100, '2026-07-12')])
    expect(trend.deltaKg).toBe(0)
    expect(trend.direction).toBe('flat')
  })

  it('ordena por fecha, no confía en el orden que le llega', () => {
    // CLAUDE.md §3: el orden nunca sale del orden en que vuelven las filas.
    const trend = evaluationTrend([ev(140, '2026-07-12'), ev(120, '2026-05-01'), ev(132, '2026-06-01')])
    expect(trend.latest!.kg).toBe(140)
    expect(trend.previous!.kg).toBe(132)
  })

  it('no arrastra ruido de punto flotante', () => {
    // 102.5 - 100.2 en float da 2.3000000000000114.
    expect(evaluationTrend([ev(100.2, '2026-06-01'), ev(102.5, '2026-07-01')]).deltaKg).toBe(2.3)
  })

  it('con dos el mismo día, el último del array gana el desempate', () => {
    // Espeja el desempate del trigger 0018, que usa created_at.
    const trend = evaluationTrend([ev(150, '2026-07-12'), ev(152, '2026-07-12')])
    expect(trend.latest!.kg).toBe(152)
    expect(trend.previous!.kg).toBe(150)
  })
})

describe('nextOneRmFrom', () => {
  /**
   * Es la regla del trigger 0018 expresada como función pura. El trigger es la
   * garantía; esto es la especificación testeable, y en particular lo que permite
   * verificar en milisegundos que un test VIEJO no pisa el 1RM vigente.
   */
  it('sin evaluaciones no hay 1RM', () => {
    expect(nextOneRmFrom([])).toBeNull()
  })

  it('es el kg de la evaluación más reciente', () => {
    expect(nextOneRmFrom([ev(132, '2026-06-01'), ev(140, '2026-07-12')])).toBe(140)
  })

  it('un test más bajo BAJA el 1RM — es el vigente, no el récord', () => {
    expect(nextOneRmFrom([ev(160, '2026-06-01'), ev(155, '2026-07-12')])).toBe(155)
  })

  it('cargar un test viejo NO cambia el 1RM vigente', () => {
    const before = nextOneRmFrom([ev(132, '2026-07-15')])
    const after = nextOneRmFrom([ev(132, '2026-07-15'), ev(100, '2026-06-01')])
    expect(after).toBe(before)
    expect(after).toBe(132)
  })
})
