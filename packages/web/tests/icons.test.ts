import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Los iconos se inlinean en el bundle con una lista EXPLÍCITA en nuxt.config.ts,
 * porque el sidebar los pasa por binding dinámico (`:name="item.icon"`) y el
 * escaneo estático de Nuxt Icon no ve esos nombres.
 *
 * El riesgo es silencioso: si alguien agrega un icono a la app y se olvida de la
 * lista, no falla nada en el build ni en el typecheck — el icono simplemente NO
 * SE VE en producción, y en el log queda un "timed out after 1500ms" que nadie
 * mira. Ya pasó una vez. Este test es lo que lo convierte en un error ruidoso.
 */

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

function iconsUsedInApp(): Set<string> {
  const files = walk(join(ROOT, 'app')).filter((f) => /\.(vue|ts)$/.test(f))
  const used = new Set<string>()

  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/i-lucide-([a-z0-9-]+)/g)) {
      used.add(`lucide:${match[1]}`)
    }
  }

  return used
}

function iconsDeclaredInConfig(): Set<string> {
  const config = readFileSync(join(ROOT, 'nuxt.config.ts'), 'utf8')
  const declared = new Set<string>()

  for (const match of config.matchAll(/'lucide:([a-z0-9-]+)'/g)) {
    declared.add(`lucide:${match[1]}`)
  }

  return declared
}

describe('iconos inlineados', () => {
  it('todos los que usa la app están declarados en nuxt.config.ts', () => {
    const used = iconsUsedInApp()
    const declared = iconsDeclaredInConfig()
    const missing = [...used].filter((icon) => !declared.has(icon)).sort()

    expect(
      missing,
      `Faltan en clientBundle.icons de nuxt.config.ts: ${missing.join(', ')}. ` +
        'Sin eso el icono no se ve en producción y el build no falla.',
    ).toEqual([])
  })

  it('no hay iconos declarados que la app ya no use', () => {
    const used = iconsUsedInApp()
    const declared = iconsDeclaredInConfig()
    const unused = [...declared].filter((icon) => !used.has(icon)).sort()

    expect(unused, `Sobran en nuxt.config.ts: ${unused.join(', ')}`).toEqual([])
  })

  it('encuentra iconos de verdad (el test no pasa por vacío)', () => {
    expect(iconsUsedInApp().size).toBeGreaterThan(10)
  })
})
