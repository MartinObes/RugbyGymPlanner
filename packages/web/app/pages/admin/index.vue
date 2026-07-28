<script setup lang="ts">
import type { AdminStatsResponse } from '~~/generated'

const { data, error } = await useFetch<AdminStatsResponse>('/api/admin/stats', {
  headers: useRequestHeaders(['cookie']),
})

const CARDS = [
  { key: 'coaches', label: 'Entrenadores', icon: 'i-lucide-clipboard-list' },
  { key: 'players', label: 'Jugadores', icon: 'i-lucide-users' },
  { key: 'admins', label: 'Admins', icon: 'i-lucide-shield' },
  { key: 'exercises', label: 'Ejercicios', icon: 'i-lucide-dumbbell' },
] as const
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Administración</h1>

    <UAlert v-if="error" color="error" title="No se pudo cargar" :description="error.message" />

    <div v-else-if="data" class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <UCard v-for="card in CARDS" :key="card.key">
        <div class="flex items-center gap-3">
          <UIcon :name="card.icon" class="size-6 text-muted" />
          <div>
            <p class="text-2xl font-bold">{{ data.stats[card.key] }}</p>
            <p class="text-sm text-muted">{{ card.label }}</p>
          </div>
        </div>
      </UCard>
    </div>

    <p class="text-sm text-muted">
      El CRUD del catálogo de ejercicios queda fuera del MVP: se gestiona con el seed.
    </p>
  </div>
</template>
