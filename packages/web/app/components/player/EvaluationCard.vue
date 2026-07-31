<script setup lang="ts">
import type { ExerciseTrend } from '~~/generated'

/**
 * Un ejercicio con su tendencia. Los cinco casos son todos los que existen:
 * subió, igual, bajó, primera evaluación, y sin evaluaciones.
 *
 * REGLA QUE NO SE NEGOCIA (docs/DESIGN-SYSTEM.md §3.2): **"bajó" nunca es rojo.**
 * Va en muted. Bajar en un test no es un error del jugador ni algo que la UI deba
 * castigar visualmente.
 */
const props = defineProps<{ trend: ExerciseTrend }>()

const ICON = {
  up: 'i-lucide-trending-up',
  down: 'i-lucide-trending-down',
  flat: 'i-lucide-minus',
} as const

const icon = computed(() => ICON[props.trend.direction as keyof typeof ICON] ?? null)

// Dorado en claro, azul claro en oscuro (el dorado no hace falta ahí). El resto
// de las direcciones, muted.
const deltaClass = computed(() =>
  props.trend.direction === 'up'
    ? 'text-success dark:text-[#7ea6e8]'
    : 'text-muted',
)

/** "+8 kg", "-5 kg", "0 kg". El signo es parte del dato. */
const delta = computed(() => {
  const value = props.trend.deltaKg
  if (value === null) return null
  return `${value > 0 ? '+' : ''}${value} kg`
})

/** "12 jul" — corto, es metadata. */
const testedOn = computed(() => {
  if (!props.trend.latestTestedOn) return null
  const [year, month, day] = props.trend.latestTestedOn.split('-').map(Number)
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']
  return year && month && day ? `${day} ${MONTHS[month - 1]}` : null
})
</script>

<template>
  <div
    class="flex min-w-32 shrink-0 flex-col gap-1 rounded-xl border p-2.5"
    :class="
      trend.direction === 'none'
        ? 'border-dashed border-accented'
        : 'border-default bg-default'
    "
  >
    <p class="text-xs text-muted">{{ trend.exerciseName }}</p>

    <template v-if="trend.direction === 'none'">
      <p class="text-xs text-muted">Sin evaluaciones todavía</p>
    </template>

    <template v-else>
      <p class="text-lg font-bold text-highlighted">{{ trend.latestKg }} kg</p>

      <p v-if="trend.direction === 'first'" class="text-xs italic text-muted">primera evaluación</p>
      <p v-else class="flex items-center gap-1 text-sm font-bold" :class="deltaClass">
        <UIcon v-if="icon" :name="icon" class="size-4" />
        {{ delta }}
      </p>

      <p class="text-[10px] text-muted">
        <template v-if="trend.previousKg !== null">antes {{ trend.previousKg }} kg · </template>
        {{ testedOn }}
      </p>
    </template>
  </div>
</template>
