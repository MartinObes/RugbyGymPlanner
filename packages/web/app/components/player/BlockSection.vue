<script setup lang="ts">
import type { PlayerBlock } from '~~/generated'

/**
 * Un bloque con su encabezado, separado de verdad del siguiente — como las
 * secciones de la planilla y no como una lista corrida.
 *
 * El nombre viene de la columna B del Excel y existe desde la migración 0016. Los
 * bloques importados antes de F3.5 no lo tienen, así que el encabezado se muestra
 * solo si hay algo que mostrar (nombre o vueltas).
 */
const props = defineProps<{ block: PlayerBlock; dayId: string; disabled: boolean }>()

const rows = ref<{ flush: () => Promise<void> }[]>([])
defineExpose({
  flush: () => Promise.all(rows.value.filter(Boolean).map((row) => row.flush())),
})

const hasHeader = computed(
  () => Boolean(props.block.name) || props.block.type === 'CIRCUIT',
)
</script>

<template>
  <section class="mt-5 first:mt-0">
    <!--
      El filete dorado del borde izquierdo marca dónde empieza cada bloque.

      Es el acento de más peso que suma F4-A: aparece en TODOS los bloques de
      todas las rutinas, o sea en la pantalla que el jugador más mira, y no le
      compite a nada — el rojo es de los CTA y el marino del peso prescrito, así
      que el dorado se queda con la estructura (docs/DESIGN-SYSTEM.md §3.6).

      `gold-700` en claro y `gold-400` en oscuro: el 600 sobre el fondo cálido se
      quedaba corto para un texto de 10 px, que necesita 4.5:1.
    -->
    <div
      v-if="hasHeader"
      class="rounded-t-xl border-l-2 border-gold-400 bg-elevated px-3.5 py-2.5"
    >
      <p
        v-if="block.name"
        class="text-[10px] font-bold uppercase tracking-wide text-gold-700 dark:text-gold-400"
      >
        {{ block.name }}
      </p>
      <p v-if="block.type === 'CIRCUIT'" class="mt-0.5 text-xs text-muted">
        Circuito · {{ block.rounds }} vueltas
      </p>
    </div>

    <div
      class="border border-default bg-default px-4"
      :class="hasHeader ? 'rounded-b-xl border-t-0' : 'rounded-xl'"
    >
      <PlayerExerciseLine
        v-for="exercise in block.exercises"
        ref="rows"
        :key="exercise.id"
        :exercise="exercise"
        :day-id="dayId"
        :disabled="disabled"
      />
    </div>
  </section>
</template>
