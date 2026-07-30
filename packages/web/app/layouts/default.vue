<template>
  <div class="min-h-screen">
    <AppSidebar />

    <!--
      El escudo del club, una sola vez para toda la app (docs/DESIGN-SYSTEM.md §4).

      `md:hidden` porque en desktop el escudo ya ES la marca del sidebar: sin esto
      se verían DOS escudos a la vez. Acá cubre el caso donde el sidebar no existe
      —el celular, que es como entra el jugador—.

      `fixed` y no `m-5`: sin `fixed` las clases `right`/`top` no aplican, el <img>
      cae al flujo normal y el escudo se va con el scroll. El margen sale de
      right-4/top-4, no de un `m-*`.

      Dos <img> con una clase `dark:` en vez de un solo src reactivo: el arte es
      distinto en cada modo (interior claro contra relleno rojo), no es el mismo
      logo recoloreado. `pointer-events-none` porque es decoración: no debe robar
      clicks.
    -->
    <img
      src="/escudo-light.png"
      alt=""
      aria-hidden="true"
      class="pointer-events-none fixed right-4 top-4 z-20 w-11 md:hidden dark:hidden"
    >
    <img
      src="/escudo-dark.png"
      alt=""
      aria-hidden="true"
      class="pointer-events-none fixed right-4 top-4 z-20 hidden w-11 dark:block md:dark:hidden"
    >

    <main class="pb-16 md:pb-0 md:pl-60">
      <!-- pt-14 en mobile: el escudo ocupa la esquina y el título no puede quedar
           pegado abajo suyo. En desktop no hace falta, el escudo vive en el
           sidebar (DESIGN-SYSTEM §4). -->
      <div class="p-4 pt-14 md:p-8 md:pt-8">
        <slot />
      </div>
    </main>
  </div>
</template>
