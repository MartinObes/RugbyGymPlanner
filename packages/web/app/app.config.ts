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

      success: 'gold',
      warning: 'clubred',

      // El único que NO va a la paleta del club, a propósito: un error tiene que
      // leerse como error aunque el club juegue de rojo. En el panel del coach
      // conviven "Guardar" en borgoña y "Eliminar" en el rojo más brillante de
      // Tailwind, y el más brillante lee como más alarmante — que es lo correcto
      // para lo destructivo.
      error: 'red',
    },
  },
})
