<script setup lang="ts">
import { sortByOrderIndex } from '@coachlab/core/domain/tree'
import type { ExercisesResponse, ProgramTreeResponse } from '~~/generated'

type ProgramContext = {
  program: Ref<ProgramTreeResponse['program'] | null>
  refresh: () => Promise<void>
  programId: string
}

// El padre ([programId].vue) ya cargó el programa: acá no se vuelve a pedir.
const { program, refresh, programId } = inject<ProgramContext>('program')!

const api = useCoachApi()
const toast = useToast()

const { data: catalog } = await useAsyncData('catalog-exercises', () =>
  api.get<ExercisesResponse>('/api/catalog/exercises'),
)
const exercises = computed(() => catalog.value?.exercises ?? [])

const weeks = computed(() =>
  sortByOrderIndex((program.value?.weeks ?? []).map((w) => ({ ...w, order_index: w.orderIndex }))),
)

const activeWeekId = ref<string | null>(null)
watch(
  weeks,
  (list) => {
    const stillThere = list.some((w) => w.id === activeWeekId.value)
    if (!stillThere) activeWeekId.value = program.value?.currentWeekId ?? list[0]?.id ?? null
  },
  { immediate: true },
)

const activeWeek = computed(() => weeks.value.find((w) => w.id === activeWeekId.value) ?? null)

const days = computed(() =>
  sortByOrderIndex((activeWeek.value?.days ?? []).map((d) => ({ ...d, order_index: d.orderIndex }))),
)

const busy = ref(false)
const msg = (e: unknown) => (e instanceof Error ? e.message : undefined)

async function addWeek() {
  busy.value = true
  try {
    await api.post(`/api/coach/programs/${programId}/weeks`, {
      name: `Semana ${weeks.value.length + 1}`,
    })
    await refresh()
  } catch (e) {
    toast.add({ title: 'No se pudo agregar la semana', description: msg(e), color: 'error' })
  } finally {
    busy.value = false
  }
}

async function markCurrent(weekId: string) {
  try {
    await api.patch(`/api/coach/programs/${programId}`, { currentWeekId: weekId })
    await refresh()
  } catch (e) {
    toast.add({ title: 'No se pudo marcar la semana', description: msg(e), color: 'error' })
  }
}

async function renameWeek(weekId: string, name: string) {
  const next = name.trim()
  if (!next) return
  try {
    await api.patch(`/api/coach/weeks/${weekId}`, { name: next })
    await refresh()
  } catch (e) {
    toast.add({ title: 'No se pudo renombrar', description: msg(e), color: 'error' })
  }
}

async function removeWeek(weekId: string) {
  try {
    await api.del(`/api/coach/weeks/${weekId}`)
    await refresh()
  } catch (e) {
    toast.add({ title: 'No se pudo borrar la semana', description: msg(e), color: 'error' })
  }
}

async function addDay() {
  if (!activeWeekId.value) return
  busy.value = true
  try {
    await api.post(`/api/coach/weeks/${activeWeekId.value}/days`, {
      name: `Día ${days.value.length + 1}`,
    })
    await refresh()
  } catch (e) {
    toast.add({ title: 'No se pudo agregar el día', description: msg(e), color: 'error' })
  } finally {
    busy.value = false
  }
}

const renamingWeek = ref<string | null>(null)
const weekNameDraft = ref('')
</script>

<template>
  <div class="space-y-4">
    <!-- Semanas -->
    <div class="flex flex-wrap items-center gap-2">
      <div
        v-for="week in weeks"
        :key="week.id"
        :class="[
          'flex items-center gap-1 rounded-md border px-2 py-1',
          week.id === activeWeekId ? 'border-primary bg-elevated' : 'border-default',
        ]"
      >
        <UInput
          v-if="renamingWeek === week.id"
          v-model="weekNameDraft"
          variant="ghost"
          class="w-28"
          autofocus
          @blur="
            () => {
              renameWeek(week.id, weekNameDraft)
              renamingWeek = null
            }
          "
          @keydown.enter="
            () => {
              renameWeek(week.id, weekNameDraft)
              renamingWeek = null
            }
          "
        />
        <button
          v-else
          type="button"
          class="text-sm font-medium"
          @click="activeWeekId = week.id"
          @dblclick="
            () => {
              renamingWeek = week.id
              weekNameDraft = week.name
            }
          "
        >
          {{ week.name }}
        </button>

        <UBadge v-if="week.id === program?.currentWeekId" color="success" variant="subtle" size="sm">
          Actual
        </UBadge>
        <UButton
          v-else
          color="neutral"
          variant="ghost"
          size="xs"
          title="Marcar como semana actual"
          @click="markCurrent(week.id)"
        >
          Marcar
        </UButton>

        <UButton
          v-if="weeks.length > 1"
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Borrar semana"
          @click="removeWeek(week.id)"
        />
      </div>

      <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="sm" :loading="busy" @click="addWeek">
        Semana
      </UButton>
    </div>

    <p class="text-xs text-muted">
      Doble click en el nombre de una semana para renombrarla. La marcada como actual es la que ven
      los jugadores.
    </p>

    <!-- Días de la semana activa -->
    <div v-if="activeWeek" class="flex flex-col gap-4 lg:flex-row lg:overflow-x-auto lg:pb-2">
      <ProgramDayColumn
        v-for="day in days"
        :key="day.id"
        :day="day"
        :exercises="exercises"
        @changed="refresh"
      />

      <div class="shrink-0">
        <UButton icon="i-lucide-plus" color="neutral" variant="soft" :loading="busy" @click="addDay">
          Día
        </UButton>
      </div>
    </div>

    <UCard v-else>
      <p class="text-muted">Este programa no tiene semanas. Agregá una para empezar.</p>
    </UCard>
  </div>
</template>
