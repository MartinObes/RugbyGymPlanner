import { describe, expect, it } from 'vitest'
import { weekProgress } from './weekProgress'

describe('weekProgress', () => {
  it('cuenta los días completados sobre el total', () => {
    expect(weekProgress(['a', 'b'], 3)).toEqual({ completed: 2, total: 3, ratio: 2 / 3 })
  })

  it('la semana sin empezar', () => {
    expect(weekProgress([], 3)).toEqual({ completed: 0, total: 3, ratio: 0 })
  })

  it('la semana entera', () => {
    expect(weekProgress(['a', 'b', 'c'], 3)).toEqual({ completed: 3, total: 3, ratio: 1 })
  })

  it('sin días no divide por cero', () => {
    // Pasa de verdad: un programa recién creado, sin días todavía.
    expect(weekProgress([], 0)).toEqual({ completed: 0, total: 0, ratio: 0 })
  })

  it('no cuenta dos veces el mismo día', () => {
    expect(weekProgress(['a', 'a', 'b'], 3).completed).toBe(2)
  })

  it('nunca pasa de 1 aunque lleguen más completados que días', () => {
    // Defensivo: un día borrado del programa cuyo session_log quedó vivo.
    expect(weekProgress(['a', 'b', 'c', 'd'], 3)).toEqual({ completed: 3, total: 3, ratio: 1 })
  })
})
