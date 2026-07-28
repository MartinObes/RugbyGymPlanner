<script setup lang="ts">
import type { CoachPlayersResponse } from '~~/generated'

const { user } = useAuth()

// En SSR el fetch interno no arrastra la cookie solo: se reenvía explícita.
const { data, error } = await useFetch<CoachPlayersResponse>('/api/coach/players', {
  headers: useRequestHeaders(['cookie']),
})

const copied = ref(false)
async function copyCode() {
  if (!user.value?.inviteCode) return
  await navigator.clipboard.writeText(user.value.inviteCode)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Plantel</h1>

    <!-- Lo primero que un coach recién registrado necesita: su código. -->
    <UCard v-if="user?.inviteCode">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p class="text-sm text-muted">Tu código de invitación</p>
          <p class="font-mono text-3xl font-bold tracking-widest">{{ user.inviteCode }}</p>
        </div>
        <UButton
          :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
          color="neutral"
          variant="outline"
          @click="copyCode"
        >
          {{ copied ? 'Copiado' : 'Copiar' }}
        </UButton>
      </div>
      <p class="mt-3 text-sm text-muted">
        Pasáselo a tus jugadores: lo ingresan al registrarse y quedan en tu plantel.
      </p>
    </UCard>

    <UAlert
      v-if="error"
      color="error"
      title="No se pudo cargar el plantel"
      :description="error.message"
    />

    <UCard v-else-if="data && data.players.length === 0">
      <p class="text-muted">
        Todavía no hay jugadores. Compartí tu código y van a aparecer acá al registrarse.
      </p>
    </UCard>

    <UCard v-else-if="data">
      <ul class="divide-y divide-default">
        <li v-for="player in data.players" :key="player.id" class="flex items-center gap-3 py-3">
          <UIcon name="i-lucide-user" class="size-5 text-muted" />
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium">{{ player.name }}</p>
            <p class="truncate text-sm text-muted">{{ player.email }}</p>
          </div>
          <span class="text-sm text-muted">{{ player.positionId ?? 'Sin puesto' }}</span>
        </li>
      </ul>
    </UCard>
  </div>
</template>
