import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * docs/DESIGN-SYSTEM.md §2: la app tutea siempre ("vos"), nunca "tú"/"usted", y evita
 * el tono motivacional (nada de arrancar una frase con "¡"). Este es un grep barato
 * sobre los archivos que tocaron las dos series de F4 (confirmaciones destructivas y
 * estados de error de red) — NO analiza gramática ni confirma que el resto del texto
 * efectivamente tutee, solo que no se coló un "tú "/"usted"/"¡" literal.
 *
 * El regex se probó primero contra TODO app/ (no solo estos 12 archivos): cero
 * matches hoy, así que no es ruidoso. Ojo con "tú" vs "tu": el posesivo "tu conexión"
 * es correcto en vos y aparece seguido en estos mismos archivos — por eso el chequeo
 * exige la tilde (\btú\b), nunca "tu" a secas.
 */

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const FILES = [
  'app/pages/coach/programs/[programId]/index.vue',
  'app/components/program/DayColumn.vue',
  'app/components/program/BlockCard.vue',
  'app/components/program/ExerciseRow.vue',
  'app/pages/coach/groups.vue',
  'app/pages/coach/players/[playerId].vue',
  'app/pages/coach/programs/[programId]/assign.vue',
  'app/pages/coach/players/index.vue',
  'app/pages/coach/programs/index.vue',
  'app/pages/player/index.vue',
  'app/pages/player/week/index.vue',
  'app/pages/player/week/[dayId].vue',
]

describe('el tono se mantiene en español rioplatense (vos, sin "¡")', () => {
  for (const file of FILES) {
    it(`${file} no usa "tú"/"usted" ni arranca con "¡"`, () => {
      const source = readFileSync(join(ROOT, file), 'utf8')
      const hits = source.match(/\btú\b|\busted\b|¡/gi) ?? []
      expect(hits, `encontrado en ${file}: ${hits.join(', ')}`).toEqual([])
    })
  }
})
