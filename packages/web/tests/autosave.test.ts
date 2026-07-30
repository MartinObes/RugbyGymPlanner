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
  it('la fila del ejercicio expone flush', () => {
    const source = read('app/components/player/ExerciseRow.vue')
    expect(source).toContain('useDebouncedSave')
    expect(source, 'sin defineExpose el padre no puede vaciar el pendiente').toContain(
      'defineExpose',
    )
    expect(source).toMatch(/defineExpose\(\{[^}]*flush/s)
  })

  it('quien cierra el día espera el flush antes del complete', () => {
    const source = read('app/components/player/DayCard.vue')
    const complete = source.indexOf('/complete')
    expect(complete, 'no se encontró la llamada a /complete').toBeGreaterThan(0)
    const before = source.slice(0, complete)
    expect(before, 'el flush tiene que ir ANTES del POST de complete').toMatch(/await[\s\S]*flush/)
  })
})
