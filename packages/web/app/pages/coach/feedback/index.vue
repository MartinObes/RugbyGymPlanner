<script setup lang="ts">
import type { FeedbackListResponse } from '~~/generated'
import { positionById } from '@coachlab/core/domain/positions'
import { normName } from '@coachlab/core/domain/normName'

const api = useCoachApi()

const { data, error, refresh, status } = await useAsyncData('coach-feedback', () =>
  api.get<FeedbackListResponse>('/api/coach/feedback'),
)

// Mismo buscador que el plantel: a 40–60 jugadores, encontrar uno sin buscador
// es scrollear a ciegas. normName tolera acentos.
const search = ref('')
const players = computed(() => {
  const all = data.value?.players ?? []
  const query = normName(search.value)
  if (!query) return all
  return all.filter((p) => normName(p.playerName).includes(query))
})

// La semana es la misma para todo el plantel (programs.current_week_id es global
// al programa), así que se muestra una vez en el encabezado y no por fila.
const weekName = computed(() => data.value?.players.find((p) => p.weekName)?.weekName ?? null)

const positionName = (id: string | null) => (id ? (positionById(id)?.name ?? id) : 'Sin puesto')

/** "+1.5 promedio · 2 pesados". Sin días comparables no inventa un número. */
function rpeLabel(rpe: FeedbackListResponse['players'][number]['rpe']): string {
  if (rpe.comparable === 0 || rpe.averageDelta === null) return 'Sin datos'

  const sign = rpe.averageDelta > 0 ? '+' : ''
  const parts = [`${sign}${rpe.averageDelta} promedio`]
  if (rpe.heavy > 0) parts.push(`${rpe.heavy} pesado${rpe.heavy > 1 ? 's' : ''}`)
  if (rpe.light > 0) parts.push(`${rpe.light} liviano${rpe.light > 1 ? 's' : ''}`)
  return parts.join(' · ')
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold">Cómo viene el plantel</h1>
      <p v-if="weekName" class="text-sm text-muted">{{ weekName }}</p>
    </div>

    <UAlert v-if="error" color="error" title="No se pudo cargar el feedback">
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

    <UCard v-else-if="data && data.players.length === 0">
      <p class="text-muted">
        Todavía no tenés jugadores en el plantel.
        <NuxtLink to="/coach/players" class="text-primary dark:text-clubred-300 underline">
          Compartí tu código de invitación
        </NuxtLink>
        y cuando registren un día lo vas a ver acá.
      </p>
    </UCard>

    <div v-else-if="data" class="space-y-3">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Buscá por nombre…"
        class="w-full sm:max-w-xs"
      />

      <p v-if="players.length === 0" class="text-muted">
        Ningún jugador coincide con "{{ search }}".
      </p>

      <!--
        Cards en mobile, tabla en sm: y arriba. Una tabla de 6 columnas a 380 px
        no se lee, y esta pantalla se mira desde el gimnasio.
      -->
      <div v-else class="space-y-3 sm:hidden">
        <UCard v-for="player in players" :key="player.playerId">
          <NuxtLink :to="`/coach/feedback/${player.playerId}`" class="block space-y-2">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate font-medium">{{ player.playerName }}</p>
                <p class="truncate text-sm text-muted">{{ positionName(player.positionId) }}</p>
              </div>
              <span class="shrink-0 text-lg font-semibold tabular-nums">
                {{ player.daysDone }}/{{ player.daysTotal }}
              </span>
            </div>

            <p class="text-sm text-muted">{{ rpeLabel(player.rpe) }}</p>

            <p v-if="player.lastNote" class="text-sm">
              <span class="text-muted">{{ player.lastNote.dayName }}:</span>
              {{ player.lastNote.note }}
            </p>
          </NuxtLink>
        </UCard>
      </div>

      <UCard v-if="players.length > 0" class="hidden sm:block">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-muted">
                <th class="pb-2 font-medium">Jugador</th>
                <th class="pb-2 font-medium">Puesto</th>
                <th class="pb-2 font-medium">Días</th>
                <th class="pb-2 font-medium">RPE</th>
                <th class="pb-2 font-medium">Última nota</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="player in players"
                :key="player.playerId"
                class="border-t border-default align-top"
              >
                <td class="py-3">
                  <NuxtLink
                    :to="`/coach/feedback/${player.playerId}`"
                    class="font-medium text-primary dark:text-clubred-300 hover:underline"
                  >
                    {{ player.playerName }}
                  </NuxtLink>
                </td>
                <td class="py-3 text-muted">{{ positionName(player.positionId) }}</td>
                <td class="py-3 font-semibold tabular-nums">
                  {{ player.daysDone }}/{{ player.daysTotal }}
                </td>
                <td class="py-3">{{ rpeLabel(player.rpe) }}</td>
                <td class="py-3 text-muted">
                  <span v-if="player.lastNote" class="line-clamp-2">
                    {{ player.lastNote.note }}
                  </span>
                  <span v-else>—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>
    </div>
  </div>
</template>
