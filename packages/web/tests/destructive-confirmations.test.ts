import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Siete acciones destructivas (borrar semana/día/bloque/ejercicio/grupo/1RM/asignación)
 * acaban de quedar detrás de un UModal de confirmación, más las dos que ya lo tenían
 * (sacar jugador del plantel, borrar programa). Antes, un solo tap borraba con
 * cascada: borrar una semana se lleva puestos sus días, bloques y ejercicios.
 *
 * OJO CON LO QUE ESTO PRUEBA Y LO QUE NO. Este archivo lee el `.vue` con
 * readFileSync, el mismo patrón que tests/theme.test.ts y tests/icons.test.ts,
 * porque el paquete no tiene @vue/test-utils ni happy-dom para montar componentes.
 * Eso significa que esto prueba que el guard está PRESENTE EN EL CÓDIGO FUENTE:
 * que el botón que dispara el borrado asigna un estado de confirmación en vez de
 * invocar la función que pega al DELETE, y que esa función solo aparece cableada
 * a un botón dentro del <UModal>. NO prueba que Nuxt UI abra el modal en pantalla,
 * ni que el click funcione en runtime, ni que el modal se vea bien. Lo que sí
 * agarra: que alguien borre el <UModal> o vuelva a cablear el botón directo a la
 * función de borrado sin querer.
 */

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const read = (relPath: string) => readFileSync(join(ROOT, relPath), 'utf8')

/** Normaliza espacios/saltos de línea para comparar el cuerpo de un @click multilínea. */
const flatten = (s: string) => s.replace(/\s+/g, ' ').trim()

describe('borrar una semana (coach/programs/[programId]/index.vue, cascada a días/bloques/ejercicios)', () => {
  const source = read('app/pages/coach/programs/[programId]/index.vue')

  it('el ícono de borrar semana abre el modal, no llama a removeWeek directo', () => {
    const match = source.match(/aria-label="Borrar semana"[\s\S]*?@click="([^"]*)"/)
    expect(match, 'no se encontró el botón de borrar semana').not.toBeNull()
    expect(flatten(match![1]!)).toBe(
      '() => { confirmingWeek = { id: week.id, name: week.name } }',
    )
  })

  it('removeWeek() solo se invoca desde el botón del UModal', () => {
    expect(source).toContain('v-model:open="confirmWeekOpen"')
    const modalIdx = source.indexOf('v-model:open="confirmWeekOpen"')
    const calls = [...source.matchAll(/@click="removeWeek"/g)]
    expect(calls.length, 'removeWeek() debería llamarse desde un solo lugar').toBe(1)
    expect(calls[0]!.index!).toBeGreaterThan(modalIdx)
  })
})

describe('borrar un día (components/program/DayColumn.vue, cascada a bloques/ejercicios)', () => {
  const source = read('app/components/program/DayColumn.vue')

  it('el ícono de basurero abre el modal, no llama a removeDay directo', () => {
    const match = source.match(/aria-label="Borrar día"[\s\S]*?@click="([^"]*)"/)
    expect(match, 'no se encontró el botón de borrar día').not.toBeNull()
    expect(flatten(match![1]!)).toBe('() => { confirmRemoveOpen = true }')
  })

  it('removeDay() solo se invoca desde el botón del UModal', () => {
    expect(source).toContain('v-model:open="confirmRemoveOpen"')
    const modalIdx = source.indexOf('v-model:open="confirmRemoveOpen"')
    const calls = [...source.matchAll(/@click="removeDay"/g)]
    expect(calls.length, 'removeDay() debería llamarse desde un solo lugar').toBe(1)
    expect(calls[0]!.index!).toBeGreaterThan(modalIdx)
  })
})

describe('borrar un bloque (components/program/BlockCard.vue, cascada a sus ejercicios)', () => {
  const source = read('app/components/program/BlockCard.vue')

  it('el ícono de basurero abre el modal, no llama a removeBlock directo', () => {
    const match = source.match(/aria-label="Borrar bloque"[\s\S]*?@click="([^"]*)"/)
    expect(match, 'no se encontró el botón de borrar bloque').not.toBeNull()
    expect(flatten(match![1]!)).toBe('() => { confirmRemoveBlockOpen = true }')
  })

  it('removeBlock() solo se invoca desde el botón del UModal', () => {
    expect(source).toContain('v-model:open="confirmRemoveBlockOpen"')
    const modalIdx = source.indexOf('v-model:open="confirmRemoveBlockOpen"')
    const calls = [...source.matchAll(/@click="removeBlock"/g)]
    expect(calls.length, 'removeBlock() debería llamarse desde un solo lugar').toBe(1)
    expect(calls[0]!.index!).toBeGreaterThan(modalIdx)
  })
})

describe('borrar un ejercicio (components/program/ExerciseRow.vue)', () => {
  const source = read('app/components/program/ExerciseRow.vue')

  it('el ícono de basurero abre el modal, no emite "remove" directo', () => {
    const match = source.match(/aria-label="Borrar ejercicio"[\s\S]*?@click="([^"]*)"/)
    expect(match, 'no se encontró el botón de borrar ejercicio').not.toBeNull()
    expect(flatten(match![1]!)).toBe('() => { confirmRemoveOpen = true }')
  })

  it('emit(\'remove\') (lo que borra de verdad, resuelto por BlockCard) solo sale del botón del UModal', () => {
    expect(source).toContain('v-model:open="confirmRemoveOpen"')
    const modalIdx = source.indexOf('title="¿Borrar este ejercicio?"')
    const calls = [...source.matchAll(/emit\('remove'\)/g)]
    expect(calls.length, "emit('remove') debería dispararse desde un solo lugar").toBe(1)
    expect(calls[0]!.index!).toBeGreaterThan(modalIdx)
  })
})

describe('borrar un grupo custom (coach/groups.vue)', () => {
  const source = read('app/pages/coach/groups.vue')

  it('el ícono de basurero abre el modal, no llama a remove() directo (y no se confunde con "Editar")', () => {
    const match = source.match(/aria-label="Borrar"[\s\S]*?@click="([^"]*)"/)
    expect(match, 'no se encontró el botón de borrar grupo').not.toBeNull()
    expect(flatten(match![1]!)).toBe(
      '() => { confirmingGroup = { id: group.id, name: group.name } }',
    )
  })

  it('remove() solo se invoca desde el botón del UModal', () => {
    expect(source).toContain('v-model:open="confirmGroupOpen"')
    const modalIdx = source.indexOf('v-model:open="confirmGroupOpen"')
    const calls = [...source.matchAll(/@click="remove"/g)]
    expect(calls.length, 'remove() debería llamarse desde un solo lugar').toBe(1)
    expect(calls[0]!.index!).toBeGreaterThan(modalIdx)
  })
})

describe('borrar un 1RM (coach/players/[playerId].vue)', () => {
  const source = read('app/pages/coach/players/[playerId].vue')

  it('el ícono de basurero abre el modal, no llama a removeRm directo', () => {
    const match = source.match(/aria-label="Borrar"[\s\S]*?@click="([^"]*)"/)
    expect(match, 'no se encontró el botón de borrar 1RM').not.toBeNull()
    expect(flatten(match![1]!)).toBe(
      '() => { confirmingRm = { exerciseId: rm.exerciseId, exerciseName: rm.exerciseName } }',
    )
  })

  it('removeRm() solo se invoca desde el botón del UModal', () => {
    expect(source).toContain('v-model:open="confirmRmOpen"')
    const modalIdx = source.indexOf('v-model:open="confirmRmOpen"')
    const calls = [...source.matchAll(/@click="removeRm"/g)]
    expect(calls.length, 'removeRm() debería llamarse desde un solo lugar').toBe(1)
    expect(calls[0]!.index!).toBeGreaterThan(modalIdx)
  })
})

describe('quitar una asignación (coach/programs/[programId]/assign.vue)', () => {
  const source = read('app/pages/coach/programs/[programId]/assign.vue')

  it('el ícono de "Quitar" abre el modal, no llama a remove() directo', () => {
    const match = source.match(/aria-label="Quitar"[\s\S]*?@click="([^"]*)"/)
    expect(match, 'no se encontró el botón de quitar asignación').not.toBeNull()
    expect(flatten(match![1]!)).toBe(
      '() => { confirmingAssignment = { id: assignment.id, targetName: assignment.targetName } }',
    )
  })

  it('remove() solo se invoca desde el botón del UModal', () => {
    expect(source).toContain('v-model:open="confirmAssignmentOpen"')
    const modalIdx = source.indexOf('v-model:open="confirmAssignmentOpen"')
    const calls = [...source.matchAll(/@click="remove"/g)]
    expect(calls.length, 'remove() debería llamarse desde un solo lugar').toBe(1)
    expect(calls[0]!.index!).toBeGreaterThan(modalIdx)
  })
})

describe('sacar un jugador del plantel (coach/players/index.vue — ya tenía confirmación)', () => {
  const source = read('app/pages/coach/players/index.vue')

  it('el ícono de "Sacar del plantel" abre el modal, no llama a release() directo', () => {
    const match = source.match(/aria-label="Sacar del plantel"[\s\S]*?@click="([^"]*)"/)
    expect(match, 'no se encontró el botón de sacar del plantel').not.toBeNull()
    expect(flatten(match![1]!)).toBe(
      '() => { confirming = { id: player.id, name: player.name } }',
    )
  })

  it('release() solo se invoca desde el botón del UModal', () => {
    expect(source).toContain('v-model:open="confirmOpen"')
    const modalIdx = source.indexOf('v-model:open="confirmOpen"')
    const calls = [...source.matchAll(/@click="release"/g)]
    expect(calls.length, 'release() debería llamarse desde un solo lugar').toBe(1)
    expect(calls[0]!.index!).toBeGreaterThan(modalIdx)
  })
})

describe('borrar un programa (coach/programs/index.vue — ya tenía confirmación)', () => {
  const source = read('app/pages/coach/programs/index.vue')

  it('el ícono de basurero abre el modal, no llama a remove() directo', () => {
    const match = source.match(/aria-label="Borrar"[\s\S]*?@click="([^"]*)"/)
    expect(match, 'no se encontró el botón de borrar programa').not.toBeNull()
    expect(flatten(match![1]!)).toBe(
      '() => { confirmingDelete = { id: program.id, name: program.name } }',
    )
  })

  it('remove() solo se invoca desde el botón del UModal', () => {
    expect(source).toContain('v-model:open="confirmOpen"')
    const modalIdx = source.indexOf('v-model:open="confirmOpen"')
    const calls = [...source.matchAll(/@click="remove"/g)]
    expect(calls.length, 'remove() debería llamarse desde un solo lugar').toBe(1)
    expect(calls[0]!.index!).toBeGreaterThan(modalIdx)
  })
})
