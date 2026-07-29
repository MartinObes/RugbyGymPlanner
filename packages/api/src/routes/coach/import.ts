import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { normName } from '@coachlab/core/domain/normName'
import { importRequestSchema } from '@coachlab/core/validators/parsedProgram'
import type { AuthVariables } from '../../middleware/auth'
import { ErrorResponse } from '../schemas'
import { assertRow } from './_scope'

const ProgramIdParam = z.object({
  programId: z.string().uuid().openapi({ param: { name: 'programId', in: 'path' } }),
})

const ImportResponse = z
  .object({
    ok: z.literal(true),
    weeks: z.number(),
    days: z.number(),
    exercises: z.number(),
    /** Ejercicios que no estaban en el catálogo y se agregaron. */
    createdExercises: z.array(z.string()),
  })
  .openapi('ImportResponse')

export const programImport = new OpenAPIHono<{ Variables: AuthVariables }>().openapi(
  createRoute({
    method: 'post',
    path: '/coach/programs/{programId}/import',
    summary: 'Reemplazar el contenido del programa con un árbol importado',
    request: {
      params: ProgramIdParam,
      body: { content: { 'application/json': { schema: importRequestSchema } } },
    },
    responses: {
      200: { description: 'Importado', content: { 'application/json': { schema: ImportResponse } } },
      401: {
        description: 'Sin sesión o rol equivocado',
        content: { 'application/json': { schema: ErrorResponse } },
      },
      404: {
        description: 'El programa no existe o no es tuyo',
        content: { 'application/json': { schema: ErrorResponse } },
      },
    },
  }),
  async (c) => {
    const actor = c.get('actor')!
    const { programId } = c.req.valid('param')
    // El cliente parsea, pero el server NO confía: importRequestSchema revalida,
    // y sus superRefine espejan los CHECK de la base. Eso es lo que garantiza que
    // cuando lleguemos al delete del árbol, lo nuevo es insertable — antes, un
    // CIRCUIT sin vueltas pasaba la validación y moría en el insert dejando el
    // programa vacío.
    const parsed = c.req.valid('json')
    const db = c.get('db')

    const { data: program, error: programError } = await db
      .from('programs')
      .select('id')
      .eq('id', programId)
      .eq('coach_id', actor.id)
      .maybeSingle()
    assertRow(program, programError)

    // --- 1. Resolver los ejercicios del catálogo -----------------------------
    //
    // ensure_exercise (0008) inserta solo si falta y devuelve el id. El
    // normalized_name lo calcula acá con normName: es la misma función que
    // decide el matching de 1RM, y replicarla en SQL sería tener dos fuentes de
    // verdad.
    const names = [
      ...new Set(
        parsed.weeks.flatMap((week) =>
          week.days.flatMap((day) => day.blocks.flatMap((block) => block.exercises.map((e) => e.exerciseName))),
        ),
      ),
    ]

    const { data: existing, error: existingError } = await db
      .from('exercises')
      .select('id, normalized_name')
    if (existingError) throw new Error(existingError.message)

    const byNormalized = new Map(
      (existing ?? []).map((e) => [e.normalized_name as string, e.id as string]),
    )

    const exerciseIds = new Map<string, string>()
    const createdExercises: string[] = []

    for (const name of names) {
      const normalized = normName(name)
      const known = byNormalized.get(normalized)
      if (known) {
        exerciseIds.set(name, known)
        continue
      }

      const { data: id, error } = await db.rpc('ensure_exercise', {
        p_name: name,
        p_normalized: normalized,
      })
      if (error) throw new Error(`No se pudo agregar "${name}" al catálogo: ${error.message}`)

      exerciseIds.set(name, id as string)
      byNormalized.set(normalized, id as string)
      createdExercises.push(name)
    }

    // --- 2. Reemplazar el contenido ------------------------------------------
    //
    // Es un REEMPLAZO, no un merge: la pantalla lo avisa antes de confirmar. El
    // CASCADE de 0001 se lleva días, bloques y ejercicios de cada semana.
    //
    // No es transaccional (PostgREST no expone transacciones entre requests). Si
    // se corta a mitad, el programa queda con las semanas nuevas parciales; el
    // coach ve el resultado y puede reimportar. La alternativa —una RPC que
    // reciba el árbol como jsonb— mete la construcción del árbol en SQL, que es
    // justo lo que CLAUDE.md §3 evita.
    const { error: deleteError } = await db.from('weeks').delete().eq('program_id', programId)
    if (deleteError) throw new Error(deleteError.message)

    let dayCount = 0
    let exerciseCount = 0
    let firstWeekId: string | null = null

    for (const [weekIndex, week] of parsed.weeks.entries()) {
      const { data: weekRow, error: weekError } = await db
        .from('weeks')
        .insert({ program_id: programId, name: week.name, order_index: weekIndex })
        .select('id')
        .maybeSingle()
      const createdWeek = assertRow(weekRow, weekError)
      if (!firstWeekId) firstWeekId = createdWeek.id as string

      for (const [dayIndex, day] of week.days.entries()) {
        const { data: dayRow, error: dayError } = await db
          .from('days')
          .insert({ week_id: createdWeek.id, name: day.name, order_index: dayIndex })
          .select('id')
          .maybeSingle()
        const createdDay = assertRow(dayRow, dayError)
        dayCount += 1

        for (const [blockIndex, block] of day.blocks.entries()) {
          const { data: blockRow, error: blockError } = await db
            .from('blocks')
            .insert({
              day_id: createdDay.id,
              type: block.type,
              rounds: block.type === 'CIRCUIT' ? block.rounds : null,
              order_index: blockIndex,
            })
            .select('id')
            .maybeSingle()
          const createdBlock = assertRow(blockRow, blockError)

          if (block.exercises.length === 0) continue

          const { error: exercisesError } = await db.from('block_exercises').insert(
            block.exercises.map((exercise, exerciseIndex) => ({
              block_id: createdBlock.id,
              exercise_id: exerciseIds.get(exercise.exerciseName)!,
              load_type: exercise.loadType,
              weight: exercise.loadType === 'WEIGHT' ? exercise.weight : null,
              percentage: exercise.loadType === 'PERCENTAGE' ? exercise.percentage : null,
              sets: exercise.sets,
              reps: exercise.reps,
              target_rpe: exercise.targetRpe,
              order_index: exerciseIndex,
            })),
          )
          if (exercisesError) throw new Error(exercisesError.message)
          exerciseCount += block.exercises.length
        }
      }
    }

    // --- 3. La semana actual pasa a ser la primera importada -----------------
    const { error: currentError } = await db
      .from('programs')
      .update({ current_week_id: firstWeekId, updated_at: new Date().toISOString() })
      .eq('id', programId)
    if (currentError) throw new Error(currentError.message)

    return c.json(
      {
        ok: true as const,
        weeks: parsed.weeks.length,
        days: dayCount,
        exercises: exerciseCount,
        createdExercises,
      },
      200,
    )
  },
)
