import { z } from 'zod'

/**
 * Una evaluación de fuerza: el test de un ejercicio en una fecha.
 *
 * La cargan el jugador y su coach por rutas distintas —el coach convoca a una
 * instancia de testeo y así va más rápido— y `evaluations_write` (migración 0003)
 * ya permite las dos puntas sin ningún cambio de RLS.
 *
 * Espeja los CHECK de la tabla (CLAUDE.md §5: Zod da el mensaje lindo, la base da
 * la garantía):
 *
 *   kg        numeric(5,1) not null check (kg > 0)
 *   tested_on date         not null default current_date
 *
 * El tope de 500 kg es más estricto que la columna a propósito, igual que en
 * exerciseEntrySchema: arriba de eso es un error de tipeo, no un levantamiento.
 */
export const evaluationSchema = z.object({
  // El id y no el nombre: ensure_exercise rechaza a PLAYER a propósito
  // (migraciones 0012/0014), así que el jugador elige del catálogo.
  exerciseId: z.string().uuid('Elegí un ejercicio'),
  kg: z.number().positive('Tiene que ser mayor a 0').max(500, 'Revisá el peso'),
  /**
   * Opcional: sin fecha, la base pone `current_date`. Se acepta una fecha pasada
   * porque se cargan tests de una instancia anterior, pero no una futura.
   *
   * La comparación es contra la fecha UTC. Uruguay es UTC-3, o sea que la fecha
   * UTC nunca va ATRÁS de la local: el "hoy" del jugador nunca se rechaza por
   * futuro. Si el club alguna vez juega en UTC+X, esto hay que revisarlo.
   */
  testedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha va como AAAA-MM-DD')
    .refine((value) => value <= new Date().toISOString().slice(0, 10), 'Todavía no llegó esa fecha')
    .optional(),
})

export type EvaluationInput = z.infer<typeof evaluationSchema>
