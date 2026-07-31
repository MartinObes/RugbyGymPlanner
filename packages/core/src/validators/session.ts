import { z } from 'zod'

/**
 * Lo que el jugador registra de un ejercicio.
 *
 * Espeja los CHECK de `exercise_entries` (migración 0001), que es la regla de
 * CLAUDE.md §5: Zod da el mensaje lindo, la base da la garantía.
 *
 *   weight numeric(5,1) check (weight >= 0)
 *   reps   smallint     check (reps >= 0)
 *   rpe    numeric(3,1) check (rpe between 1 and 10)
 *
 * Los tres son nullish y los TRES EN NULL ES VÁLIDO: significa "borrá la fila".
 * El tope de 500 kg es más estricto que la columna a propósito — arriba de eso
 * es un error de tipeo, no un levantamiento.
 */
export const exerciseEntrySchema = z.object({
  weight: z.number().min(0, 'No puede ser negativo').max(500, 'Revisá el peso').nullish(),
  reps: z.number().int('Tienen que ser reps enteras').min(0).max(999).nullish(),
  rpe: z.number().min(1, 'El RPE va de 1 a 10').max(10, 'El RPE va de 1 a 10').nullish(),
})

export type ExerciseEntryInput = z.infer<typeof exerciseEntrySchema>

/** La nota del día: "¿Cómo te fue hoy?". */
export const dayNoteSchema = z.object({
  note: z.string().trim().max(1000, 'Quedó muy larga').nullish(),
})

export type DayNoteInput = z.infer<typeof dayNoteSchema>

/**
 * Lo que se manda al cerrar el día: la nota y el RPE percibido.
 *
 * El RPE pasó de una vez por ejercicio a una vez por día (spec de F3.5 §2.1):
 * doce preguntas por sesión garantizan que nadie las conteste, una sola es un
 * toque. Los dos campos son opcionales y NO bloquean el cierre — si fueran
 * obligatorios volvería a ser la encuesta que se vino a sacar.
 *
 * Espeja el CHECK de session_logs.perceived_rpe (migración 0017): numeric(3,1)
 * entre 1 y 10, igual que exercise_entries.rpe.
 */
export const completeDaySchema = dayNoteSchema.extend({
  perceivedRpe: z
    .number()
    .min(1, 'El RPE va de 1 a 10')
    .max(10, 'El RPE va de 1 a 10')
    .nullish(),
})

export type CompleteDayInput = z.infer<typeof completeDaySchema>
