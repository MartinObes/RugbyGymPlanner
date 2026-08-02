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

/**
 * `exact` marca la ruta que es PREFIJO de las otras dos.
 *
 * `active-class` de NuxtLink matchea por prefijo, así que el Editor
 * (`/coach/programs/:id`) quedaba resaltado también en `/assign` y en `/import`:
 * dos tabs en rojo a la vez. Antes esto intentaba resolverse con `:exact`, que
 * **no existe como prop de NuxtLink** en Nuxt 3/4 —Vue Router 4 la eliminó—, así
 * que se ignoraba en silencio y caía como atributo del DOM.
 *
 * Es el mismo problema y la misma solución que AppSidebar.vue con "Inicio".
 */
const TABS: { to: string; label: string; icon: string; exact?: true }[] = [
  { to: `/coach/programs/${programId}`, label: 'Editor', icon: 'i-lucide-list', exact: true },
  { to: `/coach/programs/${programId}/assign`, label: 'Asignaciones', icon: 'i-lucide-users' },
  { to: `/coach/programs/${programId}/import`, label: 'Importar', icon: 'i-lucide-upload' },
]

// Una sola definición para que los dos bindings no se desincronicen.
//
// dark:border-clubred-300 / dark:text-clubred-300: en oscuro clubred-400 (vía
// border-primary/text-primary) da 2.40:1 sobre el fondo de página, abajo del
// 4.5:1 de WCAG AA. El tono 300 da 5.07:1.
const ACTIVE_TAB = 'border-primary font-medium text-primary dark:border-clubred-300 dark:text-clubred-300'
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
          :active-class="tab.exact ? '' : ACTIVE_TAB"
          :exact-active-class="tab.exact ? ACTIVE_TAB : ''"
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
