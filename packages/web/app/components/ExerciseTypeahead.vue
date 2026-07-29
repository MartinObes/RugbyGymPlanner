<script setup lang="ts">
import { normName } from '@coachlab/core/domain/normName'

export type ExerciseOption = { id: string; name: string; category: string | null }

const props = defineProps<{
  modelValue: string | null
  exercises: ExerciseOption[]
  placeholder?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [string | null] }>()

const query = ref('')
const open = ref(false)
const highlighted = ref(0)

const selected = computed(() => props.exercises.find((e) => e.id === props.modelValue) ?? null)

// El filtro usa normName DEL DOMINIO, no una reimplementación: es la misma
// función que decide el matching de 1RM, así que buscar "bulgara" encuentra
// "Sentadilla Búlgara".
const filtered = computed(() => {
  const q = normName(query.value)
  const pool = q ? props.exercises.filter((e) => normName(e.name).includes(q)) : props.exercises
  return pool.slice(0, 8)
})

watch(filtered, () => {
  highlighted.value = 0
})

function choose(exercise: ExerciseOption) {
  emit('update:modelValue', exercise.id)
  query.value = ''
  open.value = false
}

/** El blur cierra con delay para que el click en una opción llegue primero. */
function closeSoon() {
  setTimeout(() => {
    open.value = false
  }, 150)
}

function onKeydown(event: KeyboardEvent) {
  if (!open.value) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    highlighted.value = Math.min(highlighted.value + 1, filtered.value.length - 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    highlighted.value = Math.max(highlighted.value - 1, 0)
  } else if (event.key === 'Enter') {
    const option = filtered.value[highlighted.value]
    if (option) {
      event.preventDefault()
      choose(option)
    }
  } else if (event.key === 'Escape') {
    open.value = false
  }
}
</script>

<template>
  <div class="relative">
    <UInput
      v-model="query"
      :placeholder="selected?.name ?? placeholder ?? 'Buscar ejercicio…'"
      class="w-full"
      @focus="open = true"
      @keydown="onKeydown"
      @blur="closeSoon"
    />

    <ul
      v-if="open && filtered.length > 0"
      class="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-default bg-default shadow-lg"
    >
      <li
        v-for="(exercise, index) in filtered"
        :key="exercise.id"
        :class="[
          'cursor-pointer px-3 py-2 text-sm',
          index === highlighted ? 'bg-elevated' : '',
          exercise.id === modelValue ? 'font-medium text-primary' : '',
        ]"
        @mousedown.prevent="choose(exercise)"
        @mouseenter="highlighted = index"
      >
        {{ exercise.name }}
        <span v-if="exercise.category" class="ml-2 text-xs text-muted">{{ exercise.category }}</span>
      </li>
    </ul>

    <p v-if="open && query && filtered.length === 0" class="absolute z-20 mt-1 w-full rounded-md border border-default bg-default px-3 py-2 text-sm text-muted shadow-lg">
      No hay ejercicios que coincidan
    </p>
  </div>
</template>
