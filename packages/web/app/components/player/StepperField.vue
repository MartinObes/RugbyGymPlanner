<script setup lang="ts">
/**
 * Un campo numérico escribible con botones −/+ grandes.
 *
 * Existe porque el jugador lo usa con las manos sucias y de a un pulgar: el gesto
 * más común es "112 → 120", y para eso los −/+ ganan. Pero cuando el número está
 * lejos del prescrito, tocar catorce veces es peor que escribirlo, así que el
 * valor **también se teclea**. Antes era un `<span>` de sólo lectura.
 *
 * `null` significa "no registré esto", y es distinto de 0.
 *
 * **El prescrito se muestra pero NO se guarda** (spec F4-A, variante B). Va como
 * `placeholder` en gris: el jugador ve "112" y sólo tiene que corregir si hizo
 * otra cosa, pero si abre el slideover y lo cierra sin tocar nada no queda
 * registrado que hizo 112. Prellenar de verdad convertiría el registro en "el
 * plan salvo que digas lo contrario" y le ensuciaría al coach la comparación de
 * RPE objetivo contra percibido, que es el dato central del producto
 * (CLAUDE.md §1).
 */
const props = defineProps<{
  label: string
  modelValue: number | null
  step?: number
  min?: number
  max?: number
  /** El valor del plan: arranca los −/+ y se muestra en gris. `null` = no hay. */
  fallback?: number | null
  /** Se muestra pegado al placeholder ("kg"). Sólo decorativo. */
  unit?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [number | null] }>()

const step = computed(() => props.step ?? 1)
const min = computed(() => props.min ?? 0)
const max = computed(() => props.max ?? 999)

/** Con paso fraccionario el teclado tiene que ofrecer la coma. */
const allowsDecimals = computed(() => !Number.isInteger(step.value))

/**
 * Lo que hay escrito, como texto.
 *
 * No se puede bindear el número directo: mientras se tipea existen estados que
 * no son un número válido todavía ("11," o "" ), y convertirlos en vivo borraría
 * lo que la persona está escribiendo debajo del cursor.
 */
const draft = ref(props.modelValue === null ? '' : String(props.modelValue))

/** Coma decimal: es como se escribe en es-UY y el teclado del celular la ofrece. */
function parse(text: string): number | null {
  const normalized = text.replace(',', '.').trim()
  if (normalized === '') return null
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

const clamp = (value: number) => Math.min(max.value, Math.max(min.value, value))

// Los −/+ cambian el modelValue desde afuera; el texto tiene que seguirlos. La
// guarda evita pisar el borrador mientras se tipea (escribir "11," no debe
// reescribirse solo a "11").
watch(
  () => props.modelValue,
  (value) => {
    if (parse(draft.value) !== value) draft.value = value === null ? '' : String(value)
  },
)

function onInput(event: Event) {
  draft.value = (event.target as HTMLInputElement).value
  emit('update:modelValue', parse(draft.value))
}

/**
 * El acotado va en el blur y no en cada tecla: acotando en vivo, escribir "5" en
 * un campo con mínimo 10 lo saltaría a 10 y la siguiente tecla daría "105".
 */
function onBlur() {
  const value = parse(draft.value)
  if (value === null) {
    draft.value = ''
    emit('update:modelValue', null)
    return
  }
  const next = clamp(value)
  draft.value = String(next)
  emit('update:modelValue', next)
}

function bump(direction: 1 | -1) {
  const current = props.modelValue ?? props.fallback ?? min.value
  // Redondear al paso evita 112.30000000000001 al sumar 0.5 varias veces.
  const next = Math.round((current + direction * step.value) / step.value) * step.value
  emit('update:modelValue', clamp(next))
}

const placeholder = computed(() =>
  props.fallback === null || props.fallback === undefined ? '—' : String(props.fallback),
)
</script>

<template>
  <div>
    <div class="mb-1.5 flex items-baseline justify-between">
      <p class="text-xs text-muted">{{ label }}</p>
      <!-- Decir de dónde sale el número gris. Sin esto parece un valor guardado. -->
      <p v-if="fallback !== null && fallback !== undefined" class="text-[11px] text-dimmed">
        plan: {{ fallback }}<span v-if="unit"> {{ unit }}</span>
      </p>
    </div>

    <div class="flex items-center gap-1 rounded-lg bg-muted px-1.5 py-1">
      <UButton
        color="primary"
        variant="ghost"
        icon="i-lucide-minus"
        size="lg"
        :aria-label="`Bajar ${label}`"
        @click="() => bump(-1)"
      />

      <!--
        `type="text"` y no `type="number"`: number rechaza la coma decimal en
        varios locales, agrega flechitas que roban espacio táctil y en Firefox
        deja escribir "e". Con inputmode el teclado del celular igual sale
        numérico, que es lo único que se buscaba.

        `text-lg` son 18 px: arriba de los 16 que exige DESIGN-SYSTEM §6 para que
        Safari en iOS no haga zoom al enfocar.

        `dark:focus:ring-clubred-300`: en oscuro clubred-400 (vía ring-primary)
        da 2.40:1 sobre el fondo de página, abajo del 4.5:1 de WCAG AA. El tono
        300 da 5.07:1.
      -->
      <input
        :value="draft"
        :inputmode="allowsDecimals ? 'decimal' : 'numeric'"
        type="text"
        :placeholder="placeholder"
        :aria-label="label"
        class="min-w-0 flex-1 bg-transparent text-center text-lg font-bold text-highlighted outline-none placeholder:font-normal placeholder:text-dimmed focus:ring-2 focus:ring-primary dark:focus:ring-clubred-300"
        @input="onInput"
        @blur="onBlur"
      >

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
