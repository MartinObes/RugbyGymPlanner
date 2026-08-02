<script setup lang="ts">
import type { ExerciseOption } from '../ExerciseTypeahead.vue'

/**
 * LABEL es el cuarto modo de carga (migración 0013): una etiqueta corta para lo
 * que no es un número ni un porcentaje — "p.corp", "barra", "goma", "med 9".
 * Sale de las planillas reales del club.
 */
type RowLoadType = 'WEIGHT' | 'PERCENTAGE' | 'NONE' | 'LABEL'

export type ExerciseRowValue = {
  id: string
  exerciseId: string
  loadType: RowLoadType
  weight: number | null
  percentage: number | null
  loadLabel: string | null
  sets: number | null
  reps: string | null
  targetRpe: number | null
}

const props = defineProps<{ value: ExerciseRowValue; exercises: ExerciseOption[] }>()
const emit = defineEmits<{ remove: [] }>()

const api = useCoachApi()
const toast = useToast()

const row = reactive({ ...props.value })

const { trigger, state, error } = useDebouncedSave(async () => {
  await api.patch(`/api/coach/block-exercises/${row.id}`, {
    exerciseId: row.exerciseId,
    loadType: row.loadType,
    weight: row.loadType === 'WEIGHT' ? row.weight : null,
    percentage: row.loadType === 'PERCENTAGE' ? row.percentage : null,
    loadLabel: row.loadType === 'LABEL' ? row.loadLabel : null,
    sets: row.sets,
    reps: row.reps,
    targetRpe: row.targetRpe,
  })
})

// El ícono de error solo se ve al pasar el mouse (tooltip), inútil en la tablet
// del coach. El toast es la señal que sí se nota sin hover.
watch(state, (value) => {
  if (value === 'error') {
    toast.add({
      title: 'No se pudo guardar el ejercicio',
      description: error.value ?? undefined,
      color: 'error',
    })
  }
})

const confirmRemoveOpen = ref(false)

const LOAD_ITEMS = [
  { label: 'Kg', value: 'WEIGHT' },
  { label: '% del 1RM', value: 'PERCENTAGE' },
  { label: 'Etiqueta', value: 'LABEL' },
  { label: 'Sin peso', value: 'NONE' },
]

/**
 * Al cambiar de modo hay que limpiar los campos de los otros ANTES de guardar:
 * si no, el CHECK block_exercises_load_shape rechaza el update y el autosave
 * falla en silencio.
 */
function onLoadTypeChange(next: unknown) {
  row.loadType = next as RowLoadType
  row.weight = null
  row.percentage = null
  row.loadLabel = null
  trigger(undefined)
}
</script>

<template>
  <div class="flex flex-wrap items-end gap-2 rounded-md border border-default p-2">
    <div class="min-w-40 flex-1">
      <ExerciseTypeahead
        :model-value="row.exerciseId"
        :exercises="exercises"
        @update:model-value="
          (id) => {
            if (id) {
              row.exerciseId = id
              trigger(undefined)
            }
          }
        "
      />
    </div>

    <UInput
      v-model.number="row.sets"
      type="number"
      min="1"
      max="20"
      class="w-16"
      placeholder="Series"
      aria-label="Series"
      @blur="trigger(undefined)"
    />

    <UInput
      v-model="row.reps"
      class="w-20"
      placeholder="Reps"
      aria-label="Repeticiones"
      @blur="trigger(undefined)"
    />

    <USelect
      :model-value="row.loadType"
      :items="LOAD_ITEMS"
      class="w-32"
      aria-label="Modo de carga"
      @update:model-value="onLoadTypeChange"
    />

    <UInput
      v-if="row.loadType === 'WEIGHT'"
      v-model.number="row.weight"
      type="number"
      min="1"
      max="500"
      step="0.5"
      class="w-20"
      placeholder="kg"
      aria-label="Kilos"
      @blur="trigger(undefined)"
    />

    <UInput
      v-else-if="row.loadType === 'PERCENTAGE'"
      v-model.number="row.percentage"
      type="number"
      min="1"
      max="100"
      class="w-20"
      placeholder="%"
      aria-label="Porcentaje del 1RM"
      @blur="trigger(undefined)"
    />

    <UInput
      v-else-if="row.loadType === 'LABEL'"
      v-model="row.loadLabel"
      maxlength="24"
      class="w-28"
      placeholder="p.corp"
      aria-label="Con qué se hace"
      @blur="trigger(undefined)"
    />

    <UInput
      v-model.number="row.targetRpe"
      type="number"
      min="1"
      max="10"
      step="0.5"
      class="w-20"
      placeholder="RPE"
      aria-label="RPE objetivo"
      @blur="trigger(undefined)"
    />

    <div class="flex items-center gap-1">
      <UIcon
        v-if="state === 'saving'"
        name="i-lucide-loader-circle"
        class="size-4 animate-spin text-muted"
      />
      <UTooltip v-else-if="state === 'error'" :text="error ?? 'Error al guardar'">
        <UIcon name="i-lucide-circle-alert" class="size-4 text-error" />
      </UTooltip>
      <UIcon v-else-if="state === 'saved'" name="i-lucide-check" class="size-4 text-success" />

      <UButton
        icon="i-lucide-trash-2"
        color="neutral"
        variant="ghost"
        size="xs"
        aria-label="Borrar ejercicio"
        @click="() => { confirmRemoveOpen = true }"
      />
    </div>

    <UModal v-model:open="confirmRemoveOpen" title="¿Borrar este ejercicio?">
      <template #body>
        <p class="text-sm text-muted">Se borra de este bloque. No se puede deshacer.</p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="() => { confirmRemoveOpen = false }">
            Cancelar
          </UButton>
          <UButton
            color="error"
            @click="
              () => {
                confirmRemoveOpen = false
                emit('remove')
              }
            "
          >
            Borrar ejercicio
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
