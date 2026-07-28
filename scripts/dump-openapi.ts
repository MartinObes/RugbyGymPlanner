import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { app } from '@coachlab/api'

/**
 * Escribe el spec de OpenAPI corriendo la app Hono en memoria.
 *
 * El plan original de F0 pedía desplegar la API y apuntar hey-api a la URL
 * pública. Esto hace lo mismo sin desplegar nada, así que el cliente tipado se
 * puede regenerar offline y en CI.
 */
const OUTPUT = resolve(import.meta.dirname, '../packages/web/openapi.json')

async function main() {
  const res = await app.request('/api/openapi.json')
  if (!res.ok) {
    throw new Error(`La app devolvió ${res.status} al pedir el spec`)
  }

  const spec = await res.json()
  await mkdir(dirname(OUTPUT), { recursive: true })
  await writeFile(OUTPUT, `${JSON.stringify(spec, null, 2)}\n`, 'utf8')

  const paths = Object.keys(spec.paths ?? {})
  console.log(`✓ ${OUTPUT}`)
  console.log(`  ${paths.length} path(s): ${paths.join(', ')}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
