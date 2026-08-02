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

const confirmRemoveOpen = ref(false)
const removing = ref(false)

async function removeDay() {
  removing.value = true
  try {
    await api.del(`/api/coach/days/${props.day.id}`)
    toast.add({ title: 'Día borrado', color: 'success' })
    confirmRemoveOpen.value = false
    emit('changed')
  } catch (e) {
    toast.add({ title: 'No se pudo borrar el día', description: msg(e), color: 'error' })
  } finally {
    removing.value = false
  }
}

const msg = (e: unknown) => (e instanceof Error ? e.message : undefined)
</script>

<template>
  <div class="w-full shrink-0 space-y-3 rounded-lg bg-elevated p-3 lg:w-96">
    <div class="flex items-center gap-2">
      <UInput
        v-model="name"
        variant="ghost"
        class="flex-1 font-medium"
        aria-label="Nombre del día"
        @blur="saveName"
      />
      <UButton
        icon="i-lucide-trash-2"
        color="neutral"
        variant="ghost"
        size="xs"
        aria-label="Borrar día"
        @click="() => { confirmRemoveOpen = true }"
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

    <UModal v-model:open="confirmRemoveOpen" :title="`¿Borrar ${day.name}?`">
      <template #body>
        <p class="text-sm text-muted">
          Se borra el día con todos sus bloques y ejercicios. No se puede deshacer.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="() => { confirmRemoveOpen = false }">
            Cancelar
          </UButton>
          <UButton color="error" :loading="removing" @click="removeDay">Borrar día</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
