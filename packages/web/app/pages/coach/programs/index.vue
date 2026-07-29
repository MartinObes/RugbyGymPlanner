<script setup lang="ts">
import type { ProgramsResponse } from '~~/generated'

const api = useCoachApi()
const toast = useToast()

const { data, error, refresh } = await useAsyncData('coach-programs', () =>
  api.get<ProgramsResponse>('/api/coach/programs'),
)

const creating = ref(false)
const newName = ref('')
const saving = ref(false)

async function create() {
  const name = newName.value.trim()
  if (!name) return
  saving.value = true
  try {
    const result = await api.post<{ ok: true; programId: string }>('/api/coach/programs', { name })
    newName.value = ''
    creating.value = false
    await navigateTo(`/coach/programs/${result.programId}`)
  } catch (e) {
    toast.add({
      title: 'No se pudo crear el programa',
      description: e instanceof Error ? e.message : undefined,
      color: 'error',
    })
  } finally {
    saving.value = false
  }
}

const confirmingDelete = ref<{ id: string; name: string } | null>(null)
const confirmOpen = computed({
  get: () => confirmingDelete.value !== null,
  set: (value: boolean) => {
    if (!value) confirmingDelete.value = null
  },
})

async function remove() {
  if (!confirmingDelete.value) return
  try {
    await api.del(`/api/coach/programs/${confirmingDelete.value.id}`)
    confirmingDelete.value = null
    await refresh()
  } catch (e) {
    toast.add({
      title: 'No se pudo borrar',
      description: e instanceof Error ? e.message : undefined,
      color: 'error',
    })
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-bold">Programas</h1>
      <UButton icon="i-lucide-plus" @click="() => { creating = true }">Nuevo programa</UButton>
    </div>

    <UAlert v-if="error" color="error" title="No se pudo cargar" :description="error.message" />

    <UCard v-if="creating">
      <div class="flex flex-wrap items-end gap-2">
        <UFormField label="Nombre del programa" class="min-w-56 flex-1">
          <UInput
            v-model="newName"
            placeholder="Mesociclo 1 — Fuerza"
            class="w-full"
            @keydown.enter="create"
          />
        </UFormField>
        <UButton :disabled="!newName.trim()" :loading="saving" @click="create">Crear</UButton>
        <UButton color="neutral" variant="ghost" @click="() => { creating = false }">Cancelar</UButton>
      </div>
      <p class="mt-2 text-sm text-muted">Se crea con Semana 1 y Día 1 listos para editar.</p>
    </UCard>

    <UCard v-if="data && data.programs.length === 0 && !creating">
      <p class="text-muted">
        Todavía no tenés programas. Creá uno y armá las semanas, días y bloques del mesociclo.
      </p>
    </UCard>

    <div v-else-if="data" class="grid gap-4 sm:grid-cols-2">
      <UCard v-for="program in data.programs" :key="program.id">
        <div class="flex items-start justify-between gap-2">
          <NuxtLink :to="`/coach/programs/${program.id}`" class="min-w-0 flex-1">
            <h3 class="truncate font-medium hover:text-primary">{{ program.name }}</h3>
            <p class="mt-1 text-sm text-muted">
              {{ program.weekCount }} {{ program.weekCount === 1 ? 'semana' : 'semanas' }} ·
              {{ program.assignmentCount }}
              {{ program.assignmentCount === 1 ? 'asignación' : 'asignaciones' }}
            </p>
          </NuxtLink>
          <UButton
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Borrar"
            @click="() => { confirmingDelete = { id: program.id, name: program.name } }"
          />
        </div>
      </UCard>
    </div>

    <UModal v-model:open="confirmOpen" :title="`¿Borrar ${confirmingDelete?.name}?`">
      <template #body>
        <p class="text-sm text-muted">
          Se borran todas sus semanas, días, bloques y ejercicios, y las asignaciones a jugadores.
          No se puede deshacer.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="() => { confirmingDelete = null }">Cancelar</UButton>
          <UButton color="error" @click="remove">Borrar programa</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
