<script setup lang="ts">
import { POSITIONS, positionById } from '@coachlab/core/domain/positions'
import type { GroupsResponse } from '~~/generated'

const api = useCoachApi()
const toast = useToast()

const { data, error, refresh } = await useAsyncData('coach-groups', () =>
  api.get<GroupsResponse>('/api/coach/groups'),
)

const systemGroups = computed(() => (data.value?.groups ?? []).filter((g) => g.isSystem))
const customGroups = computed(() => (data.value?.groups ?? []).filter((g) => !g.isSystem))

const FORWARDS = POSITIONS.filter((p) => p.type === 'FORWARD')
const BACKS = POSITIONS.filter((p) => p.type === 'BACK')

// --- form de alta / edición --------------------------------------------------

type Draft = { id: string | null; name: string; positionIds: string[] }

const draft = ref<Draft | null>(null)
const saving = ref(false)

function startNew() {
  draft.value = { id: null, name: '', positionIds: [] }
}

function startEdit(group: { id: string; name: string; positionIds: string[] }) {
  draft.value = { id: group.id, name: group.name, positionIds: [...group.positionIds] }
}

function togglePosition(positionId: string) {
  if (!draft.value) return
  const list = draft.value.positionIds
  const index = list.indexOf(positionId)
  if (index === -1) list.push(positionId)
  else list.splice(index, 1)
}

const canSave = computed(
  () => (draft.value?.name.trim().length ?? 0) >= 2 && (draft.value?.positionIds.length ?? 0) >= 1,
)

async function save() {
  if (!draft.value || !canSave.value) return
  saving.value = true
  const body = { name: draft.value.name.trim(), positionIds: draft.value.positionIds }
  try {
    if (draft.value.id) await api.patch(`/api/coach/groups/${draft.value.id}`, body)
    else await api.post('/api/coach/groups', body)
    draft.value = null
    await refresh()
  } catch (e) {
    toast.add({
      title: 'No se pudo guardar el grupo',
      description: e instanceof Error ? e.message : undefined,
      color: 'error',
    })
  } finally {
    saving.value = false
  }
}

async function remove(id: string) {
  try {
    await api.del(`/api/coach/groups/${id}`)
    await refresh()
  } catch (e) {
    toast.add({
      title: 'No se pudo borrar',
      description: e instanceof Error ? e.message : undefined,
      color: 'error',
    })
  }
}

const positionName = (id: string) => positionById(id)?.name ?? id
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold">Grupos</h1>
        <p class="mt-1 text-sm text-muted">
          Sirven para asignar un programa a varios puestos de una vez.
        </p>
      </div>
      <UButton icon="i-lucide-plus" @click="startNew">Nuevo grupo</UButton>
    </div>

    <UAlert v-if="error" color="error" title="No se pudo cargar" :description="error.message" />

    <!-- Form inline de alta/edición -->
    <UCard v-if="draft">
      <template #header>
        <h2 class="font-semibold">{{ draft.id ? 'Editar grupo' : 'Nuevo grupo' }}</h2>
      </template>

      <div class="space-y-4">
        <UFormField label="Nombre" hint="Mínimo 2 caracteres">
          <UInput v-model="draft.name" placeholder="Primeras y Segundas" class="w-full" />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <div v-for="(list, label) in { Forwards: FORWARDS, Backs: BACKS }" :key="label">
            <p class="mb-2 text-sm font-medium">{{ label }}</p>
            <div class="space-y-1">
              <UCheckbox
                v-for="position in list"
                :key="position.id"
                :model-value="draft.positionIds.includes(position.id)"
                :label="position.name"
                @update:model-value="togglePosition(position.id)"
              />
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="() => { draft = null }">Cancelar</UButton>
          <UButton :disabled="!canSave" :loading="saving" @click="save">
            {{ draft.id ? 'Guardar' : 'Crear grupo' }}
          </UButton>
        </div>
      </template>
    </UCard>

    <!-- Grupos custom -->
    <div v-if="customGroups.length > 0" class="grid gap-4 sm:grid-cols-2">
      <UCard v-for="group in customGroups" :key="group.id">
        <div class="flex items-start justify-between gap-2">
          <h3 class="font-medium">{{ group.name }}</h3>
          <div class="flex shrink-0">
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="xs"
              aria-label="Editar"
              @click="startEdit(group)"
            />
            <UButton
              icon="i-lucide-trash-2"
              color="neutral"
              variant="ghost"
              size="xs"
              aria-label="Borrar"
              @click="remove(group.id)"
            />
          </div>
        </div>
        <div class="mt-3 flex flex-wrap gap-1">
          <UBadge
            v-for="positionId in group.positionIds"
            :key="positionId"
            color="neutral"
            variant="subtle"
          >
            {{ positionName(positionId) }}
          </UBadge>
        </div>
      </UCard>
    </div>

    <UCard v-else-if="!draft">
      <p class="text-muted">
        Todavía no tenés grupos propios. Los de abajo vienen con la app y alcanzan para la mayoría de
        los casos.
      </p>
    </UCard>

    <!-- Grupos del sistema: constantes de código, no filas -->
    <div>
      <h2 class="mb-3 font-semibold">Del sistema</h2>
      <div class="grid gap-4 sm:grid-cols-2">
        <UCard v-for="group in systemGroups" :key="group.id">
          <div class="flex items-start justify-between gap-2">
            <h3 class="font-medium">{{ group.name }}</h3>
            <UBadge color="neutral" variant="subtle">Del sistema</UBadge>
          </div>
          <div class="mt-3 flex flex-wrap gap-1">
            <UBadge
              v-for="positionId in group.positionIds"
              :key="positionId"
              color="neutral"
              variant="subtle"
            >
              {{ positionName(positionId) }}
            </UBadge>
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>
