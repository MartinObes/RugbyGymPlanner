<script setup lang="ts">
import { sortByOrderIndex } from '@coachlab/core/domain/tree'
import type { ExerciseOption } from '../ExerciseTypeahead.vue'
import type { BlockValue } from './BlockCard.vue'

export type DayValue = { id: string; name: string; orderIndex: number; blocks: BlockValue[] }

const props = defineProps<{ day: DayValue; exercises: ExerciseOption[] }>()
const emit = defineEmits<{ changed: [] }>()

const api = useCoachApi()
const toast = useToast()

const blocks = computed(() =>
  sortByOrderIndex(props.day.blocks.map((b) => ({ ...b, order_index: b.orderIndex }))),
)

const name = ref(props.day.name)
const busy = ref(false)

async function saveName() {
  const next = name.value.trim()
  if (!next || next === props.day.name) return
  try {
    await api.patch(`/api/coach/days/${props.day.id}`, { name: next })
    emit('changed')
  } catch (e) {
    toast.add({ title: 'No se pudo renombrar el día', description: msg(e), color: 'error' })
  }
}

async function addBlock(type: 'SINGLE' | 'CIRCUIT') {
  busy.value = true
  try {
    await api.post(`/api/coach/days/${props.day.id}/blocks`, {
      type,
      rounds: type === 'CIRCUIT' ? 3 : null,
    })
    emit('changed')
  } catch (e) {
    toast.add({ title: 'No se pudo agregar el bloque', description: msg(e), color: 'error' })
  } finally {
    busy.value = false
  }
}

async function removeDay() {
  try {
    await api.del(`/api/coach/days/${props.day.id}`)
    emit('changed')
  } catch (e) {
    toast.add({ title: 'No se pudo borrar el día', description: msg(e), color: 'error' })
  }
}

const msg = (e: unknown) => (e instanceof Error ? e.message : undefined)
</script>

<template>
  <div class="w-full shrink-0 space-y-3 rounded-lg bg-elevated p-3 lg:w-96">
    <div class="flex items-center gap-2">
      <UInput v-model="name" variant="ghost" class="flex-1 font-medium" @blur="saveName" />
      <UButton
        icon="i-lucide-trash-2"
        color="neutral"
        variant="ghost"
        size="xs"
        aria-label="Borrar día"
        @click="removeDay"
      />
    </div>

    <ProgramBlockCard
      v-for="block in blocks"
      :key="block.id"
      :block="block"
      :exercises="exercises"
      @changed="emit('changed')"
    />

    <div class="flex gap-2">
      <UButton color="neutral" variant="soft" size="xs" :loading="busy" @click="addBlock('SINGLE')">
        + Bloque
      </UButton>
      <UButton color="neutral" variant="soft" size="xs" :loading="busy" @click="addBlock('CIRCUIT')">
        + Circuito
      </UButton>
    </div>
  </div>
</template>
