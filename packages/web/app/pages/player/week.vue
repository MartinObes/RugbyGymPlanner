<script setup lang="ts">
import type { PlayerWeekResponse } from '~~/generated'

const { user } = useAuth()
const api = usePlayerApi()

const { data, refresh } = await useAsyncData('player-week', () =>
  api.get<PlayerWeekResponse>('/api/player/week'),
)

const week = computed(() => data.value?.week ?? null)

/** Los 1RM que faltan en toda la semana, no solo en un día. */
const missingOneRms = computed(() => [
  ...new Set((week.value?.days ?? []).flatMap((day) => day.missingOneRms)),
])
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h1 class="text-2xl font-bold">Mi semana</h1>
      <p v-if="week" class="text-sm text-muted">{{ week.programName }} · {{ week.weekName }}</p>
    </div>

    <!-- Jugador sin coach: el trigger no vincula si el código no matcheó. -->
    <UAlert
      v-if="user && !user.coachId"
      color="warning"
      variant="subtle"
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
      <p class="text-muted">
        Todavía no tenés un programa asignado. Cuando tu entrenador te asigne uno, lo vas a ver acá.
      </p>
    </UCard>

    <div v-if="week" class="space-y-4">
      <PlayerDayCard v-for="day in week.days" :key="day.id" :day="day" @changed="refresh()" />
    </div>
  </div>
</template>
