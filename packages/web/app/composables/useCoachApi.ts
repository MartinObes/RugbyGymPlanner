/**
 * Llamadas a la API del coach.
 *
 * En SSR el fetch interno no arrastra la cookie de sesión: se reenvía explícita
 * con useRequestHeaders. En el cliente el browser la manda solo.
 *
 * `$fetch` tira en 4xx/5xx, así que el mensaje del contrato tipado
 * `{ ok: false, error }` se extrae acá y se relanza como Error con ese texto —
 * si no, el componente muestra "fetch failed" en vez de "No encontrado".
 */
type Body = Record<string, unknown> | undefined

export function useCoachApi() {
  async function call<T>(
    path: string,
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    body?: Body,
  ): Promise<T> {
    try {
      return (await $fetch(path, {
        method,
        body,
        headers: import.meta.server ? useRequestHeaders(['cookie']) : undefined,
      })) as T
    } catch (error) {
      const data = (error as { data?: { error?: string } }).data
      throw new Error(data?.error ?? 'No se pudo completar la operación')
    }
  }

  return {
    get: <T>(path: string) => call<T>(path, 'GET'),
    post: <T>(path: string, body?: Body) => call<T>(path, 'POST', body),
    patch: <T>(path: string, body?: Body) => call<T>(path, 'PATCH', body),
    put: <T>(path: string, body?: Body) => call<T>(path, 'PUT', body),
    del: <T>(path: string) => call<T>(path, 'DELETE'),
  }
}
