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
    // TODO: reemplazar por la paleta del club una vez definida en main.css.
    colors: {
      primary: 'green',
      neutral: 'slate',

      // Estos tres son de significado, no de marca: conviene NO pintarlos con
      // los colores del club. Un error tiene que leerse como error aunque el
      // club juegue de rojo.
      success: 'green',
      warning: 'amber',
      error: 'red',
    },
  },
})
