<script setup lang="ts">
/**
 * "2/3 rutinas de esta semana".
 *
 * conic-gradient y no un SVG: son dos divs y un gradiente, sin viewBox ni
 * cálculo de circunferencia. El agujero del medio es un círculo del color de la
 * tarjeta encima, que es el truco clásico y funciona en los dos modos porque el
 * color sale del token.
 */
const props = defineProps<{ completed: number; total: number; ratio: number }>()

// Con `total = 0` (semana sin días todavía) `ratio` llega NaN y ensuciaría el
// ángulo del conic-gradient: sin días no hay progreso que dibujar.
const degrees = computed(() => (props.total > 0 ? Math.round(props.ratio * 360) : 0))
</script>

<template>
  <div class="flex flex-col items-center gap-1.5 rounded-xl bg-navy-500 p-4">
    <div
      class="flex size-30 items-center justify-center rounded-full"
      :style="{
        background: `conic-gradient(var(--color-gold-400) 0deg ${degrees}deg, rgba(255,255,255,.18) ${degrees}deg 360deg)`,
      }"
    >
      <div class="flex size-23 items-center justify-center rounded-full bg-navy-500">
        <span class="text-2xl font-bold text-white">{{ completed }}/{{ total }}</span>
      </div>
    </div>
    <p class="text-xs text-navy-200">rutinas de esta semana</p>
  </div>
</template>
