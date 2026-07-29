import { z } from 'zod'

/**
 * Contrato del import: es schema Zod y tipo a la vez.
 *
 * El cliente parsea (SheetJS corre en el browser, CLAUDE.md §2) y manda el
 * resultado, pero **el server no confía**: revalida con parsedProgramSchema
 * antes de escribir nada.
 */

/**
 * Los `superRefine` de acá espejan los CHECK de la base igual que los de
 * `program.ts` (CLAUDE.md §5). Sin ellos, un payload con `CIRCUIT` sin vueltas o
 * `WEIGHT` sin kg pasaba la validación y **explotaba recién en el insert** — con
 * el árbol del programa ya borrado. Lo encontró la auditoría de F2.
 */
export const parsedExerciseSchema = z
  .object({
    exerciseName: z.string().trim().min(2).max(120),
    sets: z.number().int().min(1).max(20),
    reps: z.string().trim().min(1).max(20),
    loadType: z.enum(['WEIGHT', 'PERCENTAGE', 'NONE']),
    weight: z.number().positive().max(500).nullable(),
    percentage: z.number().int().min(1).max(100).nullable(),
    targetRpe: z.number().min(1).max(10).nullable(),
  })
  .superRefine((data, ctx) => {
    const custom = z.ZodIssueCode.custom
    const needs = (field: 'weight' | 'percentage', value: number | null) => {
      if (value == null) ctx.addIssue({ code: custom, path: [field], message: `Falta ${field}` })
    }
    const forbids = (field: 'weight' | 'percentage', value: number | null) => {
      if (value != null) ctx.addIssue({ code: custom, path: [field], message: `No lleva ${field}` })
    }

    if (data.loadType === 'WEIGHT') {
      needs('weight', data.weight)
      forbids('percentage', data.percentage)
    }
    if (data.loadType === 'PERCENTAGE') {
      needs('percentage', data.percentage)
      forbids('weight', data.weight)
    }
    if (data.loadType === 'NONE') {
      forbids('weight', data.weight)
      forbids('percentage', data.percentage)
    }
  })

export const parsedBlockSchema = z
  .object({
    type: z.enum(['SINGLE', 'CIRCUIT']),
    rounds: z.number().int().min(1).max(20).nullable(),
    exercises: z.array(parsedExerciseSchema).max(40),
  })
  .superRefine((data, ctx) => {
    // Espejo del CHECK blocks_type_shape (0008).
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

export const parsedDaySchema = z.object({
  name: z.string().trim().min(1).max(60),
  blocks: z.array(parsedBlockSchema).max(30),
})

export const parsedWeekSchema = z.object({
  name: z.string().trim().min(1).max(60),
  days: z.array(parsedDaySchema).max(14),
})

export const parseIssueSchema = z.object({
  row: z.number().int().min(1),
  message: z.string(),
})

/**
 * Salida de un parser. Puede tener CERO semanas: es el resultado legítimo de una
 * entrada que no se entendió, y la pantalla lo muestra con sus issues.
 *
 * Los topes acotan el trabajo del import, que hace un round-trip por semana, día
 * y bloque: sin cota, un payload grande agota el límite de 10 s de Vercel Hobby a
 * mitad de la escritura.
 */
export const parsedProgramSchema = z.object({
  weeks: z.array(parsedWeekSchema).max(52),
  /** Filas que no se pudieron interpretar. El import se aplica igual, salteándolas. */
  issues: z.array(parseIssueSchema).max(2000),
})

/**
 * Lo que acepta la ruta de import. Es lo mismo pero con al menos una semana: un
 * `weeks: []` borraría el programa entero y devolvería `ok`, que no es una
 * operación que nadie quiera pedir por accidente.
 */
export const importRequestSchema = parsedProgramSchema.extend({
  weeks: z.array(parsedWeekSchema).min(1, 'El import no trajo ninguna semana').max(52),
})

export type ParsedExercise = z.infer<typeof parsedExerciseSchema>
export type ParsedBlock = z.infer<typeof parsedBlockSchema>
export type ParsedDay = z.infer<typeof parsedDaySchema>
export type ParsedWeek = z.infer<typeof parsedWeekSchema>
export type ParseIssue = z.infer<typeof parseIssueSchema>
export type ParsedProgram = z.infer<typeof parsedProgramSchema>
export type ImportRequest = z.infer<typeof importRequestSchema>
