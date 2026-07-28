<script setup lang="ts">
/**
 * Interruptor de modo oscuro.
 *
 * `useColorMode` viene de @nuxtjs/color-mode, que Nuxt UI ya trae como
 * dependencia: no hace falta instalarlo ni registrarlo como módulo.
 *
 * `preference` es lo que elige la persona ('light' | 'dark' | 'system') y se
 * persiste en una cookie. `value` es lo que efectivamente se está mostrando,
 * que con 'system' depende del sistema operativo. Se escribe en `preference` y
 * se lee de `value`.
 *
 * El ClientOnly no es decorativo: en SSR el server no sabe qué tema tiene el
 * visitante, así que renderizar el icono ahí garantiza un mismatch de
 * hidratación. El fallback reserva el mismo espacio para que no salte el layout.
 */
const colorMode = useColorMode()

const isDark = computed({
  get: () => colorMode.value === 'dark',
  set: (value) => {
    colorMode.preference = value ? 'dark' : 'light'
  },
})
</script>

<template>
  <ClientOnly>
    <UButton
      :icon="isDark ? 'i-lucide-moon' : 'i-lucide-sun'"
      color="neutral"
      variant="ghost"
      :aria-label="isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
      @click="isDark = !isDark"
    />
    <template #fallback>
      <div class="size-8" />
    </template>
  </ClientOnly>
</template>
