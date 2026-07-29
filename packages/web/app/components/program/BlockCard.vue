<script setup lang="ts">
import { sortByOrderIndex } from '@coachlab/core/domain/tree'
import type { ExerciseOption } from '../ExerciseTypeahead.vue'
import type { ExerciseRowValue } from './ExerciseRow.vue'

export type BlockValue = {
  id: string
  type: 'SINGLE' | 'CIRCUIT'
  rounds: number | null
  orderIndex: number
  exercises: (ExerciseRowValue & { orderIndex: number })[]
}

const props = defineProps<{ block: BlockValue; exercises: ExerciseOption[] }>()
const emit = defineEmits<{ changed: [] }>()

const api = useCoachApi()
const toast = useToast()

// El orden nunca sale del orden de llegada (CLAUDE.md §3).
const rows = computed(() => sortByOrderIndex(props.block.exercises.map((e) => ({ ...e, order_index: e.orderIndex }))))

const rounds = ref(props.block.rounds)
const adding = ref(false)

async function saveRounds() {
  if (props.block.type !== 'CIRCUIT' || !rounds.value) return
  try {
    await api.patch(`/api/coach/blocks/${props.block.id}`, { type: 'CIRCUIT', rounds: rounds.value })
  } catch (e) {
    toast.add({ title: 'No se pudo guardar las vueltas', description: msg(e), color: 'error' })
  }
}

async function addExercise() {
  const first = props.exercises[0]
  if (!first) {
    toast.add({ title: 'El catálogo de ejercicios está vacío', color: 'warning' })
    return
  }
  adding.value = true
  try {
    // Nace con el primer ejercicio del catálogo y sin carga: el coach lo cambia
    // en la fila. Crear una fila vacía no se puede — exercise_id es NOT NULL.
    await api.post(`/api/coach/blocks/${props.block.id}/exercises`, {
      exerciseId: first.id,
      sets: 3,
      reps: '10',
      loadType: 'NONE',
    })
    emit('changed')
  } catch (e) {
    toast.add({ title: 'No se pudo agregar el ejercicio', description: msg(e), color: 'error' })
  } finally {
    adding.value = false
  }
}

async function removeExercise(id: string) {
  try {
    await api.del(`/api/coach/block-exercises/${id}`)
    emit('changed')
  } catch (e) {
    toast.add({ title: 'No se pudo borrar', description: msg(e), color: 'error' })
  }
}

async function removeBlock() {
  try {
    await api.del(`/api/coach/blocks/${props.block.id}`)
    emit('changed')
  } catch (e) {
    toast.add({ title: 'No se pudo borrar el bloque', description: msg(e), color: 'error' })
  }
}

const msg = (e: unknown) => (e instanceof Error ? e.message : undefined)
</script>

<template>
  <div class="rounded-lg border border-default bg-default p-3">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <UBadge :color="block.type === 'CIRCUIT' ? 'primary' : 'neutral'" variant="subtle">
          {{ block.type === 'CIRCUIT' ? 'Circuito' : 'Bloque' }}
        </UBadge>
        <div v-if="block.type === 'CIRCUIT'" class="flex items-center gap-1 text-sm">
          <UInput
            v-model.number="rounds"
            type="number"
            min="1"
            max="20"
            class="w-16"
            aria-label="Vueltas"
            @blur="saveRounds"
          />
          <span class="text-muted">vueltas</span>
        </div>
      </div>
      <UButton
        icon="i-lucide-trash-2"
        color="neutral"
        variant="ghost"
        size="xs"
        aria-label="Borrar bloque"
        @click="removeBlock"
      />
    </div>

    <div class="mt-3 space-y-2">
      <ProgramExerciseRow
        v-for="row in rows"
        :key="row.id"
        :value="row"
        :exercises="exercises"
        @remove="removeExercise(row.id)"
      />
    </div>

    <UButton
      icon="i-lucide-plus"
      color="neutral"
      variant="ghost"
      size="xs"
      class="mt-2"
      :loading="adding"
      @click="addExercise"
    >
      Ejercicio
    </UButton>
  </div>
</template>
