<script setup lang="ts">
import type { PlayerProgramsResponse, PlayerWeekResponse } from '~~/generated'

const { user } = useAuth()
const api = usePlayerApi()
const toast = useToast()

const weekAsync = useAsyncData('player-week', () =>
  api.get<PlayerWeekResponse>('/api/player/week'),
)
const programsAsync = useAsyncData('player-programs', () =>
  api.get<PlayerProgramsResponse>('/api/player/programs'),
)

// Las dos cargas salen juntas: un `await` en el setup frena el siguiente, y cada
// request autenticada paga antes el preámbulo de withActor
// (docs/PERFORMANCE-F4.md).
await Promise.all([weekAsync, programsAsync])

const { data, error, refresh } = weekAsync
const { data: programsData, refresh: refreshPrograms } = programsAsync

const week = computed(() => data.value?.week ?? null)

// El selector sólo aparece con más de una rutina: con una sola, un selector de
// un elemento es ruido (F4-B §2.3).
const programs = computed(() => programsData.value?.programs ?? [])
const selected = ref<string | undefined>(undefined)

watchEffect(() => {
  selected.value = programs.value.find((p) => p.current)?.programId
})

const switching = ref(false)

async function onSelect(programId: string) {
  switching.value = true
  try {
    await api.put('/api/player/programs/selected', { programId })
    await Promise.all([refresh(), refreshPrograms()])
  } catch (e) {
    toast.add({
      title: 'No se pudo cambiar la rutina',
      description: e instanceof Error ? e.message : undefined,
      color: 'error',
    })
    // Volver al que estaba: si no, el selector muestra algo que no se guardó.
    selected.value = programs.value.find((p) => p.current)?.programId
  } finally {
    switching.value = false
  }
}

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
      <!-- navy: contexto estructural (qué semana del programa), no un estado. -->
      <UBadge v-if="week" color="navy" variant="subtle" class="mt-1">
        {{ week.weekName }}
      </UBadge>
    </div>

    <!--
      Volver a otra rutina asignada. La elección dura hasta que el entrenador
      asigne algo nuevo, y ahí se resetea sola: la prescripción del coach siempre
      gana (F4-B §2.3).
    -->
    <div v-if="programs.length > 1" class="space-y-1">
      <USelect
        v-model="selected"
        :items="programs.map((p) => ({ label: p.name, value: p.programId }))"
        :loading="switching"
        class="w-full"
        aria-label="Elegí qué rutina querés ver"
        @update:model-value="onSelect"
      />
      <p class="text-xs text-muted">
        Tu entrenador puede cambiarte la rutina en cualquier momento.
      </p>
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

    <!-- Un fetch fallido no es "no tenés programa": eso llevaría al jugador a
         pensar que perdió su rutina en vez de que tiene mal el wifi del gimnasio. -->
    <UCard v-if="error">
      <div class="flex flex-col items-center gap-2 py-6 text-center">
        <UIcon name="i-lucide-triangle-alert" class="size-8 text-error" />
        <p class="text-sm text-muted">
          No se pudo cargar tu semana. Revisá tu conexión y volvé a intentar.
        </p>
        <UButton color="neutral" variant="outline" size="sm" @click="() => refresh()">
          Volver a intentar
        </UButton>
      </div>
    </UCard>

    <UCard v-else-if="week === null && user?.coachId">
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
          <!-- Se deja neutral a propósito: "Sin empezar" es AUSENCIA de estado,
               no un estado en sí. Pintarlo insinuaría algo que no pasó todavía. -->
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
