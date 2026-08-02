<script setup lang="ts">
import { SYSTEM_GROUPS, positionById } from '@coachlab/core/domain/positions'
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

/**
 * Las cuatro cargas salen JUNTAS, no una atrás de otra.
 *
 * Antes cada una llevaba su propio `await`, y un `await` en el `setup` frena el
 * siguiente: las cuatro requests se encadenaban. Y no son cuatro viajes, son
 * doce — cada request autenticada paga antes el preámbulo de `withActor`
 * (resolver la sesión + leer `profiles`), así que el costo fijo se multiplicaba
 * por cuatro **en serie**. Medido: ~30 ms por viaje con la conexión caliente,
 * 88–124 ms si hay que abrir TLS (docs/PERFORMANCE-F4.md).
 *
 * `useAsyncData` se sigue llamando de forma síncrona —Nuxt necesita eso para
 * registrar la carga y serializar el payload del SSR—; lo único que se movió es
 * el `await`, que ahora es uno solo para las cuatro.
 */
const assignmentsAsync = useAsyncData(`assignments-${programId}`, () =>
  api.get<AssignmentsResponse>(`/api/coach/programs/${programId}/assignments`),
)
const previewAsync = useAsyncData('assignment-preview', () =>
  api.get<AssignmentPreviewResponse>('/api/coach/assignments/preview'),
)
const rosterAsync = useAsyncData('coach-players', () =>
  api.get<CoachPlayersResponse>('/api/coach/players'),
)
const groupsAsync = useAsyncData('coach-groups', () =>
  api.get<GroupsResponse>('/api/coach/groups'),
)

await Promise.all([assignmentsAsync, previewAsync, rosterAsync, groupsAsync])

const { data: assignments, refresh: refreshAssignments } = assignmentsAsync
const { data: preview, refresh: refreshPreview } = previewAsync
const { data: roster } = rosterAsync
const { data: groups } = groupsAsync

// --- form de alta ------------------------------------------------------------

// Tres destinos desde F4-B §2.2: el puesto salió, porque un grupo propio de una
// sola posición hace lo mismo y ya existía.
type Mode = 'PLAYER' | 'SYSTEM_GROUP' | 'POSITION_GROUP'

const MODE_ITEMS = [
  { label: 'Un jugador', value: 'PLAYER' },
  { label: 'Forwards / Backs', value: 'SYSTEM_GROUP' },
  { label: 'Un grupo propio', value: 'POSITION_GROUP' },
]

const mode = ref<Mode>('SYSTEM_GROUP')
// undefined y no null: es lo que USelect entiende como "sin elegir".
const target = ref<string | undefined>(undefined)
const saving = ref(false)

watch(mode, () => {
  target.value = undefined
})

const targetItems = computed(() => {
  if (mode.value === 'PLAYER') {
    return (roster.value?.players ?? []).map((p) => ({ label: p.name, value: p.id }))
  }
  if (mode.value === 'SYSTEM_GROUP') {
    return SYSTEM_GROUPS.map((g) => ({ label: g.name, value: g.id as string }))
  }
  return (groups.value?.groups ?? [])
    .filter((g) => !g.isSystem)
    .map((g) => ({ label: g.name, value: g.id }))
})

async function create() {
  if (!target.value) return
  saving.value = true
  const body: Record<string, unknown> = {}
  if (mode.value === 'PLAYER') body.playerId = target.value
  if (mode.value === 'SYSTEM_GROUP') body.systemGroupId = target.value
  if (mode.value === 'POSITION_GROUP') body.positionGroupId = target.value

  try {
    await api.post(`/api/coach/programs/${programId}/assignments`, body)
    target.value = undefined
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

const confirmingAssignment = ref<{ id: string; targetName: string } | null>(null)
// UModal espera un boolean en v-model:open; el objeto guarda qué asignación se quita.
const confirmAssignmentOpen = computed({
  get: () => confirmingAssignment.value !== null,
  set: (value: boolean) => {
    if (!value) confirmingAssignment.value = null
  },
})
const removingAssignment = ref(false)

async function remove() {
  if (!confirmingAssignment.value) return
  removingAssignment.value = true
  try {
    await api.del(`/api/coach/assignments/${confirmingAssignment.value.id}`)
    toast.add({ title: 'Asignación quitada', color: 'success' })
    confirmingAssignment.value = null
    await Promise.all([refreshAssignments(), refreshPreview()])
  } catch (e) {
    toast.add({
      title: 'No se pudo quitar',
      description: e instanceof Error ? e.message : undefined,
      color: 'error',
    })
  } finally {
    removingAssignment.value = false
  }
}

const KIND_LABEL: Record<string, string> = {
  PLAYER: 'Jugador',
  POSITION_GROUP: 'Grupo propio',
  SYSTEM_GROUP: 'Del sistema',
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

        <!-- USelectMenu y no USelect: la lista de destinos es el plantel entero
             (hasta ~60 jugadores), y bajar una lista larga con el pulgar es peor
             que escribir tres letras. USelect no tiene buscador. -->
        <UFormField label="Destino" class="min-w-48 flex-1">
          <USelectMenu
            v-model="target"
            :items="targetItems"
            value-key="value"
            placeholder="Elegí…"
            class="w-full"
          />
        </UFormField>

        <UButton :disabled="!target" :loading="saving" @click="create">Asignar</UButton>
      </div>

      <p class="mt-3 text-sm text-muted">
        Cuando a un jugador le llegan varios programas, gana <strong>el último que asignaste</strong>.
        ¿Querés asignar por puesto? Creá un grupo propio con ese puesto solo.
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
          <!-- navy: clasificador (a qué tipo de destino apunta la asignación),
               no un estado. -->
          <UBadge color="navy" variant="subtle">{{ KIND_LABEL[assignment.kind] }}</UBadge>
          <span class="min-w-0 flex-1 truncate font-medium">{{ assignment.targetName }}</span>
          <!-- La lista viene ordenada por created_at desc, así que la de arriba
               es la que gana. La fecha es lo único que decide desde F4-B. -->
          <span class="hidden text-sm text-muted sm:block">
            {{ new Date(assignment.createdAt).toLocaleDateString('es-UY') }}
          </span>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Quitar"
            @click="
              () => {
                confirmingAssignment = { id: assignment.id, targetName: assignment.targetName }
              }
            "
          />
        </li>
      </ul>
    </UCard>

    <!-- Lo que evita descubrir que un jugador está viendo otra cosa cuando se queja -->
    <UCard>
      <template #header>
        <div>
          <h2 class="font-semibold">Qué está viendo cada jugador</h2>
          <p class="mt-1 text-sm text-muted">
            La última rutina que le asignaste, salvo que el jugador haya elegido volver a otra.
          </p>
        </div>
      </template>

      <p v-if="!preview || preview.rows.length === 0" class="text-muted">
        Todavía no tenés jugadores en el plantel.
      </p>

      <ul v-else class="divide-y divide-default">
        <li v-for="row in preview.rows" :key="row.playerId" class="flex flex-wrap items-center gap-2 py-2">
          <span class="min-w-0 flex-1 truncate">{{ row.name }}</span>
          <span class="hidden text-sm text-muted sm:block">{{ positionName(row.positionId) }}</span>

          <!--
            Sin esta marca la pantalla le mentiría al coach: creería que todos ven
            lo último que asignó. Con ella, la elección del jugador es auditable
            (F4-B §2.4).
          -->
          <UBadge
            v-if="row.assignedProgramId && row.programId !== row.assignedProgramId"
            color="warning"
            variant="subtle"
            :title="`Le asignaste ${row.assignedProgramName ?? 'otra rutina'}`"
          >
            Eligió otra
          </UBadge>

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

    <UModal
      v-model:open="confirmAssignmentOpen"
      :title="`¿Quitar la asignación a ${confirmingAssignment?.targetName}?`"
    >
      <template #body>
        <p class="text-sm text-muted">
          Este programa deja de alcanzar a ese destino. Si tenía otro programa asignado antes, pasa
          a recibir ese en su lugar.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="() => { confirmingAssignment = null }">
            Cancelar
          </UButton>
          <UButton color="error" :loading="removingAssignment" @click="remove">Quitar</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
