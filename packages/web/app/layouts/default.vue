<template>
  <div class="min-h-screen">
    <AppSidebar />

    <!--
      El escudo del club, una sola vez para toda la app.
      Va en el shell y no por pantalla (docs/DESIGN-SYSTEM.md §4). Dos <img> con
      una clase `dark:` en vez de un solo src reactivo: el arte es distinto en cada
      modo (interior claro contra relleno rojo), no es el mismo logo recoloreado.
      `pointer-events-none` porque es decoración: no debe robar clicks.
    -->
    <img
      src="/escudo-light.png"
      alt=""
      aria-hidden="true"
      class="pointer-events-none fixed right-1.5 top-1.5 z-20 w-[34px] dark:hidden"
    >
    <img
      src="/escudo-dark.png"
      alt=""
      aria-hidden="true"
      class="pointer-events-none fixed right-1.5 top-1.5 z-20 hidden w-[34px] dark:block"
    >

    <main class="pb-16 md:pb-0 md:pl-60">
      <!-- pt-10 y no pt-4: el escudo ocupa la esquina y el título no puede quedar
           pegado abajo suyo (DESIGN-SYSTEM §4). -->
      <div class="p-4 pt-10 md:p-8 md:pt-10">
        <slot />
      </div>
    </main>
  </div>
</template>
