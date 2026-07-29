<script setup lang="ts">
import type { ProgramTreeResponse } from '~~/generated'

/**
 * Padre de las tres vistas del programa (editor, asignaciones, import).
 *
 * El anidamiento acá es a propósito (CLAUDE.md §5): las tres cargan el MISMO
 * programa y muestran el mismo encabezado, así que se carga una sola vez y se
 * pasa por provide/inject. Cambiar de tab no vuelve a pedirlo.
 *
 * Es lo contrario de players/, donde listado y detalle no comparten nada y van
 * como rutas hermanas.
 */
const route = useRoute()
const api = useCoachApi()
const toast = useToast()
const programId = route.params.programId as string

const { data, error, refresh } = await useAsyncData(`program-${programId}`, () =>
  api.get<ProgramTreeResponse>(`/api/coach/programs/${programId}`),
)

const program = computed(() => data.value?.program ?? null)

provide('program', { program, refresh, programId })

// --- renombrar inline --------------------------------------------------------

const editingName = ref(false)
const nameDraft = ref('')

function startRename() {
  nameDraft.value = program.value?.name ?? ''
  editingName.value = true
}

async function saveName() {
  const name = nameDraft.value.trim()
  editingName.value = false
  if (!name || name === program.value?.name) return
  try {
    await api.patch(`/api/coach/programs/${programId}`, { name })
    await refresh()
  } catch (e) {
    toast.add({
      title: 'No se pudo renombrar',
      description: e instanceof Error ? e.message : undefined,
      color: 'error',
    })
  }
}

const TABS = [
  { to: `/coach/programs/${programId}`, label: 'Editor', icon: 'i-lucide-list' },
  { to: `/coach/programs/${programId}/assign`, label: 'Asignaciones', icon: 'i-lucide-users' },
  { to: `/coach/programs/${programId}/import`, label: 'Importar', icon: 'i-lucide-upload' },
]
</script>

<template>
  <div class="space-y-6">
    <div>
      <NuxtLink to="/coach/programs" class="text-sm text-muted hover:text-default">
        ← Volver a programas
      </NuxtLink>
    </div>

    <UAlert v-if="error" color="error" title="No se pudo cargar" :description="error.message" />

    <template v-else-if="program">
      <div class="flex flex-wrap items-center gap-3">
        <UInput
          v-if="editingName"
          v-model="nameDraft"
          class="max-w-sm"
          autofocus
          @blur="saveName"
          @keydown.enter="saveName"
        />
        <h1 v-else class="text-2xl font-bold">{{ program.name }}</h1>
        <UButton
          v-if="!editingName"
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Renombrar"
          @click="startRename"
        />
      </div>

      <nav class="flex gap-1 border-b border-default">
        <NuxtLink
          v-for="tab in TABS"
          :key="tab.to"
          :to="tab.to"
          class="flex items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-default"
          active-class="border-primary font-medium text-primary"
          :exact="tab.label === 'Editor'"
        >
          <UIcon :name="tab.icon" class="size-4" />
          {{ tab.label }}
        </NuxtLink>
      </nav>

      <!-- Sin esto los hijos no se renderizan (regla de nombres de Nuxt). -->
      <NuxtPage />
    </template>
  </div>
</template>
