import { toWebRequest } from 'h3'
import { app } from '@coachlab/api'

/**
 * Único punto de entrada de la API. Nitro captura todo lo que cae bajo /api y
 * se lo pasa entero a la app Hono, que resuelve el routing con su propio
 * basePath '/api'.
 *
 * Por eso no hay un archivo por endpoint en server/: las rutas viven en
 * packages/api/src/routes/, donde se testean con app.request() sin servidor.
 *
 * `toWebRequest` se importa EXPLÍCITAMENTE y h3 está pineado en el package.json
 * de este paquete. Motivo: el árbol tiene h3 v1 (la que usa Nitro en runtime) y
 * h3 v2 (transitiva). El auto-import de Nitro resolvía la v2, que ya no exporta
 * `toWebRequest`, y todos los requests morían con un error de módulo. Con el
 * import explícito y la versión fijada, resuelve siempre la misma.
 */
export default defineEventHandler((event) => app.fetch(toWebRequest(event)))
