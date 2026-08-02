<script setup lang="ts">
import { normName } from '@coachlab/core/domain/normName'

export type ExerciseOption = { id: string; name: string; category: string | null }

/**
 * Buscador de ejercicios del catálogo.
 *
 * **Por qué es un UInputMenu y no una lista propia.** Antes esto era un `<input>`
 * con un `<ul class="absolute">` escrito a mano, y el menú se RECORTABA: el
 * editor de programas envuelve los días en `lg:overflow-x-auto`, y un elemento
 * `absolute` no puede salirse de un ancestro con overflow. UInputMenu monta su
 * contenido en un portal a `<body>` (Reka UI `ComboboxPortal`, `portal` viene en
 * `true`), así que ningún contenedor que scrollee lo puede cortar.
 *
 * De paso vinieron gratis el manejo de teclado, los roles ARIA de combobox y el
 * foco, que la versión casera implementaba a mano y sólo en parte.
 *
 * **Lo que NO cambió: el filtro sigue siendo `normName` del dominio.** Por eso va
 * `ignore-filter`, que apaga el buscador propio de Nuxt UI. Es la misma función
 * que decide el matching de 1RM, así que buscar "bulgara" encuentra "Sentadilla
 * Búlgara" — con el filtro de fábrica, que compara sin normalizar acentos, no la
 * encontraría.
 */
const props = defineProps<{
  modelValue: string | null
  exercises: ExerciseOption[]
  placeholder?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [string | null] }>()

const searchTerm = ref('')

const filtered = computed(() => {
  const query = normName(searchTerm.value)
  const pool = query
    ? props.exercises.filter((exercise) => normName(exercise.name).includes(query))
    : props.exercises
  // El tope existe para no renderizar 48 filas en un menú que se lee de un
  // vistazo; escribiendo dos letras se llega a cualquiera.
  return pool.slice(0, 8)
})

/**
 * El componente trabaja con el objeto y el padre con el id.
 *
 * `undefined` y no `null` cuando no hay nada: es lo que Nuxt UI entiende como
 * "sin elegir", igual que USelect.
 */
const selected = computed({
  get: () => props.exercises.find((exercise) => exercise.id === props.modelValue),
  set: (option: ExerciseOption | undefined) => emit('update:modelValue', option?.id ?? null),
})
</script>

<template>
  <UInputMenu
    v-model="selected"
    v-model:search-term="searchTerm"
    :items="filtered"
    label-key="name"
    ignore-filter
    :placeholder="placeholder ?? 'Buscar ejercicio…'"
    icon="i-lucide-search"
    class="w-full"
  >
    <template #item-trailing="{ item }">
      <span v-if="item.category" class="text-xs text-muted">{{ item.category }}</span>
    </template>

    <template #empty>
      <span class="text-sm text-muted">No hay ejercicios que coincidan</span>
    </template>
  </UInputMenu>
</template>
