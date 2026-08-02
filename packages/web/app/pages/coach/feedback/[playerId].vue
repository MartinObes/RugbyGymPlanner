<script setup lang="ts">
import type { FeedbackDetailResponse } from '~~/generated'
import { positionById } from '@coachlab/core/domain/positions'

const route = useRoute()
const api = useCoachApi()
const playerId = computed(() => route.params.playerId as string)

const { data, error, refresh, status } = await useAsyncData(
  () => `coach-feedback-${playerId.value}`,
  () => api.get<FeedbackDetailResponse>(`/api/coach/feedback/${playerId.value}`),
)

const player = computed(() => data.value?.player ?? null)

const positionName = (id: string | null) => (id ? (positionById(id)?.name ?? id) : 'Sin puesto')

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-UY', { day: 'numeric', month: 'long' })
</script>

<template>
  <div class="space-y-6">
    <UButton
      to="/coach/feedback"
      icon="i-lucide-chevron-left"
      color="neutral"
      variant="ghost"
      size="sm"
    >
      Volver al plantel
    </UButton>

    <UAlert v-if="error" color="error" title="No se pudo cargar el detalle">
      <template #description>
        <p>{{ error.message }}</p>
        <UButton
          class="mt-2"
          color="error"
          variant="outline"
          size="sm"
          :loading="status === 'pending'"
          @click="() => refresh()"
        >
          Reintentar
        </UButton>
      </template>
    </UAlert>

    <template v-else-if="player">
      <div>
        <h1 class="text-2xl font-bold">{{ player.playerName }}</h1>
        <p class="text-sm text-muted">
          {{ positionName(player.positionId) }}
          <template v-if="player.programName"> · {{ player.programName }}</template>
          <template v-if="player.weekName"> · {{ player.weekName }}</template>
        </p>
      </div>

      <UCard v-if="player.days.length === 0">
        <p class="text-muted">
          Este jugador todavía no tiene una rutina asignada.
          <NuxtLink to="/coach/programs" class="text-primary dark:text-clubred-300 underline">
            Asignale un programa
          </NuxtLink>
          y va a poder registrar sus días.
        </p>
      </UCard>

      <template v-else>
        <p class="text-sm text-muted">
          Cerró <strong class="text-default">{{ player.daysDone }}</strong> de
          {{ player.daysTotal }} días de esta semana.
        </p>

        <UCard v-for="day in player.days" :key="day.dayId">
          <template #header>
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 class="font-medium">{{ day.dayName }}</h2>
                <p class="text-sm text-muted">
                  {{ day.completedAt ? `Cerrado el ${formatDate(day.completedAt)}` : 'Sin cerrar' }}
                </p>
              </div>
              <!--
                El badge va UNA vez por día: desde F3.5 el RPE percibido es del
                día, no del ejercicio, así que no hay contra qué compararlo fila
                por fila.
              -->
              <RpeBadge :target-rpe="day.targetRpe" :perceived-rpe="day.perceivedRpe" />
            </div>
          </template>

          <!--
            La nota es la mitad del valor de esta pantalla: el RPE dice cuánto
            costó, la nota dice por qué.
          -->
          <UAlert
            v-if="day.note"
            icon="i-lucide-message-square-plus"
            color="neutral"
            variant="subtle"
            :description="day.note"
            class="mb-4"
          />

          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-muted">
                  <th class="pb-2 font-medium">Ejercicio</th>
                  <th class="pb-2 font-medium">Planificado</th>
                  <th class="pb-2 font-medium">Hecho</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="ex in day.exercises"
                  :key="ex.blockExerciseId"
                  class="border-t border-default"
                >
                  <td class="py-2">{{ ex.exerciseName }}</td>
                  <td class="py-2 text-muted">
                    {{ ex.sets ?? '—' }} × {{ ex.reps ?? '—' }}
                    <template v-if="ex.targetRpe !== null"> · RPE {{ ex.targetRpe }}</template>
                  </td>
                  <td class="py-2">
                    <template v-if="ex.weight !== null || ex.loggedReps !== null">
                      {{ ex.weight ?? '—' }} kg · {{ ex.loggedReps ?? '—' }} reps
                    </template>
                    <span v-else class="text-muted">Sin registrar</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>
      </template>
    </template>
  </div>
</template>
