<template>
  <UApp>
    <!--
      La barra de progreso de arriba. Es la respuesta al "cambiar de vista tarda
      segundos": las páginas hacen `await useAsyncData(...)`, y eso BLOQUEA la
      navegación de Nuxt — la pantalla vieja se queda quieta hasta que la data
      llega, sin ningún indicio de que algo esté pasando. Se lee como que la app
      se colgó.

      Esto no acelera nada; hace visible la espera, que es la mitad del problema.
      La otra mitad (que la espera sea más corta) está en docs/PERFORMANCE-F4.md.
    -->
    <NuxtLoadingIndicator color="var(--ui-primary)" />

    <!-- Sin <NuxtLayout> los layouts existen pero NO se renderizan: páginas sin
         sidebar ni botón de salir, y Nuxt solo lo avisa con un warning
         (NUXT_E4007). Mordió en F1; si un layout "desaparece", mirar acá. -->
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
