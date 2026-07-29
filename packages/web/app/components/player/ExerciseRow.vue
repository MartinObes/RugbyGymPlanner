<script setup lang="ts">
import type { PlayerExercise } from '~~/generated'

/**
 * El orden de esta fila está pensado para leerse PARADO ENTRE SERIES, del
 * celular: primero qué ejercicio, después con cuánto peso (grande, es lo que
 * vino a buscar), después el contexto, y al final los inputs.
 */
const props = defineProps<{ exercise: PlayerExercise; dayId: string; disabled: boolean }>()

const api = usePlayerApi()

const weight = ref<number | null>(
  props.exercise.entry?.weight ??
    // Prellenar con la carga calculada: el jugador solo la cambia si levantó
    // otra cosa. LABEL y NONE no tienen kg que sugerir.
    (props.exercise.load.kind === 'weight' || props.exercise.load.kind === 'percentage'
      ? (props.exercise.load.kg ?? null)
      : null),
)
const reps = ref<number | null>(props.exercise.entry?.reps ?? null)
const rpe = ref<number | null>(props.exercise.entry?.rpe ?? null)

const { trigger, state, error } = useDebouncedSave(async () => {
  await api.put(`/api/player/days/${props.dayId}/entries/${props.exercise.id}`, {
    weight: weight.value,
    reps: reps.value,
    rpe: rpe.value,
  })
})

const RPE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

const loadClass = computed(() =>
  props.exercise.load.kind === 'missing-1rm'
    ? 'text-lg font-semibold text-warning'
    : 'text-lg font-semibold',
)
</script>

<template>
  <div class="space-y-2 border-t border-default py-3 first:border-t-0">
    <div class="flex items-baseline justify-between gap-2">
      <p class="font-medium">{{ exercise.exerciseName }}</p>
      <p v-if="exercise.sets || exercise.reps" class="shrink-0 text-sm text-muted">
        {{ exercise.sets ?? 1 }} × {{ exercise.reps ?? '—' }}
      </p>
    </div>

    <p :class="loadClass">{{ exercise.load.label }}</p>

    <div class="flex flex-wrap items-center gap-2">
      <UBadge v-if="exercise.targetRpe != null" color="neutral" variant="subtle">
        RPE objetivo {{ exercise.targetRpe }}
      </UBadge>
      <p v-if="exercise.lastPerfLabel" class="flex items-center gap-1 text-xs text-muted">
        <UIcon name="i-lucide-history" class="size-3" />
        {{ exercise.lastPerfLabel }}
      </p>
    </div>

    <div class="flex flex-wrap items-end gap-2">
      <UFormField label="Peso" class="w-24">
        <UInput
          v-model.number="weight"
          type="number"
          step="0.5"
          min="0"
          :disabled="disabled"
          @update:model-value="trigger(undefined)"
        />
      </UFormField>
      <UFormField label="Reps" class="w-20">
        <UInput
          v-model.number="reps"
          type="number"
          min="0"
          :disabled="disabled"
          @update:model-value="trigger(undefined)"
        />
      </UFormField>
      <UFormField label="RPE" class="w-24">
        <USelect
          v-model="rpe"
          :items="RPE_OPTIONS"
          :disabled="disabled"
          @update:model-value="trigger(undefined)"
        />
      </UFormField>

      <p v-if="state === 'saving'" class="pb-2 text-xs text-muted">Guardando…</p>
      <p v-else-if="state === 'saved'" class="pb-2 text-xs text-muted">Guardado</p>
      <p v-else-if="state === 'error'" class="pb-2 text-xs text-error">{{ error }}</p>
    </div>
  </div>
</template>
