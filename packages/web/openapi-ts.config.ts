import { defineConfig } from '@hey-api/openapi-ts'

/**
 * Genera el cliente TS desde el spec de la API.
 *
 * El spec sale de `pnpm dump:openapi`, que corre la app Hono en memoria y
 * escribe openapi.json. No hace falta desplegar nada para regenerar el cliente.
 */
export default defineConfig({
  input: './openapi.json',
  output: { path: './generated', format: 'prettier' },
  plugins: ['@hey-api/client-fetch'],
})
