<script setup lang="ts">
import type { HealthResponse } from '~~/generated'

// Página de humo de F0: confirma de punta a punta que Nuxt SSR llega a la app
// Hono y que la app Hono llega a Postgres. Se reemplaza por el login en F1.
//
// El tipo NO se escribe a mano: sale de `~~/generated`, que hey-api produce
// desde el schema Zod de la ruta. Si el contrato cambia, esto deja de compilar.
// Nitro no puede inferirlo solo porque la API entra por un catch-all que
// devuelve un Response opaco.
const { data, error } = await useFetch<HealthResponse>('/api/health')

const DB_LABEL: Record<string, string> = {
  ok: 'Conectada',
  error: 'Responde con error',
  unconfigured: 'Falta configurar SUPABASE_URL y SUPABASE_ANON_KEY',
}
</script>

<template>
  <UContainer class="py-16">
    <h1 class="text-2xl font-bold">CoachLab</h1>
    <p class="mt-1 text-neutral-500">Fase 0 — el esqueleto está en pie.</p>

    <UAlert
      v-if="error"
      class="mt-8"
      color="error"
      title="No se pudo hablar con la API"
      :description="error.message"
    />

    <dl v-else class="mt-8 grid gap-3">
      <div class="flex items-center gap-3">
        <dt class="w-28 text-neutral-500">Servicio</dt>
        <dd class="font-mono">{{ data?.service }}</dd>
      </div>
      <div class="flex items-center gap-3">
        <dt class="w-28 text-neutral-500">Base</dt>
        <dd>
          <UBadge :color="data?.db === 'ok' ? 'success' : 'warning'" variant="subtle">
            {{ data ? (DB_LABEL[data.db] ?? data.db) : '—' }}
          </UBadge>
        </dd>
      </div>
    </dl>
  </UContainer>
</template>
