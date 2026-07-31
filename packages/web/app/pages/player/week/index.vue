<script setup lang="ts">
import type { PlayerWeekResponse } from '~~/generated'

const { user } = useAuth()
const api = usePlayerApi()

const { data } = await useAsyncData('player-week', () =>
  api.get<PlayerWeekResponse>('/api/player/week'),
)

const week = computed(() => data.value?.week ?? null)

/** Los 1RM que faltan en toda la semana, no solo en un día. */
const missingOneRms = computed(() => [
  ...new Set((week.value?.days ?? []).flatMap((day) => day.missingOneRms)),
])

/**
 * El estado de un día. Tres, y se distinguen de un vistazo:
 *   - completado: el jugador lo cerró
 *   - empezado: registró algo pero no lo cerró
 *   - sin empezar
 *
 * El texto dice "registrados" y no "hechos": no hay checkbox por ejercicio, así
 * que la app sabe qué anotó y no qué hizo (docs/DESIGN-SYSTEM.md §1).
 */
type Day = NonNullable<PlayerWeekResponse['week']>['days'][number]

function stateOf(day: Day) {
  if (day.completed) return 'completed' as const
  return day.loggedCount > 0 ? ('started' as const) : ('fresh' as const)
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <h1 class="text-lg font-bold text-navy-500 dark:text-highlighted">
        {{ week?.programName ?? 'Mi semana' }}
      </h1>
      <UBadge v-if="week" color="neutral" variant="subtle" class="mt-1">
        {{ week.weekName }}
      </UBadge>
    </div>

    <!-- Jugador sin coach: el trigger no vincula si el código no matcheó. -->
    <UAlert
      v-if="user && !user.coachId"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Tu cuenta no está vinculada a un entrenador"
      description="Pedile el código a tu entrenador y cargalo en Mi perfil."
    />

    <UAlert
      v-else-if="missingOneRms.length > 0"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="`Faltan tus 1RM de ${missingOneRms.join(', ')}`"
      description="Cargalos en Mi perfil para ver los kg de cada serie."
    />

    <UCard v-if="week === null && user?.coachId">
      <div class="flex flex-col items-center gap-2 py-6 text-center">
        <UIcon name="i-lucide-calendar-x" class="size-8 text-muted" />
        <p class="text-sm text-muted">
          Todavía no tenés un programa asignado. Cuando tu entrenador te asigne uno, lo vas a ver acá.
        </p>
      </div>
    </UCard>

    <div v-if="week" class="space-y-2.5">
      <NuxtLink
        v-for="day in week.days"
        :key="day.id"
        :to="`/player/week/${day.id}`"
        class="block rounded-xl border border-default bg-default p-3.5 hover:border-accented"
      >
        <div class="flex items-start justify-between gap-2">
          <div>
            <p class="font-semibold">{{ day.name }}</p>
            <p class="mt-0.5 text-xs text-muted">{{ day.totalCount }} ejercicios</p>
          </div>

          <UBadge v-if="stateOf(day) === 'completed'" color="success" variant="subtle">
            <UIcon name="i-lucide-check" class="size-3" />
            Completada
          </UBadge>
          <UBadge v-else-if="stateOf(day) === 'started'" color="primary" variant="subtle">
            {{ day.loggedCount }}/{{ day.totalCount }} registrados
          </UBadge>
          <UBadge v-else color="neutral" variant="subtle">Sin empezar</UBadge>
        </div>

        <!-- La barra solo en "empezado": en los otros dos el badge ya lo dice todo
             y una barra vacía o llena es ruido. -->
        <div
          v-if="stateOf(day) === 'started'"
          class="mt-2.5 h-1.5 overflow-hidden rounded-full bg-accented"
        >
          <div
            class="h-full bg-primary"
            :style="{ width: `${Math.round((day.loggedCount / Math.max(1, day.totalCount)) * 100)}%` }"
          />
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
