import { OpenAPIHono } from '@hono/zod-openapi'
import { requireRole, withActor, type AuthVariables } from './middleware/auth'
import { onError } from './middleware/error'
import { admin } from './routes/admin'
import { auth } from './routes/auth'
import { catalog } from './routes/catalog'
import { assignments } from './routes/coach/assignments'
import { groups } from './routes/coach/groups'
import { programImport } from './routes/coach/import'
import { players } from './routes/coach/players'
import { programs } from './routes/coach/programs'
import { tree } from './routes/coach/tree'
import { health } from './routes/health'
import { playerWeek } from './routes/player/week'

/**
 * App Hono de CoachLab.
 *
 * No es un servicio aparte: la monta Nitro en packages/web/server/api/[...].ts,
 * así que todo el proyecto es un solo deployable en Vercel. El basePath '/api'
 * coincide con la ruta desde la que Nitro la llama, y por eso los tests piden
 * '/api/health' igual que producción.
 */
export const app = new OpenAPIHono<{ Variables: AuthVariables }>().basePath('/api')

// Errores tipados según CLAUDE.md §5: nunca una excepción cruda al cliente.
app.onError(onError)

app.use('*', withActor)

// Capa 2 de CLAUDE.md §4: el guard cuelga del PREFIJO, no de cada ruta. Toda
// ruta nueva bajo /coach, /player o /admin nace protegida. /player/* queda
// guardado desde ya aunque sus rutas lleguen en F3.
app.use('/coach/*', requireRole(['COACH', 'ADMIN']))
app.use('/player/*', requireRole(['PLAYER']))
app.use('/admin/*', requireRole(['ADMIN']))
// El catálogo de ejercicios lo leen las dos partes (editor de programas y 1RM
// del jugador), así que su prefijo admite los tres roles — pero lo admite
// EXPLÍCITAMENTE, no por ausencia de guard.
app.use('/catalog/*', requireRole(['PLAYER', 'COACH', 'ADMIN']))

app.route('/', health)
app.route('/', auth)
app.route('/', players)
app.route('/', groups)
app.route('/', programs)
app.route('/', tree)
app.route('/', assignments)
app.route('/', programImport)
app.route('/', playerWeek)
app.route('/', catalog)
app.route('/', admin)

app.notFound((c) => c.json({ ok: false as const, error: 'No encontrado' }, 404))

// El spec que consume hey-api para generar el cliente tipado del frontend.
app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: { version: '0.1.0', title: 'CoachLab API' },
})

export type App = typeof app
