<script setup lang="ts">
import { parsePlannedReps } from '@coachlab/core/domain/plannedReps'
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

// El padre refresca `week` (p.ej. al reabrir un día, o al volver a esta pantalla)
// y ahí es cuando se sabe qué quedó de verdad guardado en el server. Sin este
// watch, si un PUT falló con wifi mala, la fila seguía mostrando el registro
// optimista para siempre. Mismo patrón que el `watch` de StepperField.vue sobre
// su propio `draft`.
watch(
  () => props.exercise.entry,
  (entry) => {
    weight.value = entry?.weight ?? null
    reps.value = entry?.reps ?? null
    rpe.value = entry?.rpe ?? null
  },
)

/**
 * Los tres valores del PLAN. Se muestran en gris dentro de cada campo y arrancan
 * los −/+, pero no se guardan solos: ver el comentario de StepperField.vue.
 *
 * Sin peso prescrito (carga por etiqueta, o sin 1RM cargado) el placeholder
 * queda en "—" en vez de en 0 — sugerir cero kilos no ayuda a nadie.
 */
const prescribed = computed(() =>
  props.exercise.load.kind === 'weight' || props.exercise.load.kind === 'percentage'
    ? (props.exercise.load.kg ?? null)
    : null,
)

/** `reps` del plan es texto ("8-10", "máx"): el número sale del dominio. */
const plannedReps = computed(() => parsePlannedReps(props.exercise.reps))

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
    :color="state === 'error' ? 'error' : 'navy'"
    variant="soft"
    size="xs"
    :icon="state === 'error' ? 'i-lucide-triangle-alert' : undefined"
    trailing-icon="i-lucide-pencil"
    :disabled="disabled"
    class="shrink-0"
    :title="state === 'error' ? 'No se guardó, tocá para reintentar' : undefined"
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
          label="Peso"
          unit="kg"
          :step="0.5"
          :max="500"
          :fallback="prescribed"
          @update:model-value="trigger(undefined)"
        />
        <PlayerStepperField
          v-model="reps"
          label="Reps"
          :max="999"
          :fallback="plannedReps"
          @update:model-value="trigger(undefined)"
        />
        <!-- El gris de acá es el RPE OBJETIVO del coach, no un 7 inventado: es
             exactamente el número contra el que se va a comparar después. -->
        <PlayerStepperField
          v-model="rpe"
          label="RPE percibido"
          :step="0.5"
          :min="1"
          :max="10"
          :fallback="exercise.targetRpe"
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
