import { z } from '@hono/zod-openapi'

/** El shape de error de CLAUDE.md §5, una sola vez para todo el spec. */
export const ErrorResponse = z
  .object({ ok: z.literal(false), error: z.string() })
  .openapi('ErrorResponse')
