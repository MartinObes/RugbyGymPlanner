import { systemGroupForPosition } from './positions'

/** Un destino de assignment: exactamente uno de los tres viene definido. */
export type AssignmentTarget = {
  playerId?: string | null
  systemGroupId?: string | null
  positionGroupId?: string | null
}

export type ReachablePlayer = {
  id: string
  positionId: string | null
  /** Ids de los grupos custom que contienen su puesto. */
  customGroupIds: readonly string[]
}

/**
 * Si un assignment le aplica a un jugador.
 *
 * Es la regla del reset de F4-B §2.3: al crear un assignment se limpia la
 * elección de rutina de todos los jugadores que ese assignment alcanza —
 * incluida una dirigida a un grupo, que resetea a todos sus integrantes. Es lo
 * que hace que la prescripción del coach siempre gane sobre la elección del
 * jugador.
 *
 * La migración 0019 la implementa además en SQL, dentro del trigger
 * reset_selected_program(). Es el mismo patrón de CLAUDE.md §5: el dominio se
 * testea en milisegundos, la base da la garantía.
 */
export function assignmentReaches(target: AssignmentTarget, player: ReachablePlayer): boolean {
  if (target.playerId) return target.playerId === player.id
  if (target.systemGroupId) {
    return systemGroupForPosition(player.positionId)?.id === target.systemGroupId
  }
  if (target.positionGroupId) return player.customGroupIds.includes(target.positionGroupId)

  // Sin destino no alcanza a nadie. El CHECK garantiza que no pasa, pero
  // devolver true por descarte sería resetear la elección de todo el plantel.
  return false
}
