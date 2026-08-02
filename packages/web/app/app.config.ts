/**
 * Configuración de tema de Nuxt UI.
 *
 * Acá se mapea cada **alias semántico** a una paleta. Nuxt UI nunca usa un color
 * directo en sus componentes: usa `primary`, `error`, `success`, etc., y resuelve
 * cada uno a una escala 50–950. Por eso cambiar una línea de acá repinta la app
 * entera sin tocar un solo componente.
 *
 * Los valores pueden ser:
 *  - el nombre de una paleta de Tailwind (`'green'`, `'slate'`, `'zinc'`…), o
 *  - el nombre de una paleta propia definida con `@theme static` en
 *    `app/assets/css/main.css` — que es el camino para los colores del club,
 *    porque no van a coincidir con ninguna paleta de Tailwind.
 *
 * ⚠ Una paleta propia necesita los **11 tonos** (50, 100, 200 … 900, 950).
 *   Nuxt UI los usa todos: 500/600 para fondos sólidos, 50/100 para fondos
 *   suaves, 900/950 para modo oscuro. Con menos, algunos estados quedan rotos.
 */
export default defineAppConfig({
  ui: {
    // Las paletas están en app/assets/css/main.css y los valores documentados en
    // docs/DESIGN-SYSTEM.md §3. tests/theme.test.ts verifica este mapeo.
    colors: {
      // El rojo del club, NO el marino: UButton y UBadge usan `primary` por
      // default, así que con el marino acá cada CTA de la app tendría que
      // escribir color="secondary" y cualquier botón nuevo nacería mal.
      primary: 'clubred',
      neutral: 'clay',

      // El alias propio, registrado además en nuxt.config → ui.theme.colors. Sin
      // ESTAS DOS COSAS juntas no existe `--ui-navy` y `color="navy"` no anda.
      navy: 'navy',

      /**
       * `secondary` e `info` se mapean aunque hoy NADIE los use.
       *
       * `nuxt.config.ts` los declara en `ui.theme.colors`, así que las variables
       * existen; sin mapearlos acá resuelven al default de Nuxt UI, que no es
       * ninguna paleta del club. O sea: el primero que escriba `color="info"`
       * mete un color ajeno a la marca sin que falle nada. Apuntarlos a `navy`
       * los vuelve inofensivos por default.
       */
      secondary: 'navy',
      info: 'navy',

      /**
       * Reasignados el 2026-08-01 (docs/DESIGN-SYSTEM.md §3.6).
       *
       * Antes eran `success: 'gold'` y `warning: 'clubred'`, o sea que `warning`
       * y `primary` resolvían al MISMO borgoña: el banner "faltan tus 1RM" salía
       * pintado igual que el botón "Completar día" y una advertencia se leía como
       * una acción sugerida. Un problema de señal, no de gusto.
       *
       * `warning` se lleva el dorado y `success` estrena `pitch`, el verde
       * botella de main.css. El verde estaba vetado en §3 y el dueño del repo
       * revirtió el veto: `pitch-500` tiene menos croma (28.5) que el rojo del
       * club (42.3) y que el dorado (46.0), así que no le compite a la identidad.
       *
       * ⚠ `warning` va SIEMPRE en `subtle`/`soft`, nunca en `solid`: el label
       *   blanco sobre `gold-500` da 3.16:1, abajo de WCAG AA.
       */
      success: 'pitch',
      warning: 'gold',

      // El único que NO va a la paleta del club, a propósito: un error tiene que
      // leerse como error aunque el club juegue de rojo. En el panel del coach
      // conviven "Guardar" en borgoña y "Eliminar" en el rojo más brillante de
      // Tailwind, y el más brillante lee como más alarmante — que es lo correcto
      // para lo destructivo.
      error: 'red',
    },

    /**
     * La CUARTA divergencia claro/oscuro (docs/DESIGN-SYSTEM.md §3.5).
     *
     * Nuxt UI pinta todo botón/badge `solid` con `text-inverted`, que en oscuro
     * es texto OSCURO. Eso asume que la paleta del acento es CLARA en oscuro,
     * como las de Tailwind (red-400 es rosado). Las del club no lo son:
     * `clubred-400` (#96303f) y `navy-400` (#4a5b85) siguen siendo oscuras, así
     * que el label quedaba a **2.31:1** y **2.59:1** — abajo del 4.5:1 de WCAG AA
     * y medido en pantalla, no estimado.
     *
     * Con texto blanco esos mismos fondos dan 7.52:1 y 6.72:1.
     *
     * La lista es EXACTAMENTE `primary` y `navy`, y quién queda afuera importa
     * tanto como quién entra. `success` (pitch-400 #7ab08c), `warning` (gold-400
     * #c8a15a) y `error` (red-400 #f87171) sí son claros de verdad: con el texto
     * oscuro que pone Nuxt UI dan 6.98:1, 7.21:1 y 6.29:1. Ponerles blanco los
     * ROMPERÍA — 2.50:1, 2.41:1 y 2.77:1.
     *
     * `warning` estaba en esta lista hasta el 2026-08-01, cuando era `clubred` y
     * correspondía. Se sacó en el mismo cambio que lo pasó a `gold`: dejarlo
     * habría dejado texto blanco sobre dorado a 2.41:1, un fallo de AA que no
     * rompe el build ni ningún test que no lo busque.
     */
    button: {
      compoundVariants: [
        { color: 'primary', variant: 'solid', class: 'dark:text-white' },
        { color: 'navy', variant: 'solid', class: 'dark:text-white' },
      ],
      /**
       * 44 px de alto real (docs/DESIGN-SYSTEM.md §6). El default de Nuxt UI
       * (`py-1.5 text-sm`) da 32 px medidos en pantalla.
       *
       * El texto queda en `text-sm`: el zoom automático de iOS al enfocar solo
       * dispara en campos editables, no en botones, así que subirle la fuente a
       * un botón engordaría la tipografía de la app sin arreglar nada.
       * 20 px de line-height + py-3 (12 px × 2) = 44.
       */
      variants: {
        size: {
          md: { base: 'px-3.5 py-3 text-sm gap-1.5' },
        },
      },
    },
    // Misma lista que el botón y por la misma razón: sólo las paletas del club
    // que siguen siendo OSCURAS en su tono 400. Ver el comentario de arriba.
    badge: {
      compoundVariants: [
        { color: 'primary', variant: 'solid', class: 'dark:text-white' },
        { color: 'navy', variant: 'solid', class: 'dark:text-white' },
      ],
    },

    /**
     * Los campos editables van a 44 px Y a 16 px de fuente.
     *
     * Los 16 px no son estética: abajo de eso, Safari en iOS hace zoom solo al
     * enfocar el campo y deja al jugador con la pantalla corrida en medio del
     * gimnasio. Es la mitad de "tocable sin zoom" de §6 que el alto no cubre.
     * 24 px de line-height + py-2.5 (10 px × 2) = 44.
     */
    input: {
      variants: { size: { md: { base: 'px-3 py-2.5 text-base gap-1.5' } } },
    },
    select: {
      variants: { size: { md: { base: 'px-3 py-2.5 text-base gap-1.5' } } },
    },
    textarea: {
      variants: { size: { md: { base: 'px-3 py-2.5 text-base gap-1.5' } } },
    },
    inputNumber: {
      variants: { size: { md: { base: 'px-3 py-2.5 text-base gap-1.5' } } },
    },
  },
})
