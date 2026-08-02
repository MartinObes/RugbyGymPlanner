<template>
  <div class="min-h-screen">
    <AppSidebar />

    <main class="pb-16 md:pb-0 md:pl-60">
      <!--
        Barra superior del celular (docs/DESIGN-SYSTEM.md §4).

        `md:hidden` porque en desktop el escudo y el interruptor de tema ya viven
        en el sidebar: sin esto se verían dos veces.

        **`sticky` y NO `fixed`.** Antes eran dos <img fixed> flotando sueltos
        sobre el contenido, y en el celular temblaban al hacer scroll: un elemento
        `fixed` se ancla al viewport, y el viewport de un browser móvil cambia de
        alto mientras la barra de direcciones se colapsa, así que el navegador lo
        reposiciona en cada cuadro. `sticky` se queda en el flujo del documento y
        el compositor lo pega arriba sin recalcular nada — se ve clavado, que es
        lo que se pidió. De paso desaparece el `pt-14` que compensaba a mano el
        espacio del escudo flotante.

        Necesita fondo opaco: el contenido pasa POR DEBAJO, y sin `bg-default`
        se leerían las dos capas encima. `sticky` se rompe en silencio si algún
        ancestro tiene `overflow` distinto de `visible`; acá la cadena está limpia.
      -->
      <header
        class="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-default bg-default px-4 md:hidden"
      >
        <!--
          Dos <img> con una clase `dark:` en vez de un solo src reactivo: el arte
          es distinto en cada modo (trazo rojo sobre interior claro contra relleno
          rojo con detalles blancos), no es el mismo logo recoloreado.

          Lleva `alt` de verdad y no `aria-hidden`: acá el escudo ES el nombre de
          la app, igual que en el sidebar, así que un lector de pantalla tiene que
          poder leerlo. Como marca de agua decorativa no lo era.

          La altura manda y el ancho sale solo (`h-10 w-auto`): el asset es
          391×511, así que fijar el ancho daba un alto imprevisible que no entraba
          en la barra.
        -->
        <img
          src="/escudo-light.png"
          alt="CoachLab"
          class="h-10 w-auto dark:hidden"
        >
        <img
          src="/escudo-dark.png"
          alt="CoachLab"
          class="hidden h-10 w-auto dark:block"
        >

        <ColorModeToggle />
      </header>

      <div class="p-4 md:p-8">
        <slot />
      </div>
    </main>
  </div>
</template>
