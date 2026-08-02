import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Tres pantallas del jugador (dashboard, Mi semana, un día) antes mostraban su copy
 * de "vacío legítimo" cuando en realidad la request había fallado — un jugador con
 * mal wifi de gimnasio se enteraba de que "no tenía programa" en vez de que había un
 * problema de red. Ahora las tres desestructuran `error` de `useAsyncData` y pintan
 * una rama distinta con reintento.
 *
 * OJO CON LO QUE ESTO PRUEBA Y LO QUE NO. Igual que destructive-confirmations.test.ts,
 * esto lee el `.vue` con readFileSync (no hay harness de componentes en este
 * paquete). Prueba que el guard está PRESENTE EN EL CÓDIGO: que `error` se
 * desestructura, que existe una rama de error con texto de "reintentar" que NO
 * es la misma que el vacío legítimo, y que esa rama de error queda ubicada antes
 * (en el orden del template) que la rama de "no tenés nada". NO ejecuta el
 * componente ni prueba que Vue efectivamente muestre esa rama cuando `error` es
 * verdadero — eso exigiría montar el componente con datos reales de Nuxt.
 */

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const read = (relPath: string) => readFileSync(join(ROOT, relPath), 'utf8')

const DESTRUCTURE_ERROR = /const\s*\{\s*data,\s*error,\s*refresh\s*\}\s*=\s*await useAsyncData/

describe('dashboard del jugador (player/index.vue) — sin tests vs. error de red', () => {
  const source = read('app/pages/player/index.vue')

  it('desestructura error de useAsyncData', () => {
    expect(source).toMatch(DESTRUCTURE_ERROR)
  })

  it('el error queda afuera del "todavía no tenés tests": la rama de error envuelve el resto en v-else', () => {
    const errorIdx = source.indexOf('<UCard v-if="error">')
    const elseIdx = source.indexOf('<template v-else>')
    const emptyIdx = source.indexOf('Todavía no tenés tests de fuerza cargados')
    expect(errorIdx, 'no se encontró la rama v-if="error"').toBeGreaterThan(-1)
    expect(elseIdx, 'el <template v-else> debería venir después de la rama de error').toBeGreaterThan(errorIdx)
    expect(emptyIdx, 'la copy de "sin tests" debería estar dentro del v-else').toBeGreaterThan(elseIdx)
  })

  it('la rama de error ofrece reintentar y no repite la copy de "sin tests"', () => {
    const errorIdx = source.indexOf('<UCard v-if="error">')
    const elseIdx = source.indexOf('<template v-else>')
    const errorBlock = source.slice(errorIdx, elseIdx)
    expect(errorBlock).toContain('Volver a intentar')
    expect(errorBlock).toContain('refresh()')
    expect(errorBlock).not.toContain('Todavía no tenés tests de fuerza cargados')
  })
})

describe('Mi semana (player/week/index.vue) — sin programa vs. error de red', () => {
  const source = read('app/pages/player/week/index.vue')

  it('desestructura error de useAsyncData', () => {
    expect(source).toMatch(DESTRUCTURE_ERROR)
  })

  it('el error y "sin programa" son ramas hermanas excluyentes (v-if error / v-else-if sin programa)', () => {
    expect(source).toMatch(
      /<UCard v-if="error">[\s\S]*?<\/UCard>\s*<UCard v-else-if="week === null && user\?\.coachId">/,
    )
  })

  it('la rama de error ofrece reintentar y no repite la copy de "sin programa asignado"', () => {
    const errorIdx = source.indexOf('<UCard v-if="error">')
    const noProgramIdx = source.indexOf('<UCard v-else-if="week === null && user?.coachId">')
    const errorBlock = source.slice(errorIdx, noProgramIdx)
    expect(errorBlock).toContain('Volver a intentar')
    expect(errorBlock).toContain('refresh()')
    expect(errorBlock).not.toContain('Todavía no tenés un programa asignado')
  })
})

describe('un día de la semana (player/week/[dayId].vue) — día inexistente vs. error de red', () => {
  const source = read('app/pages/player/week/[dayId].vue')

  it('desestructura error de useAsyncData', () => {
    expect(source).toMatch(DESTRUCTURE_ERROR)
  })

  it('el error es una rama propia entre el día cargado y el "no encontramos" (v-else-if error / v-else)', () => {
    const dayIdx = source.indexOf('<div v-if="day"')
    const chainMatch = source.match(/<UCard v-else-if="error">[\s\S]*?<\/UCard>\s*<UCard v-else>/)
    expect(dayIdx, 'no se encontró la rama v-if="day"').toBeGreaterThan(-1)
    expect(chainMatch, 'no se encontró la cadena v-else-if="error" / v-else').not.toBeNull()
    expect(chainMatch!.index!).toBeGreaterThan(dayIdx)
  })

  it('la rama de error ofrece reintentar y no repite la copy de "no encontramos ese día"', () => {
    const errorIdx = source.indexOf('<UCard v-else-if="error">')
    const notFoundIdx = source.indexOf('<UCard v-else>')
    const errorBlock = source.slice(errorIdx, notFoundIdx)
    expect(errorBlock).toContain('Volver a intentar')
    expect(errorBlock).toContain('refresh()')
    expect(errorBlock).not.toContain('No encontramos ese día en tu semana')
  })
})
