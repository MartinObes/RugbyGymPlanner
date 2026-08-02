<script setup lang="ts">
import { rpeDelta } from '@coachlab/core/domain/rpeDelta'

const props = defineProps<{
  targetRpe: number | null
  perceivedRpe: number | null
}>()

const comparison = computed(() => rpeDelta(props.targetRpe, props.perceivedRpe))

/**
 * El mapeo severidad → color del club.
 *
 * `light` va en `warning` (dorado) y NO en `info`, aunque celeste sería la
 * lectura obvia: `info` está mapeado a `navy` en app.config.ts, y navy-400
 * (#4a5b85) sigue siendo OSCURO en modo oscuro. Como texto de un badge `subtle`
 * sobre fondo oscuro repetiría exactamente el defecto de contraste que F4-A
 * acaba de arreglar (docs/DESIGN-SYSTEM.md §3.5). gold-400 sí es claro.
 *
 * Que `heavy` y `light` sean los dos colores de alerta es correcto: las dos
 * cosas significan que la carga quedó mal calibrada, sólo que para lados
 * distintos.
 *
 * ⚠ `warning` va SIEMPRE en `subtle`/`soft`, nunca en `solid` (§3.6): el label
 *   blanco sobre gold-500 da 3.16:1.
 */
const COLOR = {
  ok: 'success',
  heavy: 'error',
  light: 'warning',
  unknown: 'neutral',
} as const
</script>

<template>
  <UBadge :color="COLOR[comparison.severity]" variant="subtle" :title="comparison.label">
    <!--
      El color NO es la única señal. Cuando hay con qué comparar, el texto dice
      los dos números, así el badge sirve con daltonismo y en una captura en
      blanco y negro. El `title` agrega la lectura en palabras.
    -->
    <template v-if="targetRpe !== null && perceivedRpe !== null">
      {{ targetRpe }} → {{ perceivedRpe }}
    </template>
    <template v-else>
      {{ comparison.label }}
    </template>
  </UBadge>
</template>
