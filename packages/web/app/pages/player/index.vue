<script setup lang="ts">
import type { PlayerDashboardResponse } from '~~/generated'

const api = usePlayerApi()

const { data, error, refresh } = await useAsyncData('player-dashboard', () =>
  api.get<PlayerDashboardResponse>('/api/player/dashboard'),
)
</script>

<template>
  <div class="space-y-5">
    <!-- Un fetch fallido no es lo mismo que "no tenés nada": sin esto un wifi
         flojo de gimnasio se leía como "perdiste tu progreso". -->
    <UCard v-if="error">
      <div class="flex flex-col items-center gap-2 py-6 text-center">
        <UIcon name="i-lucide-triangle-alert" class="size-8 text-error" />
        <p class="text-sm text-muted">
          No se pudo cargar tu entrenamiento. Revisá tu conexión y volvé a intentar.
        </p>
        <UButton color="neutral" variant="outline" size="sm" @click="() => refresh()">
          Volver a intentar
        </UButton>
      </div>
    </UCard>

    <template v-else>
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h1 class="text-xl font-bold text-navy-500 dark:text-highlighted">
          {{ data?.programName ?? 'Mi entrenamiento' }}
        </h1>
        <!-- navy: es contexto estructural (qué semana del programa), no un
             estado — DESIGN-SYSTEM §3.2 usa navy para eso. -->
        <UBadge v-if="data?.weekName" color="navy" variant="subtle">{{ data.weekName }}</UBadge>
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
          <!-- dark:text-clubred-300: clubred-400 (vía text-primary) da 2.40:1 en
               oscuro sobre el fondo de página, abajo del AA. El 300 da 5.07:1. -->
          <NuxtLink to="/player/profile" class="text-primary underline dark:text-clubred-300">
            Mi perfil
          </NuxtLink>
          y acá vas a ver si vas mejorando.
        </p>
      </UCard>

      <UButton to="/player/week" block size="lg" trailing-icon="i-lucide-chevron-right">
        Ir a Mi semana
      </UButton>
    </template>
  </div>
</template>
