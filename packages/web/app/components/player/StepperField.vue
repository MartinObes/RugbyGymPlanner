<script setup lang="ts">
/**
 * Un campo numérico con botones −/+ grandes.
 *
 * Existe porque el jugador lo usa con las manos sucias y de a un pulgar: el gesto
 * más común es "112 → 120", y con un input numérico eso son cuatro toques más
 * abrir el teclado. Nuxt UI no trae stepper, así que son dos UButton y un valor.
 *
 * `null` significa "no registré esto", y es distinto de 0: por eso el primer toque
 * en + arranca desde `fallback` y no desde 1.
 */
const props = defineProps<{
  label: string
  modelValue: number | null
  step?: number
  min?: number
  max?: number
  /** Desde dónde arranca el primer toque cuando el valor es null. */
  fallback?: number
}>()

const emit = defineEmits<{ 'update:modelValue': [number | null] }>()

const step = computed(() => props.step ?? 1)
const min = computed(() => props.min ?? 0)
const max = computed(() => props.max ?? 999)

function bump(direction: 1 | -1) {
  const current = props.modelValue ?? props.fallback ?? min.value
  // Redondear al paso evita 112.30000000000001 al sumar 0.5 varias veces.
  const next = Math.round((current + direction * step.value) / step.value) * step.value
  emit('update:modelValue', Math.min(max.value, Math.max(min.value, next)))
}
</script>

<template>
  <div>
    <p class="mb-1.5 text-xs text-muted">{{ label }}</p>
    <div class="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
      <UButton
        color="primary"
        variant="ghost"
        icon="i-lucide-minus"
        size="lg"
        :aria-label="`Bajar ${label}`"
        @click="() => bump(-1)"
      />
      <span class="text-lg font-bold">{{ modelValue ?? '—' }}</span>
      <UButton
        color="primary"
        variant="ghost"
        icon="i-lucide-plus"
        size="lg"
        :aria-label="`Subir ${label}`"
        @click="() => bump(1)"
      />
    </div>
  </div>
</template>
