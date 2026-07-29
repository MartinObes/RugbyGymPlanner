<script setup lang="ts">
import type { CoachPlayersResponse } from '~~/generated'
import { positionById } from '@coachlab/core/domain/positions'

const { user } = useAuth()
const api = useCoachApi()
const toast = useToast()

const { data, error, refresh } = await useAsyncData('coach-players', () =>
  api.get<CoachPlayersResponse>('/api/coach/players'),
)

const copied = ref(false)
async function copyCode() {
  if (!user.value?.inviteCode) return
  await navigator.clipboard.writeText(user.value.inviteCode)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

const releasing = ref<string | null>(null)
const confirming = ref<{ id: string; name: string } | null>(null)

// UModal espera un boolean en v-model:open; el objeto guarda a quién se saca.
const confirmOpen = computed({
  get: () => confirming.value !== null,
  set: (value: boolean) => {
    if (!value) confirming.value = null
  },
})

async function release() {
  if (!confirming.value) return
  releasing.value = confirming.value.id
  try {
    await api.post(`/api/coach/players/${confirming.value.id}/release`)
    toast.add({ title: `${confirming.value.name} salió del plantel`, color: 'success' })
    confirming.value = null
    await refresh()
  } catch (e) {
    toast.add({
      title: 'No se pudo sacar del plantel',
      description: e instanceof Error ? e.message : undefined,
      color: 'error',
    })
  } finally {
    releasing.value = null
  }
}

const positionName = (id: string | null) => (id ? (positionById(id)?.name ?? id) : 'Sin puesto')
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
          <NuxtLink :to="`/coach/players/${player.id}`" class="flex min-w-0 flex-1 items-center gap-3">
            <UIcon name="i-lucide-user" class="size-5 shrink-0 text-muted" />
            <div class="min-w-0">
              <p class="truncate font-medium">{{ player.name }}</p>
              <p class="truncate text-sm text-muted">{{ player.email }}</p>
            </div>
          </NuxtLink>

          <span class="hidden text-sm text-muted sm:block">{{ positionName(player.positionId) }}</span>

          <UButton
            icon="i-lucide-user-minus"
            color="neutral"
            variant="ghost"
            size="sm"
            :loading="releasing === player.id"
            aria-label="Sacar del plantel"
            @click="confirming = { id: player.id, name: player.name }"
          />
        </li>
      </ul>
    </UCard>

    <UModal v-model:open="confirmOpen" :title="`¿Sacar a ${confirming?.name} del plantel?`">
      <template #body>
        <p class="text-sm text-muted">
          No se borra la cuenta ni su historial: queda sin entrenador y puede volver a entrar con un
          código de invitación. Sus asignaciones directas a tus programas se van a quitar.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="confirming = null">Cancelar</UButton>
          <UButton color="error" :loading="releasing !== null" @click="release">
            Sacar del plantel
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
