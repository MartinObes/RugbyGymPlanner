<script setup lang="ts">
import type { PlayerExercise } from '~~/generated'

/**
 * El control de registro. Se eligió slideover sobre las otras dos variantes
 * (chip que se expande, inputs siempre visibles) porque los inputs visibles hacen
 * que la fila se lea como grilla de formulario INCLUSO VACÍA — que es exactamente
 * lo que F3.5 vino a arreglar (docs/DESIGN-SYSTEM.md §8).
 *
 * Se guarda solo, con el debounce de useDebouncedSave. El padre llama a `flush`
 * antes de cerrar el día: sin eso el PUT de la última tecla llega a un día ya
 * cerrado y vuelve 409.
 */
const props = defineProps<{ exercise: PlayerExercise; dayId: string; disabled: boolean }>()

const api = usePlayerApi()
const open = ref(false)

const weight = ref<number | null>(props.exercise.entry?.weight ?? null)
const reps = ref<number | null>(props.exercise.entry?.reps ?? null)
const rpe = ref<number | null>(props.exercise.entry?.rpe ?? null)

/** El peso prescrito, para arrancar el stepper donde el jugador espera. */
const prescribed = computed(() =>
  props.exercise.load.kind === 'weight' || props.exercise.load.kind === 'percentage'
    ? (props.exercise.load.kg ?? null)
    : null,
)

const { trigger, flush, state, error } = useDebouncedSave(async () => {
  await api.put(`/api/player/days/${props.dayId}/entries/${props.exercise.id}`, {
    weight: weight.value,
    reps: reps.value,
    rpe: rpe.value,
  })
})

defineExpose({ flush })

/** "120 kg / 5 reps" — lo que la fila muestra sin abrir nada. */
const summary = computed(() => {
  const parts: string[] = []
  if (weight.value !== null) parts.push(`${weight.value} kg`)
  if (reps.value !== null) parts.push(`${reps.value} reps`)
  if (parts.length === 0 && rpe.value !== null) parts.push(`RPE ${rpe.value}`)
  return parts.length > 0 ? parts.join(' / ') : null
})
</script>

<template>
  <!-- En reposo es un BOTÓN, no un input: sin fondo y con el borde tenue, para que
       no se lea como un campo vacío esperando texto. -->
  <UButton
    v-if="!summary"
    color="neutral"
    variant="outline"
    size="xs"
    icon="i-lucide-plus"
    :disabled="disabled"
    class="shrink-0"
    @click="() => { open = true }"
  >
    registrar
  </UButton>
  <UButton
    v-else
    color="navy"
    variant="soft"
    size="xs"
    trailing-icon="i-lucide-pencil"
    :disabled="disabled"
    class="shrink-0"
    @click="() => { open = true }"
  >
    {{ summary }}
  </UButton>

  <USlideover v-model:open="open" side="bottom" :title="exercise.exerciseName">
    <template #description>
      <span v-if="prescribed !== null">prescrito {{ prescribed }} kg</span>
      <span v-else>{{ exercise.load.label }}</span>
    </template>

    <template #body>
      <div class="space-y-2.5">
        <PlayerStepperField
          v-model="weight"
          label="Peso (kg)"
          :step="0.5"
          :max="500"
          :fallback="prescribed ?? 0"
          @update:model-value="trigger(undefined)"
        />
        <PlayerStepperField
          v-model="reps"
          label="Reps"
          :max="999"
          :fallback="1"
          @update:model-value="trigger(undefined)"
        />
        <PlayerStepperField
          v-model="rpe"
          label="RPE percibido"
          :step="0.5"
          :min="1"
          :max="10"
          :fallback="7"
          @update:model-value="trigger(undefined)"
        />

        <!-- Altura fija para que el layout no salte entre estados. -->
        <p class="h-4 text-center text-xs text-muted">
          <template v-if="state === 'saving'">Guardando…</template>
          <template v-else-if="state === 'saved'">Guardado</template>
          <span v-else-if="state === 'error'" class="text-error">{{ error }}</span>
          <template v-else>Se guarda solo</template>
        </p>
      </div>
    </template>
  </USlideover>
</template>
