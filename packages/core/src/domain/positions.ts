export type PositionType = 'FORWARD' | 'BACK'

export type Position = {
  id: string
  name: string
  type: PositionType
  order: number
}

/** Las 8 de rugby. Fijas por decisión de CLAUDE.md §2 — no viven en la base. */
export const POSITIONS = [
  { id: 'primera-linea', name: 'Primera Línea', type: 'FORWARD', order: 1 },
  { id: 'segunda-linea', name: 'Segunda Línea', type: 'FORWARD', order: 2 },
  { id: 'tercera-linea', name: 'Tercera Línea', type: 'FORWARD', order: 3 },
  { id: 'medio-scrum', name: 'Medio Scrum', type: 'FORWARD', order: 4 },
  { id: 'apertura', name: 'Apertura', type: 'BACK', order: 5 },
  { id: 'centro', name: 'Centro', type: 'BACK', order: 6 },
  { id: 'wing', name: 'Wing', type: 'BACK', order: 7 },
  { id: 'fullback', name: 'Fullback', type: 'BACK', order: 8 },
] as const satisfies readonly Position[]

export type PositionId = (typeof POSITIONS)[number]['id']

export type SystemGroup = {
  id: 'forwards' | 'backs'
  name: string
  positionIds: readonly PositionId[]
}

export const SYSTEM_GROUPS: readonly SystemGroup[] = [
  {
    id: 'forwards',
    name: 'Forwards',
    positionIds: POSITIONS.filter((p) => p.type === 'FORWARD').map((p) => p.id),
  },
  {
    id: 'backs',
    name: 'Backs',
    positionIds: POSITIONS.filter((p) => p.type === 'BACK').map((p) => p.id),
  },
]

export function positionById(id: string): Position | undefined {
  return POSITIONS.find((p) => p.id === id)
}

export function isPositionId(id: string): id is PositionId {
  return POSITIONS.some((p) => p.id === id)
}

/** El grupo system al que pertenece una posición. Alimenta el nivel 30 de resolveProgram. */
export function systemGroupForPosition(positionId: string | null): SystemGroup | null {
  if (!positionId) return null
  return SYSTEM_GROUPS.find((g) => g.positionIds.includes(positionId as PositionId)) ?? null
}
