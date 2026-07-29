import { z } from 'zod'

/**
 * Contrato del import: es schema Zod y tipo a la vez.
 *
 * El cliente parsea (SheetJS corre en el browser, CLAUDE.md §2) y manda el
 * resultado, pero **el server no confía**: revalida con parsedProgramSchema
 * antes de escribir nada.
 */

export const parsedExerciseSchema = z.object({
  exerciseName: z.string().trim().min(2).max(120),
  sets: z.number().int().min(1).max(20),
  reps: z.string().trim().min(1).max(20),
  loadType: z.enum(['WEIGHT', 'PERCENTAGE', 'NONE']),
  weight: z.number().positive().max(500).nullable(),
  percentage: z.number().int().min(1).max(100).nullable(),
  targetRpe: z.number().min(1).max(10).nullable(),
})

export const parsedBlockSchema = z.object({
  type: z.enum(['SINGLE', 'CIRCUIT']),
  rounds: z.number().int().min(1).max(20).nullable(),
  exercises: z.array(parsedExerciseSchema),
})

export const parsedDaySchema = z.object({
  name: z.string().trim().min(1).max(60),
  blocks: z.array(parsedBlockSchema),
})

export const parsedWeekSchema = z.object({
  name: z.string().trim().min(1).max(60),
  days: z.array(parsedDaySchema),
})

export const parseIssueSchema = z.object({
  row: z.number().int().min(1),
  message: z.string(),
})

export const parsedProgramSchema = z.object({
  weeks: z.array(parsedWeekSchema),
  /** Filas que no se pudieron interpretar. El import se aplica igual, salteándolas. */
  issues: z.array(parseIssueSchema),
})

export type ParsedExercise = z.infer<typeof parsedExerciseSchema>
export type ParsedBlock = z.infer<typeof parsedBlockSchema>
export type ParsedDay = z.infer<typeof parsedDaySchema>
export type ParsedWeek = z.infer<typeof parsedWeekSchema>
export type ParseIssue = z.infer<typeof parseIssueSchema>
export type ParsedProgram = z.infer<typeof parsedProgramSchema>
