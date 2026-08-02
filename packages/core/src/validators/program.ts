import { z } from 'zod'

const name = (max: number) => z.string().trim().min(1, 'Poné un nombre').max(max)

export const programSchema = z.object({ name: name(120) })
export const weekSchema = z.object({ name: name(60) })
export const daySchema = z.object({ name: name(60) })

export type ProgramInput = z.infer<typeof programSchema>
export type WeekInput = z.infer<typeof weekSchema>
export type DayInput = z.infer<typeof daySchema>

/** Coherencia de la forma del bloque. Espejo del CHECK blocks_type_shape (0008). */
export const blockSchema = z
  .object({
    type: z.enum(['SINGLE', 'CIRCUIT']),
    rounds: z.number().int().min(1).max(20).nullish(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'CIRCUIT' && data.rounds == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rounds'],
        message: 'Un circuito necesita cantidad de vueltas',
      })
    }
    if (data.type === 'SINGLE' && data.rounds != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rounds'],
        message: 'Las vueltas son solo para circuitos',
      })
    }
  })

export type BlockInput = z.infer<typeof blockSchema>

/**
 * Coherencia de LoadType. Espejo del CHECK block_exercises_load_shape (0001).
 * Zod da el mensaje lindo, la base da la garantía (CLAUDE.md §5).
 */
export const blockExerciseSchema = z
  .object({
    exerciseId: z.string().uuid('Elegí un ejercicio'),
    sets: z.number().int().min(1, 'Mínimo 1 serie').max(20),
    reps: z.string().trim().min(1, 'Poné las repeticiones').max(20),
    loadType: z.enum(['WEIGHT', 'PERCENTAGE', 'NONE', 'LABEL']),
    weight: z.number().positive('El peso tiene que ser mayor a 0').max(500).nullish(),
    percentage: z.number().int().min(1).max(100).nullish(),
    /** Carga que no es un número: "p.corp", "barra", "m.band", "60 . 120". */
    loadLabel: z.string().trim().min(1, 'Poné la etiqueta').max(24).nullish(),
    targetRpe: z.number().min(1).max(10).nullish(),
  })
  .superRefine((data, ctx) => {
    const custom = z.ZodIssueCode.custom

    // Espejo del CHECK block_exercises_load_shape (0013). Los mensajes son los
    // que ve el coach en el editor, así que van redactados, no genéricos.
    const RULES = {
      WEIGHT: { needs: 'weight', message: 'Poné los kg' },
      PERCENTAGE: { needs: 'percentage', message: 'Poné el porcentaje' },
      LABEL: { needs: 'loadLabel', message: 'Poné con qué se hace (ej. peso corporal)' },
      NONE: { needs: null, message: '' },
    } as const

    const FORBIDDEN_MESSAGE = {
      weight: 'Este modo no lleva kg',
      percentage: 'Este modo no lleva porcentaje',
      loadLabel: 'Este modo no lleva etiqueta',
    } as const

    const rule = RULES[data.loadType]

    for (const field of ['weight', 'percentage', 'loadLabel'] as const) {
      const value = data[field]
      if (field === rule.needs && value == null) {
        ctx.addIssue({ code: custom, path: [field], message: rule.message })
      }
      if (field !== rule.needs && value != null) {
        ctx.addIssue({ code: custom, path: [field], message: FORBIDDEN_MESSAGE[field] })
      }
    }
  })

export type BlockExerciseInput = z.infer<typeof blockExerciseSchema>

/**
 * Espejo del CHECK program_assignments_one_target (0019).
 *
 * Tres destinos desde F4-B §2.2, no cuatro: el puesto salió como destino porque
 * un grupo custom de una sola posición hace exactamente lo mismo y ya existía.
 * El puesto del jugador sigue viviendo en profiles.position_id — es lo que
 * decide su grupo system y qué grupos custom lo contienen.
 *
 * `priority` también se fue (F4-B §2.1): gana la última asignada, así que no hay
 * matriz que dar vuelta. Zod descarta las claves desconocidas, así que un
 * cliente viejo que todavía mande `priority` o `positionId` no rompe: el campo
 * se cae solo y el refine lo agarra si era el único destino.
 */
export const assignmentSchema = z
  .object({
    playerId: z.string().uuid().nullish(),
    systemGroupId: z.enum(['forwards', 'backs']).nullish(),
    positionGroupId: z.string().uuid().nullish(),
  })
  .superRefine((data, ctx) => {
    const targets = [data.playerId, data.systemGroupId, data.positionGroupId].filter(
      (t) => t != null,
    )
    if (targets.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['playerId'],
        message: 'Elegí exactamente un destino: jugador, grupo del sistema o grupo custom',
      })
    }
  })

export type AssignmentInput = z.infer<typeof assignmentSchema>

/**
 * Reordenar hermanos: lo que produce `reindex` de domain/tree.
 *
 * `max(50)` porque la ruta hace un round-trip por ítem: sin cota, un body de
 * 10.000 entradas son 10.000 queries en un request.
 */
export const reorderSchema = z.object({
  items: z
    .array(z.object({ id: z.string().uuid(), order_index: z.number().int().min(0) }))
    .min(1)
    .max(50),
})

export type ReorderInput = z.infer<typeof reorderSchema>
