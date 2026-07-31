<script setup lang="ts">
import type { PlayerDashboardResponse } from '~~/generated'

const api = usePlayerApi()

const { data } = await useAsyncData('player-dashboard', () =>
  api.get<PlayerDashboardResponse>('/api/player/dashboard'),
)
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h1 class="text-xl font-bold text-navy-500 dark:text-highlighted">
        {{ data?.programName ?? 'Mi entrenamiento' }}
      </h1>
      <UBadge v-if="data?.weekName" color="neutral" variant="subtle">{{ data.weekName }}</UBadge>
    </div>

    <PlayerProgressRing
      v-if="data"
      :completed="data.progress.completed"
      :total="data.progress.total"
      :ratio="data.progress.ratio"
    />

    <div v-if="data?.trends.length">
      <h2 class="mb-2 text-sm font-semibold">Tus tests de fuerza</h2>
      <!-- Fila horizontal scrolleable: en 380 px entran dos y media, y el corte
           invita a arrastrar sin necesitar una flecha. -->
      <div class="flex gap-2.5 overflow-x-auto pb-1.5">
        <PlayerEvaluationCard
          v-for="trend in data.trends"
          :key="trend.exerciseId"
          :trend="trend"
        />
      </div>
    </div>
    <UCard v-else>
      <p class="text-sm text-muted">
        Todavía no tenés tests de fuerza cargados. Cargalos en
        <NuxtLink to="/player/profile" class="text-primary underline">Mi perfil</NuxtLink>
        y acá vas a ver si vas mejorando.
      </p>
    </UCard>

    <UButton to="/player/week" block size="lg" trailing-icon="i-lucide-chevron-right">
      Ir a Mi semana
    </UButton>
  </div>
</template>
