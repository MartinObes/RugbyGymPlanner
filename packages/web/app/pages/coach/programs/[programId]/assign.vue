<script setup lang="ts">
import { POSITIONS, SYSTEM_GROUPS, positionById } from '@coachlab/core/domain/positions'
import { BASE_PRIORITY } from '@coachlab/core/domain/resolveProgram'
import type {
  AssignmentPreviewResponse,
  AssignmentsResponse,
  CoachPlayersResponse,
  GroupsResponse,
  ProgramTreeResponse,
} from '~~/generated'

type ProgramContext = {
  program: Ref<ProgramTreeResponse['program'] | null>
  refresh: () => Promise<void>
  programId: string
}

const { programId } = inject<ProgramContext>('program')!
const api = useCoachApi()
const toast = useToast()

const { data: assignments, refresh: refreshAssignments } = await useAsyncData(
  `assignments-${programId}`,
  () => api.get<AssignmentsResponse>(`/api/coach/programs/${programId}/assignments`),
)

const { data: preview, refresh: refreshPreview } = await useAsyncData('assignment-preview', () =>
  api.get<AssignmentPreviewResponse>('/api/coach/assignments/preview'),
)

const { data: roster } = await useAsyncData('coach-players', () =>
  api.get<CoachPlayersResponse>('/api/coach/players'),
)

const { data: groups } = await useAsyncData('coach-groups', () =>
  api.get<GroupsResponse>('/api/coach/groups'),
)

// --- form de alta ------------------------------------------------------------

type Mode = 'PLAYER' | 'POSITION' | 'SYSTEM_GROUP' | 'POSITION_GROUP'

const MODE_ITEMS = [
  { label: 'Un jugador', value: 'PLAYER' },
  { label: 'Un puesto', value: 'POSITION' },
  { label: 'Forwards / Backs', value: 'SYSTEM_GROUP' },
  { label: 'Un grupo propio', value: 'POSITION_GROUP' },
]

const mode = ref<Mode>('POSITION')
// undefined y no null: es lo que USelect entiende como "sin elegir".
const target = ref<string | undefined>(undefined)
const priority = ref(0)
const saving = ref(false)

watch(mode, () => {
  target.value = undefined
})

const targetItems = computed(() => {
  if (mode.value === 'PLAYER') {
    return (roster.value?.players ?? []).map((p) => ({ label: p.name, value: p.id }))
  }
  if (mode.value === 'POSITION') {
    return POSITIONS.map((p) => ({ label: p.name, value: p.id as string }))
  }
  if (mode.value === 'SYSTEM_GROUP') {
    return SYSTEM_GROUPS.map((g) => ({ label: g.name, value: g.id as string }))
  }
  return (groups.value?.groups ?? [])
    .filter((g) => !g.isSystem)
    .map((g) => ({ label: g.name, value: g.id }))
})

const basePriorityForMode = computed(() => BASE_PRIORITY[mode.value])

async function create() {
  if (!target.value) return
  saving.value = true
  const body: Record<string, unknown> = { priority: priority.value }
  if (mode.value === 'PLAYER') body.playerId = target.value
  if (mode.value === 'POSITION') body.positionId = target.value
  if (mode.value === 'SYSTEM_GROUP') body.systemGroupId = target.value
  if (mode.value === 'POSITION_GROUP') body.positionGroupId = target.value

  try {
    await api.post(`/api/coach/programs/${programId}/assignments`, body)
    target.value = undefined
    priority.value = 0
    await Promise.all([refreshAssignments(), refreshPreview()])
  } catch (e) {
    toast.add({
      title: 'No se pudo asignar',
      description: e instanceof Error ? e.message : undefined,
      color: 'error',
    })
  } finally {
    saving.value = false
  }
}

async function remove(id: string) {
  try {
    await api.del(`/api/coach/assignments/${id}`)
    await Promise.all([refreshAssignments(), refreshPreview()])
  } catch (e) {
    toast.add({
      title: 'No se pudo quitar',
      description: e instanceof Error ? e.message : undefined,
      color: 'error',
    })
  }
}

const KIND_LABEL: Record<string, string> = {
  PLAYER: 'Jugador',
  POSITION_GROUP: 'Grupo propio',
  SYSTEM_GROUP: 'Del sistema',
  POSITION: 'Puesto',
}

const positionName = (id: string | null) => (id ? (positionById(id)?.name ?? id) : 'Sin puesto')
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <h2 class="font-semibold">Asignar este programa</h2>
      </template>

      <div class="flex flex-wrap items-end gap-3">
        <UFormField label="Asignar a">
          <USelect v-model="mode" :items="MODE_ITEMS" class="w-44" />
        </UFormField>

        <UFormField label="Destino" class="min-w-48 flex-1">
          <USelect v-model="target" :items="targetItems" placeholder="Elegí…" class="w-full" />
        </UFormField>

        <UFormField label="Prioridad extra" :hint="`base ${basePriorityForMode}`">
          <UInput v-model.number="priority" type="number" min="-100" max="500" class="w-24" />
        </UFormField>

        <UButton :disabled="!target" :loading="saving" @click="create">Asignar</UButton>
      </div>

      <p class="mt-3 text-sm text-muted">
        Cuando a un jugador le llegan varios programas gana el de mayor prioridad. Las bases son:
        jugador {{ BASE_PRIORITY.PLAYER }}, grupo propio {{ BASE_PRIORITY.POSITION_GROUP }},
        Forwards/Backs {{ BASE_PRIORITY.SYSTEM_GROUP }}, puesto {{ BASE_PRIORITY.POSITION }}. La
        prioridad extra se suma a la base.
      </p>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold">Asignaciones de este programa</h2>
      </template>

      <p v-if="!assignments || assignments.assignments.length === 0" class="text-muted">
        Este programa todavía no está asignado a nadie.
      </p>

      <ul v-else class="divide-y divide-default">
        <li
          v-for="assignment in assignments.assignments"
          :key="assignment.id"
          class="flex items-center gap-3 py-2"
        >
          <UBadge color="neutral" variant="subtle">{{ KIND_LABEL[assignment.kind] }}</UBadge>
          <span class="min-w-0 flex-1 truncate font-medium">{{ assignment.targetName }}</span>
          <span class="font-mono text-sm text-muted">
            {{ assignment.basePriority }}
            <template v-if="assignment.priority !== 0">
              {{ assignment.priority > 0 ? '+' : '−' }} {{ Math.abs(assignment.priority) }}
            </template>
            = {{ assignment.totalPriority }}
          </span>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Quitar"
            @click="remove(assignment.id)"
          />
        </li>
      </ul>
    </UCard>

    <!-- Lo que evita descubrir un conflicto de prioridades cuando un jugador se queja -->
    <UCard>
      <template #header>
        <div>
          <h2 class="font-semibold">Qué le queda a cada jugador</h2>
          <p class="mt-1 text-sm text-muted">
            Resultado de resolver todas las prioridades de todos tus programas.
          </p>
        </div>
      </template>

      <p v-if="!preview || preview.rows.length === 0" class="text-muted">
        Todavía no tenés jugadores en el plantel.
      </p>

      <ul v-else class="divide-y divide-default">
        <li v-for="row in preview.rows" :key="row.playerId" class="flex items-center gap-3 py-2">
          <span class="min-w-0 flex-1 truncate">{{ row.name }}</span>
          <span class="hidden text-sm text-muted sm:block">{{ positionName(row.positionId) }}</span>
          <UBadge
            v-if="row.programId"
            :color="row.programId === programId ? 'primary' : 'neutral'"
            variant="subtle"
          >
            {{ row.programName ?? 'Programa' }}
          </UBadge>
          <span v-else class="text-sm text-muted">Sin programa</span>
        </li>
      </ul>
    </UCard>
  </div>
</template>
