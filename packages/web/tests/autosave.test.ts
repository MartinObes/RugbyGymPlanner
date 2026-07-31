import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * El autosave tiene 800 ms de debounce. Si el jugador escribe y cierra el día
 * antes de que venza, el PUT llega a un día ya cerrado: la ruta responde 409, el
 * jugador ve un error en rojo DESPUÉS de haber completado, y esa serie no se
 * guardó.
 *
 * `useDebouncedSave` expone `flush()` justo para eso y durante toda F3 nadie la
 * llamó. Este test fija el cableado: quien cierra el día tiene que vaciar los
 * guardados pendientes antes.
 *
 * Lee el archivo en vez de montar el componente porque packages/web no tiene
 * jsdom ni @vue/test-utils — igual que tests/icons.test.ts.
 */
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const read = (relative: string) => readFileSync(join(ROOT, relative), 'utf8')

describe('el cierre del día vacía el autosave pendiente', () => {
  it('el control de registro expone flush', () => {
    const source = read('app/components/player/LogSlideover.vue')
    expect(source).toContain('useDebouncedSave')
    expect(source).toMatch(/defineExpose\(\{[^}]*flush/s)
  })

  it('la cadena de flush llega desde la fila hasta el bloque', () => {
    // La página junta los bloques, el bloque sus filas, y la fila su slideover.
    // Si un eslabón no reexpone flush, el vaciado no llega y el 409 vuelve.
    expect(read('app/components/player/ExerciseLine.vue')).toMatch(/defineExpose\([\s\S]*flush/)
    expect(read('app/components/player/BlockSection.vue')).toMatch(/defineExpose\([\s\S]*flush/)
  })

  it('la página del día espera el flush antes del complete', () => {
    const source = read('app/pages/player/week/[dayId].vue')
    const complete = source.indexOf('/complete')
    expect(complete, 'no se encontró la llamada a /complete').toBeGreaterThan(0)
    expect(source.slice(0, complete), 'el flush tiene que ir ANTES del POST').toMatch(
      /await[\s\S]*flush/,
    )
  })
})
