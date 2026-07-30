<script setup lang="ts">
import type { PlayerDay } from '~~/generated'

const props = defineProps<{ day: PlayerDay }>()
const emit = defineEmits<{ changed: [] }>()

const api = usePlayerApi()
const toast = useToast()

const note = ref(props.day.note ?? '')
const busy = ref(false)

/**
 * Las filas del día, para poder vaciar su autosave antes de cerrar.
 *
 * `v-for` con `ref` junta las instancias en un array, y el orden no importa: se
 * vacían todas.
 */
type Flushable = { flush: () => Promise<void> }
const rows = ref<Flushable[]>([])

async function flushRows() {
  await Promise.all(rows.value.filter(Boolean).map((row) => row.flush()))
}

async function complete() {
  busy.value = true
  try {
    // Antes del POST, no después: el debounce de 800 ms del autosave llegaría a
    // un día ya cerrado y la ruta lo rechazaría con 409.
    await flushRows()
    await api.post(`/api/player/days/${props.day.id}/complete`, { note: note.value || null })
    toast.add({ title: 'Día completado', description: 'Tu entrenador ya lo puede ver.' })
    emit('changed')
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
    await api.post(`/api/player/days/${props.day.id}/reopen`)
    emit('changed')
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
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-lg font-semibold">{{ day.name }}</h2>
        <div class="flex items-center gap-2">
          <UBadge color="neutral" variant="subtle">
            {{ day.loggedCount }}/{{ day.totalCount }} registrados
          </UBadge>
          <UBadge v-if="day.completed" color="success" variant="subtle">Completado</UBadge>
        </div>
      </div>
    </template>

    <div v-for="block in day.blocks" :key="block.id" class="mb-4 last:mb-0">
      <!-- Los bloques no tienen nombre en el schema: un CIRCUIT se rotula por
           sus vueltas y un SINGLE no lleva encabezado. -->
      <p v-if="block.type === 'CIRCUIT'" class="mb-1 text-sm font-medium text-primary">
        Circuito · {{ block.rounds }} vueltas
      </p>
      <PlayerExerciseRow
        v-for="exercise in block.exercises"
        ref="rows"
        :key="exercise.id"
        :exercise="exercise"
        :day-id="day.id"
        :disabled="day.completed"
      />
    </div>

    <template #footer>
      <div class="space-y-3">
        <UFormField label="¿Cómo te fue hoy?">
          <UTextarea
            v-model="note"
            :rows="2"
            :disabled="day.completed"
            class="w-full"
            placeholder="Cómo te sentiste, si algo molestó, lo que quieras contarle a tu entrenador"
          />
        </UFormField>
        <UButton v-if="!day.completed" :loading="busy" @click="complete">Completar día</UButton>
        <UButton v-else color="neutral" variant="subtle" :loading="busy" @click="reopen">
          Reabrir
        </UButton>
      </div>
    </template>
  </UCard>
</template>
