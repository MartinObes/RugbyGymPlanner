import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Una paleta propia de Nuxt UI necesita los ONCE tonos (50…950): usa 500/600 para
 * fondos sólidos en claro, 400 en oscuro, 50/100 para fondos suaves y 900/950
 * para el modo oscuro. Con menos, algunos estados quedan sin color y no falla
 * nada: se ve mal y recién se nota en pantalla.
 *
 * Este test es el mismo patrón que tests/icons.test.ts — lee los archivos y
 * compara dos listas que tienen que coincidir.
 */
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
// `pitch` (verde botella) entró el 2026-08-01 con la reasignación de alias de
// docs/DESIGN-SYSTEM.md §3.6. Sumarla acá le exige los 11 tonos igual que a las
// otras cuatro, y obliga a sumarla también al regex de abajo.
const PALETTES = ['clubred', 'gold', 'navy', 'clay', 'pitch']

const css = readFileSync(join(ROOT, 'app/assets/css/main.css'), 'utf8')
const appConfig = readFileSync(join(ROOT, 'app/app.config.ts'), 'utf8')
const nuxtConfig = readFileSync(join(ROOT, 'nuxt.config.ts'), 'utf8')

/**
 * Lo mismo pero SIN comentarios, para los tests que buscan la ausencia de algo.
 * `app.config.ts` documenta la configuración vieja ("antes era `warning:
 * 'clubred'`"), y un test que mire el archivo crudo lee esa cita como si fuera
 * código y falla sin que haya nada roto.
 */
const appConfigCode = appConfig.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('las paletas del club', () => {
  for (const palette of PALETTES) {
    it(`${palette} define los 11 tonos`, () => {
      const missing = SHADES.filter((shade) => !css.includes(`--color-${palette}-${shade}:`))
      expect(missing, `faltan tonos de ${palette}: ${missing.join(', ')}`).toEqual([])
    })
  }

  it('cada tono es un hex de 6 dígitos', () => {
    const declarations = [...css.matchAll(/--color-(?:clubred|gold|navy|clay|pitch)-\d+:\s*([^;]+);/g)]
    expect(declarations.length).toBe(PALETTES.length * SHADES.length)
    const bad = declarations.filter((m) => !/^#[0-9a-f]{6}$/i.test(m[1]!.trim()))
    expect(bad.map((m) => m[0]), 'hay tonos que no son un hex de 6 dígitos').toEqual([])
  })
})

describe('el mapeo de alias', () => {
  it('primary es el rojo del club, no el marino', () => {
    // Si primary fuera navy, cada CTA de la app tendría que escribir
    // color="secondary" y cualquier botón nuevo nacería del color equivocado.
    expect(appConfig).toMatch(/primary:\s*'clubred'/)
  })

  it('success es el verde botella y warning el dorado', () => {
    // Reasignados el 2026-08-01. Antes `warning` era 'clubred', el MISMO color
    // que `primary`: una advertencia salía pintada igual que un CTA. Si alguien
    // vuelve a apuntar los dos a la misma paleta, este test lo agarra.
    expect(appConfig).toMatch(/success:\s*'pitch'/)
    expect(appConfig).toMatch(/warning:\s*'gold'/)
  })

  it('ningún alias comparte paleta con primary', () => {
    // La causa raíz del hallazgo A de §3.6, escrita como invariante y no como
    // recordatorio: `primary` es clubred y nadie más puede serlo.
    const others = [...appConfigCode.matchAll(/\b(success|warning|info|secondary|error|neutral):\s*'(\w+)'/g)]
    const clashing = others.filter(([, , palette]) => palette === 'clubred').map(([, alias]) => alias)
    expect(clashing, `estos alias resuelven al mismo borgoña que primary: ${clashing.join(', ')}`).toEqual([])
  })

  it('error se queda en el rojo de Tailwind', () => {
    // Deliberado: un error tiene que leerse como error aunque el club juegue de
    // rojo. Ver docs/DESIGN-SYSTEM.md §3.3.
    expect(appConfig).toMatch(/error:\s*'red'/)
  })

  it('neutral es la escala cálida propia', () => {
    expect(appConfig).toMatch(/neutral:\s*'clay'/)
  })

  it('navy está registrado en los DOS lugares que hacen falta', () => {
    // app.config lo mapea a su paleta y nuxt.config lo declara como alias. Sin
    // las dos cosas no existe --ui-navy y color="navy" no anda.
    expect(appConfig).toMatch(/navy:\s*'navy'/)
    expect(nuxtConfig).toMatch(/colors:\s*\[[^\]]*'navy'/s)
  })

  it('ya no queda el TODO de la paleta pendiente', () => {
    expect(appConfig).not.toContain('TODO')
  })
})

describe('el modo oscuro sobrescribe las superficies', () => {
  it('hay un bloque .dark con las variables de superficie', () => {
    // Los dos modos comparten tonos del neutral (200, 300, 400, 500, 700, 900),
    // así que una sola escala no puede ser cálida en claro y marina en oscuro.
    expect(css).toContain('.dark {')
    for (const variable of ['--ui-bg', '--ui-bg-muted', '--ui-border', '--ui-text-muted']) {
      expect(css, `falta ${variable} en el bloque .dark`).toContain(`${variable}:`)
    }
  })
})

describe('la 4ª divergencia: el label del solid en oscuro', () => {
  // Nuxt UI pinta el solid con `text-inverted`, que en oscuro es texto OSCURO
  // porque asume una paleta de acento clara. clubred-400 y navy-400 no lo son:
  // sin esto el label queda en 2.31:1 y 2.59:1, abajo del 4.5:1 de WCAG AA.
  // Medido en pantalla el 2026-07-31. Ver docs/DESIGN-SYSTEM.md §3.5.
  for (const component of ['button', 'badge']) {
    it(`${component} lleva dark:text-white en primary y navy`, () => {
      const block = appConfig.slice(appConfig.indexOf(`${component}: {`))
      for (const color of ['primary', 'navy']) {
        expect(
          block,
          `falta el override de ${color} en ${component}`,
        ).toMatch(new RegExp(`color:\\s*'${color}',\\s*variant:\\s*'solid',\\s*class:\\s*'dark:text-white'`))
      }
    })
  }

  it('success, warning y error NO lo llevan: el blanco los rompería', () => {
    // pitch-400, gold-400 y red-400 con el texto oscuro que pone Nuxt UI dan
    // 6.98:1, 7.21:1 y 6.29:1. Con blanco caerían a 2.50:1, 2.41:1 y 2.77:1.
    //
    // `warning` está en esta lista desde el 2026-08-01: mientras fue 'clubred'
    // el override era correcto, y al pasar a 'gold' se volvió un fallo de AA que
    // no rompe nada visible. Este test es lo que impide que vuelva.
    for (const color of ['success', 'warning', 'error']) {
      expect(appConfigCode).not.toMatch(
        new RegExp(`color:\\s*'${color}',\\s*variant:\\s*'solid',\\s*class:\\s*'dark:text-white'`),
      )
    }
  })
})

describe('los 44 px de objetivo táctil', () => {
  // docs/DESIGN-SYSTEM.md §6. El default de Nuxt UI da 32 px porque sus tamaños
  // son padding y no alto fijo. Verificado en pantalla el 2026-07-31.
  it('el botón redefine md a 44 px', () => {
    expect(appConfig).toMatch(/button:\s*\{[\s\S]*?md:\s*\{\s*base:\s*'px-3\.5 py-3 text-sm/)
  })

  for (const component of ['input', 'select', 'textarea', 'inputNumber']) {
    it(`${component} redefine md a 44 px con fuente de 16 px`, () => {
      // text-base = 16 px. Abajo de 16, Safari en iOS hace zoom al enfocar y se
      // rompe el "sin zoom" de §6 aunque el alto esté bien.
      expect(appConfig).toMatch(
        new RegExp(`${component}:\\s*\\{\\s*variants:\\s*\\{\\s*size:\\s*\\{\\s*md:\\s*\\{\\s*base:\\s*'px-3 py-2\\.5 text-base`),
      )
    })
  }
})

describe('el escudo del club', () => {
  it('los dos assets están en public/', () => {
    // El nombre dice el MODO en el que se usa, no el color del arte:
    // escudo-light.png es el de fondos claros (two-tone-light).
    for (const file of ['public/escudo-light.png', 'public/escudo-dark.png']) {
      expect(existsSync(join(ROOT, file)), `falta ${file}`).toBe(true)
    }
  })

  it('el shell lo muestra en los dos modos', () => {
    const layout = readFileSync(join(ROOT, 'app/layouts/default.vue'), 'utf8')
    expect(layout).toContain('/escudo-light.png')
    expect(layout).toContain('/escudo-dark.png')
  })
})
