<script setup lang="ts">
import type { PlayerWeekResponse } from '~~/generated'

const route = useRoute()
const api = usePlayerApi()
const toast = useToast()

const dayId = computed(() => String(route.params.dayId))

// La misma key que la lista: Nuxt comparte el payload y navegar entre las dos no
// vuelve a pedir la semana.
const { data, refresh } = await useAsyncData('player-week', () =>
  api.get<PlayerWeekResponse>('/api/player/week'),
)

const week = computed(() => data.value?.week ?? null)
const day = computed(() => week.value?.days.find((d) => d.id === dayId.value) ?? null)

const note = ref('')
const perceivedRpe = ref<number | null>(null)
const noteOpen = ref(false)
const busy = ref(false)

// El día llega por SSR, así que los valores existen antes del primer render.
watchEffect(() => {
  if (!day.value) return
  note.value = day.value.note ?? ''
  perceivedRpe.value = day.value.perceivedRpe ?? null
  // Si ya había dejado un comentario, se muestra abierto: esconder lo que el
  // jugador ya escribió sería peor que el problema que el colapso resuelve.
  if (day.value.note) noteOpen.value = true
})

const blocks = ref<{ flush: () => Promise<unknown> }[]>([])

const RPE_SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

async function complete() {
  busy.value = true
  try {
    // ANTES del POST: el debounce de 800 ms del autosave llegaría a un día ya
    // cerrado y la ruta lo rechazaría con 409, mostrando un error en rojo después
    // de haber completado.
    await Promise.all(blocks.value.filter(Boolean).map((block) => block.flush()))

    await api.post(`/api/player/days/${dayId.value}/complete`, {
      note: note.value || null,
      perceivedRpe: perceivedRpe.value,
    })
    toast.add({ title: 'Día completado', description: 'Tu entrenador ya lo puede ver.' })
    await refresh()
  } catch (error) {
    toast.add({
      title: 'No se pudo completar',
      description: error instanceof Error ? error.message : undefined,
      color: 'error',
    })
  } finally {
    busy.value = false
  }
}

async function reopen() {
  busy.value = true
  try {
    await api.post(`/api/player/days/${dayId.value}/reopen`)
    await refresh()
  } catch (error) {
    toast.add({
      title: 'No se pudo reabrir',
      description: error instanceof Error ? error.message : undefined,
      color: 'error',
    })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="day" class="space-y-3">
    <div>
      <UButton
        to="/player/week"
        color="neutral"
        variant="link"
        size="xs"
        icon="i-lucide-chevron-left"
        class="-ml-2"
      >
        Mi semana
      </UButton>
      <h1 class="font-bold text-navy-500 dark:text-highlighted">{{ day.name }}</h1>
      <UBadge color="neutral" variant="subtle" class="mt-1">{{ day.weekName }}</UBadge>
    </div>

    <!-- Día cerrado: la franja de arriba lo dice y ofrece reabrir. Los bloques
         siguen abajo en modo lectura (los slideovers quedan disabled). -->
    <div
      v-if="day.completed"
      class="flex items-center justify-between gap-2 rounded-xl bg-success/10 px-4 py-3.5"
    >
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-check-circle" class="size-4 text-success" />
        <p class="text-sm font-bold">{{ day.name }} completada</p>
      </div>
      <UButton color="navy" variant="link" size="xs" :loading="busy" @click="reopen">
        Reabrir
      </UButton>
    </div>

    <UAlert
      v-if="day.missingOneRms.length > 0 && !day.completed"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="`Faltan tus 1RM de ${day.missingOneRms.join(', ')}`"
      description="Cargalos en Mi perfil para ver los kg de cada serie."
    />

    <PlayerBlockSection
      v-for="block in day.blocks"
      ref="blocks"
      :key="block.id"
      :block="block"
      :day-id="day.id"
      :disabled="day.completed"
    />

    <!-- Cierre del día -->
    <div v-if="!day.completed" class="space-y-3 pt-2">
      <div>
        <p class="mb-1.5 text-sm font-medium">¿Cómo te fue hoy?</p>
        <p class="mb-2 text-xs text-muted">Opcional. Le sirve a tu entrenador para ajustar cargas.</p>
        <div class="flex flex-wrap gap-1.5">
          <UButton
            v-for="value in RPE_SCALE"
            :key="value"
            :color="perceivedRpe === value ? 'primary' : 'neutral'"
            :variant="perceivedRpe === value ? 'solid' : 'outline'"
            size="sm"
            @click="() => { perceivedRpe = perceivedRpe === value ? null : value }"
          >
            {{ value }}
          </UButton>
        </div>
      </div>

      <!-- Colapsado por defecto. Abierto pegado al botón se leía como un paso
           obligatorio previo, y nunca lo fue. -->
      <UButton
        v-if="!noteOpen"
        color="neutral"
        variant="link"
        size="sm"
        icon="i-lucide-message-square-plus"
        class="-ml-2"
        @click="() => { noteOpen = true }"
      >
        Agregar un comentario
      </UButton>
      <UTextarea
        v-else
        v-model="note"
        :rows="2"
        class="w-full"
        placeholder="Cómo te sentiste, si algo molestó, lo que quieras contarle a tu entrenador"
      />

      <UButton block size="lg" :loading="busy" @click="complete">Completar día</UButton>
    </div>

    <UCard v-else-if="day.note">
      <p class="text-xs text-muted">Comentario</p>
      <p class="mt-0.5 text-sm">{{ day.note }}</p>
    </UCard>
  </div>

  <UCard v-else>
    <p class="text-sm text-muted">
      No encontramos ese día en tu semana. Volvé a
      <NuxtLink to="/player/week" class="text-primary underline">Mi semana</NuxtLink>.
    </p>
  </UCard>
</template>
