<script setup lang="ts">
import { POSITIONS } from '@coachlab/core/domain/positions'
import type { CoachPlayerResponse, Evaluation, ExercisesResponse } from '~~/generated'

const route = useRoute()
const api = useCoachApi()
const toast = useToast()
const playerId = route.params.playerId as string

const { data, error, refresh } = await useAsyncData(`coach-player-${playerId}`, () =>
  api.get<CoachPlayerResponse>(`/api/coach/players/${playerId}`),
)

const { data: catalog } = await useAsyncData('catalog-exercises', () =>
  api.get<ExercisesResponse>('/api/catalog/exercises'),
)

const exercises = computed(() => catalog.value?.exercises ?? [])

const { data: evaluationsData, refresh: refreshEvaluations } = await useAsyncData(
  `coach-evaluations-${playerId}`,
  () => api.get<{ evaluations: Evaluation[] }>(`/api/coach/players/${playerId}/evaluations`),
)

// --- puesto y medidas: autosave ---------------------------------------------

const profile = reactive({
  positionId: data.value?.player.positionId ?? null,
  heightCm: data.value?.player.heightCm ?? null,
  weightKg: data.value?.player.weightKg ?? null,
})

const { trigger, state: saveState, error: saveError } = useDebouncedSave(async () => {
  await api.patch(`/api/coach/players/${playerId}`, {
    positionId: profile.positionId,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
  })
}, 600)

const POSITION_ITEMS = [
  { label: 'Sin puesto', value: null },
  ...POSITIONS.map((p) => ({ label: p.name, value: p.id as string })),
]

// --- 1RM ---------------------------------------------------------------------

const newRm = reactive<{ exerciseId: string | null; kg: number | null }>({ exerciseId: null, kg: null })
const savingRm = ref(false)

async function addRm() {
  if (!newRm.exerciseId || !newRm.kg) return
  savingRm.value = true
  try {
    await api.put(`/api/coach/players/${playerId}/one-rm`, {
      exerciseId: newRm.exerciseId,
      kg: newRm.kg,
    })
    newRm.exerciseId = null
    newRm.kg = null
    await refresh()
  } catch (e) {
    toast.add({
      title: 'No se pudo guardar el 1RM',
      description: e instanceof Error ? e.message : undefined,
      color: 'error',
    })
  } finally {
    savingRm.value = false
  }
}

async function removeRm(exerciseId: string) {
  try {
    await api.del(`/api/coach/players/${playerId}/one-rm/${exerciseId}`)
    await refresh()
  } catch (e) {
    toast.add({
      title: 'No se pudo borrar',
      description: e instanceof Error ? e.message : undefined,
      color: 'error',
    })
  }
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' })
</script>

<template>
  <div class="space-y-6">
    <div>
      <NuxtLink to="/coach/players" class="text-sm text-muted hover:text-default">
        ← Volver al plantel
      </NuxtLink>
    </div>

    <UAlert v-if="error" color="error" title="No se pudo cargar" :description="error.message" />

    <template v-else-if="data">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold">{{ data.player.name }}</h1>
          <p class="text-sm text-muted">{{ data.player.email }}</p>
        </div>
        <span
          v-if="saveState !== 'idle'"
          :class="['text-sm', saveState === 'error' ? 'text-error' : 'text-muted']"
        >
          {{
            saveState === 'saving' ? 'Guardando…' : saveState === 'saved' ? 'Guardado' : (saveError ?? 'Error al guardar')
          }}
        </span>
      </div>

      <UCard>
        <template #header>
          <h2 class="font-semibold">Puesto y medidas</h2>
        </template>

        <div class="grid gap-4 sm:grid-cols-3">
          <UFormField label="Puesto">
            <USelect
              v-model="profile.positionId"
              :items="POSITION_ITEMS"
              class="w-full"
              @update:model-value="trigger(undefined)"
            />
          </UFormField>

          <UFormField label="Altura (cm)">
            <UInput
              v-model.number="profile.heightCm"
              type="number"
              min="100"
              max="250"
              class="w-full"
              @blur="trigger(undefined)"
            />
          </UFormField>

          <UFormField label="Peso (kg)">
            <UInput
              v-model.number="profile.weightKg"
              type="number"
              min="30"
              max="250"
              step="0.5"
              class="w-full"
              @blur="trigger(undefined)"
            />
          </UFormField>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div>
            <h2 class="font-semibold">Fuerza máxima (1RM)</h2>
            <p class="mt-1 text-sm text-muted">
              Con esto se calculan los kg de los ejercicios en porcentaje del programa.
            </p>
          </div>
        </template>

        <ul v-if="data.oneRms.length > 0" class="divide-y divide-default">
          <li v-for="rm in data.oneRms" :key="rm.exerciseId" class="flex items-center gap-3 py-2">
            <span class="min-w-0 flex-1 truncate">{{ rm.exerciseName }}</span>
            <span class="font-mono font-medium">{{ rm.kg }} kg</span>
            <span class="hidden text-xs text-muted sm:block">{{ formatDate(rm.updatedAt) }}</span>
            <UButton
              icon="i-lucide-trash-2"
              color="neutral"
              variant="ghost"
              size="xs"
              aria-label="Borrar"
              @click="removeRm(rm.exerciseId)"
            />
          </li>
        </ul>
        <p v-else class="text-sm text-muted">
          Todavía no hay 1RM cargados. Los ejercicios en porcentaje le van a mostrar un aviso al
          jugador hasta que cargues el suyo.
        </p>

        <template #footer>
          <div class="flex flex-wrap items-end gap-2">
            <div class="min-w-48 flex-1">
              <ExerciseTypeahead v-model="newRm.exerciseId" :exercises="exercises" />
            </div>
            <UInput
              v-model.number="newRm.kg"
              type="number"
              min="1"
              max="500"
              step="0.5"
              placeholder="kg"
              class="w-24"
            />
            <UButton :disabled="!newRm.exerciseId || !newRm.kg" :loading="savingRm" @click="addRm">
              Agregar
            </UButton>
          </div>
        </template>
      </UCard>

      <PlayerEvaluationsForm
        :base-path="`/api/coach/players/${playerId}`"
        :evaluations="evaluationsData?.evaluations ?? []"
        :exercises="exercises"
        @changed="() => refreshEvaluations()"
      />
    </template>
  </div>
</template>
