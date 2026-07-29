import { describe, expect, it } from 'vitest'
import { byOrderIndex, nextOrderIndex, reindex, sortByOrderIndex } from './tree'

const rows = [
  { id: 'b', order_index: 2, name: 'segundo' },
  { id: 'a', order_index: 1, name: 'primero' },
  { id: 'c', order_index: 3, name: 'tercero' },
]

describe('sortByOrderIndex', () => {
  it('ordena por order_index, no por el orden de llegada', () => {
    expect(sortByOrderIndex(rows).map((r) => r.name)).toEqual(['primero', 'segundo', 'tercero'])
  })

  it('no muta el array de entrada', () => {
    const input = [...rows]
    sortByOrderIndex(input)
    expect(input.map((r) => r.id)).toEqual(['b', 'a', 'c'])
  })

  it('con array vacío devuelve array vacío', () => {
    expect(sortByOrderIndex([])).toEqual([])
  })

  it('desempata por id para ser determinístico', () => {
    const tie = [
      { id: 'z', order_index: 1 },
      { id: 'a', order_index: 1 },
    ]
    expect(sortByOrderIndex(tie).map((r) => r.id)).toEqual(['a', 'z'])
  })

  it('tolera null en order_index poniéndolo al final', () => {
    const withNull = [
      { id: 'x', order_index: null },
      { id: 'y', order_index: 0 },
    ]
    expect(sortByOrderIndex(withNull).map((r) => r.id)).toEqual(['y', 'x'])
  })
})

describe('byOrderIndex', () => {
  it('sirve como comparador de Array.prototype.sort', () => {
    expect([...rows].sort(byOrderIndex).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('nextOrderIndex', () => {
  it('devuelve el máximo más uno', () => {
    expect(nextOrderIndex(rows)).toBe(4)
  })

  it('devuelve 0 con array vacío', () => {
    expect(nextOrderIndex([])).toBe(0)
  })

  it('no se rompe con un hueco en la secuencia', () => {
    expect(nextOrderIndex([{ order_index: 0 }, { order_index: 7 }])).toBe(8)
  })

  it('ignora nulls', () => {
    expect(nextOrderIndex([{ order_index: null }, { order_index: 2 }])).toBe(3)
  })
})

describe('reindex', () => {
  it('renumera 0..n-1 respetando el orden actual', () => {
    expect(reindex(rows)).toEqual([
      { id: 'b', order_index: 0 },
      { id: 'a', order_index: 1 },
      { id: 'c', order_index: 2 },
    ])
  })

  it('con array vacío devuelve array vacío', () => {
    expect(reindex([])).toEqual([])
  })

  it('sirve para mover un elemento: recibe el orden deseado y lo renumera', () => {
    const moved = [{ id: 'c' }, { id: 'a' }, { id: 'b' }]
    expect(reindex(moved)).toEqual([
      { id: 'c', order_index: 0 },
      { id: 'a', order_index: 1 },
      { id: 'b', order_index: 2 },
    ])
  })
})
