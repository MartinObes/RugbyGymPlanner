<script setup lang="ts">
import { evaluationSchema } from '@coachlab/core/validators/evaluation'
import type { ExerciseOption } from '../ExerciseTypeahead.vue'
import type { Evaluation } from '~~/generated'

/**
 * Carga y lista de evaluaciones. Lo usan las DOS puntas —el perfil del jugador y
 * la ficha del plantel del coach— cambiando solo `basePath`, porque el schema y la
 * forma de la respuesta son los mismos.
 *
 * El jugador ELIGE del catálogo y no crea ejercicios: `ensure_exercise`
 * (migraciones 0012/0014) rechaza a PLAYER a propósito. Por eso el typeahead lista
 * /api/catalog/exercises y manda un exerciseId.
 */
const props = defineProps<{
  /** '/api/player' o '/api/coach/players/<uuid>' */
  basePath: string
  evaluations: Evaluation[]
  exercises: ExerciseOption[]
}>()

const emit = defineEmits<{ changed: [Evaluation[]] }>()

const api = usePlayerApi()
const toast = useToast()

const exerciseId = ref<string | null>(null)
const kg = ref<number | null>(null)
const testedOn = ref(new Date().toISOString().slice(0, 10))
const busy = ref(false)

async function submit() {
  const parsed = evaluationSchema.safeParse({
    exerciseId: exerciseId.value,
    kg: kg.value,
    testedOn: testedOn.value,
  })
  if (!parsed.success) {
    toast.add({
      title: 'Revisá los datos',
      description: parsed.error.issues[0]?.message,
      color: 'error',
    })
    return
  }

  busy.value = true
  try {
    const res = await api.post<{ evaluations: Evaluation[] }>(
      `${props.basePath}/evaluations`,
      parsed.data,
    )
    emit('changed', res.evaluations)
    exerciseId.value = null
    kg.value = null
    toast.add({ title: 'Test cargado', description: 'El 1RM se actualizó con este valor.' })
  } catch (error) {
    toast.add({
      title: 'No se pudo cargar',
      description: error instanceof Error ? error.message : undefined,
      color: 'error',
    })
  } finally {
    busy.value = false
  }
}

async function remove(id: string) {
  // Solo el jugador borra las suyas: la ruta del coach no expone DELETE.
  busy.value = true
  try {
    const res = await api.del<{ evaluations: Evaluation[] }>(`${props.basePath}/evaluations/${id}`)
    emit('changed', res.evaluations)
    toast.add({ title: 'Test borrado' })
  } catch (error) {
    toast.add({
      title: 'No se pudo borrar',
      description: error instanceof Error ? error.message : undefined,
      color: 'error',
    })
  } finally {
    busy.value = false
  }
}

const canDelete = computed(() => props.basePath === '/api/player')
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-semibold">Tests de fuerza</h2>
      <p class="mt-0.5 text-xs text-muted">
        Cargar un test actualiza el 1RM vigente de ese ejercicio, así que la rutina recalcula los kg.
      </p>
    </template>

    <div class="flex flex-wrap items-end gap-2">
      <UFormField label="Ejercicio" class="min-w-40 flex-1">
        <ExerciseTypeahead v-model="exerciseId" :exercises="exercises" />
      </UFormField>
      <UFormField label="Kg" class="w-24">
        <UInput v-model.number="kg" type="number" step="0.5" min="0" />
      </UFormField>
      <UFormField label="Fecha" class="w-40">
        <UInput v-model="testedOn" type="date" />
      </UFormField>
      <UButton :loading="busy" @click="submit">Cargar</UButton>
    </div>

    <div v-if="evaluations.length > 0" class="mt-4 divide-y divide-default">
      <div
        v-for="evaluation in evaluations"
        :key="evaluation.id"
        class="flex items-center justify-between gap-2 py-2"
      >
        <div>
          <p class="text-sm font-medium">{{ evaluation.exerciseName }}</p>
          <p class="text-xs text-muted">{{ evaluation.testedOn }}</p>
        </div>
        <div class="flex items-center gap-2">
          <p class="font-semibold">{{ evaluation.kg }} kg</p>
          <UButton
            v-if="canDelete"
            color="error"
            variant="ghost"
            size="xs"
            icon="i-lucide-trash-2"
            :loading="busy"
            :aria-label="`Borrar el test de ${evaluation.exerciseName}`"
            @click="() => remove(evaluation.id)"
          />
        </div>
      </div>
    </div>
    <p v-else class="mt-4 text-sm text-muted">Todavía no hay tests cargados.</p>
  </UCard>
</template>
