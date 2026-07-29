import { z } from 'zod'
import { isPositionId } from '../domain/positions'

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
    loadType: z.enum(['WEIGHT', 'PERCENTAGE', 'NONE']),
    weight: z.number().positive('El peso tiene que ser mayor a 0').max(500).nullish(),
    percentage: z.number().int().min(1).max(100).nullish(),
    targetRpe: z.number().min(1).max(10).nullish(),
  })
  .superRefine((data, ctx) => {
    const custom = z.ZodIssueCode.custom

    if (data.loadType === 'WEIGHT') {
      if (data.weight == null) ctx.addIssue({ code: custom, path: ['weight'], message: 'Poné los kg' })
      if (data.percentage != null) {
        ctx.addIssue({ code: custom, path: ['percentage'], message: 'No lleva porcentaje' })
      }
    }

    if (data.loadType === 'PERCENTAGE') {
      if (data.percentage == null) {
        ctx.addIssue({ code: custom, path: ['percentage'], message: 'Poné el porcentaje' })
      }
      if (data.weight != null) {
        ctx.addIssue({ code: custom, path: ['weight'], message: 'No lleva kg fijos' })
      }
    }

    if (data.loadType === 'NONE') {
      if (data.weight != null) {
        ctx.addIssue({ code: custom, path: ['weight'], message: 'Sin peso no lleva kg' })
      }
      if (data.percentage != null) {
        ctx.addIssue({ code: custom, path: ['percentage'], message: 'Sin peso no lleva porcentaje' })
      }
    }
  })

export type BlockExerciseInput = z.infer<typeof blockExerciseSchema>

/**
 * Espejo del CHECK program_assignments_one_target (0001).
 *
 * `priority` va acotada a propósito: la columna es un integer sin cota, y un
 * override de 2^31-1 daría vuelta la matriz entera de resolveProgram.
 */
export const assignmentSchema = z
  .object({
    playerId: z.string().uuid().nullish(),
    positionId: z.string().refine(isPositionId, 'Puesto inválido').nullish(),
    systemGroupId: z.enum(['forwards', 'backs']).nullish(),
    positionGroupId: z.string().uuid().nullish(),
    priority: z.number().int().min(-100).max(500).default(0),
  })
  .superRefine((data, ctx) => {
    const targets = [data.playerId, data.positionId, data.systemGroupId, data.positionGroupId].filter(
      (t) => t != null,
    )
    if (targets.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['playerId'],
        message: 'Elegí exactamente un destino: jugador, puesto, grupo del sistema o grupo custom',
      })
    }
  })

export type AssignmentInput = z.infer<typeof assignmentSchema>

/** Reordenar hermanos: lo que produce `reindex` de domain/tree. */
export const reorderSchema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), order_index: z.number().int().min(0) })).min(1),
})

export type ReorderInput = z.infer<typeof reorderSchema>
