<script setup lang="ts">
import type { PlayerExercise } from '~~/generated'

/**
 * Una fila de la rutina. El orden y los tamaños salen de
 * docs/DESIGN-SYSTEM.md §7 y están pensados para leerse PARADO ENTRE SERIES:
 * primero qué ejercicio, después con cuánto peso (lo más grande de la fila), y al
 * final el contexto en chico.
 */
const props = defineProps<{ exercise: PlayerExercise; dayId: string; disabled: boolean }>()

const log = useTemplateRef('log')
defineExpose({ flush: () => log.value?.flush() })

/**
 * Las repeticiones, en grande y al lado del peso.
 *
 * Las dos cosas que el jugador viene a buscar parado entre series son CUÁNTO
 * levanta y CUÁNTAS veces, así que las dos van con el mismo tamaño y peso
 * tipográfico. Antes las reps eran un `text-xs` atenuado perdido a la derecha del
 * nombre y había que buscarlas.
 *
 * `reps` es texto y no número: la planilla trae cosas como "8-10" o "máx".
 */
const repsLabel = computed(() =>
  props.exercise.reps === null ? null : `${props.exercise.reps} reps`,
)

/**
 * Las series quedan chicas al lado del nombre: son la estructura del bloque, no
 * el dato del momento.
 *
 * El import deja `sets` en 1 porque las planillas usan las vueltas del bloque para
 * eso, y mostrar "1 serie" sería inventar un dato. Así el 1 no se ve y no hace
 * falta decidir nada sobre la columna S de las planillas.
 */
const setsLabel = computed(() => {
  const { sets } = props.exercise
  return sets !== null && sets > 1 ? `${sets} series` : null
})

/** Falta el 1RM: el aviso REEMPLAZA al peso, no lo acompaña. */
const missing = computed(() => props.exercise.load.kind === 'missing-1rm')
</script>

<template>
  <div class="border-b border-muted py-4 last:border-b-0">
    <div class="flex items-baseline justify-between gap-2">
      <p class="font-semibold">{{ exercise.exerciseName }}</p>
      <p v-if="setsLabel" class="shrink-0 text-xs text-muted">{{ setsLabel }}</p>
    </div>

    <div class="mt-1.5 flex items-center justify-between gap-2">
      <!-- Peso y reps juntos y del mismo tamaño: son las dos cosas que el jugador
           lee de un vistazo entre series. `flex-wrap` para que a 380 px el aviso
           largo de "falta tu 1RM" baje en vez de empujar al chip. -->
      <div class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <p
          v-if="missing"
          class="text-sm font-semibold text-primary"
        >
          {{ exercise.load.label }}
        </p>
        <p v-else class="text-lg font-bold text-navy-500 dark:text-highlighted">
          <!-- En el modo porcentaje, el resultado en kg es lo que manda: el "80% →"
               va atenuado y en peso normal. -->
          <template v-if="exercise.load.kind === 'percentage'">
            <span class="font-normal text-muted">{{ exercise.load.percentage }}% → </span>
            <span>{{ exercise.load.kg }} kg</span>
          </template>
          <template v-else>{{ exercise.load.label }}</template>
        </p>

        <template v-if="repsLabel">
          <span class="text-muted">·</span>
          <p class="text-lg font-bold text-navy-500 dark:text-highlighted">{{ repsLabel }}</p>
        </template>
      </div>

      <PlayerLogSlideover
        ref="log"
        :exercise="exercise"
        :day-id="dayId"
        :disabled="disabled"
      />
    </div>

    <div
      v-if="exercise.targetRpe !== null || exercise.lastPerfLabel"
      class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted"
    >
      <!-- El RPE objetivo es un dato del COACH, no una pregunta al jugador: texto
           plano y chico, nunca algo que parezca un campo. -->
      <span v-if="exercise.targetRpe !== null">RPE {{ exercise.targetRpe }}</span>
      <span v-if="exercise.targetRpe !== null && exercise.lastPerfLabel">·</span>
      <span v-if="exercise.lastPerfLabel">{{ exercise.lastPerfLabel }}</span>
    </div>
  </div>
</template>
