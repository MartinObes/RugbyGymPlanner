import { describe, expect, it } from 'vitest'
import { calcLoad, roundToHalf } from './calcLoad'

describe('roundToHalf', () => {
  it('redondea al 0.5 más cercano', () => {
    expect(roundToHalf(112.3)).toBe(112.5)
    expect(roundToHalf(112.1)).toBe(112)
    expect(roundToHalf(112.75)).toBe(113)
    expect(roundToHalf(0)).toBe(0)
  })
})

describe('calcLoad', () => {
  const ctx = { exerciseName: 'Press Banca', oneRmKg: 140 }

  it('WEIGHT devuelve los kg fijos', () => {
    expect(calcLoad({ loadType: 'WEIGHT', weight: 80 }, ctx)).toEqual({
      kind: 'weight',
      kg: 80,
      label: '80 kg',
    })
  })

  it('PERCENTAGE calcula sobre el 1RM y redondea a 0.5', () => {
    expect(calcLoad({ loadType: 'PERCENTAGE', percentage: 80 }, ctx)).toEqual({
      kind: 'percentage',
      kg: 112,
      percentage: 80,
      label: '80% → 112 kg',
    })
  })

  it('PERCENTAGE con 1RM impar cae en el medio kilo', () => {
    // 80% de 143 = 114.4 → 114.5
    const r = calcLoad({ loadType: 'PERCENTAGE', percentage: 80 }, { ...ctx, oneRmKg: 143 })
    expect(r.kind).toBe('percentage')
    if (r.kind === 'percentage') expect(r.kg).toBe(114.5)
  })

  it('PERCENTAGE sin 1RM avisa qué falta', () => {
    expect(
      calcLoad(
        { loadType: 'PERCENTAGE', percentage: 80 },
        { exerciseName: 'Press Banca', oneRmKg: null },
      ),
    ).toEqual({
      kind: 'missing-1rm',
      percentage: 80,
      exerciseName: 'Press Banca',
      label: '80% — falta tu 1RM de Press Banca',
    })
  })

  it('NONE no lleva carga', () => {
    expect(calcLoad({ loadType: 'NONE' }, ctx)).toEqual({ kind: 'none', label: 'Sin peso' })
  })

  it('WEIGHT sin weight cae a NONE en vez de romper la vista', () => {
    expect(calcLoad({ loadType: 'WEIGHT', weight: null }, ctx).kind).toBe('none')
  })

  it('formatea kg con decimal solo cuando lo tiene', () => {
    expect(calcLoad({ loadType: 'WEIGHT', weight: 82.5 }, ctx).label).toBe('82.5 kg')
  })
})

describe('calcLoad con LABEL', () => {
  it('muestra la etiqueta tal cual', () => {
    const result = calcLoad(
      { loadType: 'LABEL', weight: null, percentage: null, loadLabel: 'p.corp' },
      { exerciseName: 'Dominadas' },
    )
    expect(result.kind).toBe('label')
    expect(result.label).toBe('p.corp')
  })

  it('no interpreta la etiqueta: "60 . 120" viaja entera', () => {
    const result = calcLoad(
      { loadType: 'LABEL', weight: null, percentage: null, loadLabel: '60 . 120' },
      { exerciseName: 'Cuadriceps 1p - 2p' },
    )
    expect(result.label).toBe('60 . 120')
  })

  it('recorta los espacios de la etiqueta', () => {
    const result = calcLoad(
      { loadType: 'LABEL', weight: null, percentage: null, loadLabel: '  barra  ' },
      { exerciseName: 'Press Banca' },
    )
    expect(result.label).toBe('barra')
  })

  // El CHECK block_exercises_load_shape (0013) lo impide, pero la función es
  // defensiva: una etiqueta ausente o vacía no puede quedar como "undefined".
  it('sin etiqueta cae a none', () => {
    const result = calcLoad(
      { loadType: 'LABEL', weight: null, percentage: null, loadLabel: null },
      { exerciseName: 'Press Banca' },
    )
    expect(result.kind).toBe('none')
    expect(result.label).toBe('Sin peso')
  })

  it('con etiqueta en blanco cae a none', () => {
    const result = calcLoad(
      { loadType: 'LABEL', weight: null, percentage: null, loadLabel: '   ' },
      { exerciseName: 'Press Banca' },
    )
    expect(result.kind).toBe('none')
  })
})
