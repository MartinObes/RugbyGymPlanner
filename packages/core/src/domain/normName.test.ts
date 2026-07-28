import { describe, expect, it } from 'vitest'
import { normName } from './normName'

describe('normName', () => {
  it('pasa a minúsculas', () => {
    expect(normName('Press Banca')).toBe('press banca')
  })

  it('saca acentos y diéresis', () => {
    expect(normName('Sentadilla Búlgara')).toBe('sentadilla bulgara')
    expect(normName('Elevación de Piernas')).toBe('elevacion de piernas')
  })

  it('colapsa espacios y recorta bordes', () => {
    expect(normName('  Peso   Muerto  ')).toBe('peso muerto')
    expect(normName('Press\tMilitar')).toBe('press militar')
  })

  it('conserva la ñ como carácter propio', () => {
    expect(normName('Año')).toBe('año')
  })

  it('devuelve string vacío para entrada vacía', () => {
    expect(normName('')).toBe('')
    expect(normName('   ')).toBe('')
  })
})
