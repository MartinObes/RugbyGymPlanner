export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Autosave con debounce.
 *
 * `flush` fuerza el guardado pendiente: sin eso, la última tecla escrita se
 * pierde si el usuario cambia de pantalla antes de que venza el delay.
 */
export function useDebouncedSave<T>(save: (value: T) => Promise<void>, delayMs = 800) {
  const state = ref<SaveState>('idle')
  const error = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: { value: T } | null = null

  async function run(value: T) {
    state.value = 'saving'
    try {
      await save(value)
      state.value = 'saved'
      error.value = null
    } catch (e) {
      state.value = 'error'
      error.value = e instanceof Error ? e.message : 'No se pudo guardar'
    }
  }

  function trigger(value: T) {
    pending = { value }
    if (timer) clearTimeout(timer)
    state.value = 'saving'
    timer = setTimeout(() => {
      timer = null
      const next = pending
      pending = null
      if (next) void run(next.value)
    }, delayMs)
  }

  async function flush() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    const next = pending
    pending = null
    if (next) await run(next.value)
  }

  onScopeDispose(() => {
    if (timer) clearTimeout(timer)
  })

  return { trigger, flush, state, error }
}
