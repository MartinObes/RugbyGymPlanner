<template>
  <UApp>
    <!-- Sin <NuxtLayout> los layouts existen pero NO se renderizan: páginas sin
         sidebar ni botón de salir, y Nuxt solo lo avisa con un warning
         (NUXT_E4007). Mordió en F1; si un layout "desaparece", mirar acá. -->
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
