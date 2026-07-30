import { readFileSync } from 'node:fs'
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
const PALETTES = ['clubred', 'gold', 'navy', 'clay']

const css = readFileSync(join(ROOT, 'app/assets/css/main.css'), 'utf8')
const appConfig = readFileSync(join(ROOT, 'app/app.config.ts'), 'utf8')
const nuxtConfig = readFileSync(join(ROOT, 'nuxt.config.ts'), 'utf8')

describe('las paletas del club', () => {
  for (const palette of PALETTES) {
    it(`${palette} define los 11 tonos`, () => {
      const missing = SHADES.filter((shade) => !css.includes(`--color-${palette}-${shade}:`))
      expect(missing, `faltan tonos de ${palette}: ${missing.join(', ')}`).toEqual([])
    })
  }

  it('cada tono es un hex de 6 dígitos', () => {
    const declarations = [...css.matchAll(/--color-(?:clubred|gold|navy|clay)-\d+:\s*([^;]+);/g)]
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

  it('success es dorado y warning el rojo del club', () => {
    expect(appConfig).toMatch(/success:\s*'gold'/)
    expect(appConfig).toMatch(/warning:\s*'clubred'/)
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
