export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',

  // SSR: la cookie de sesión se lee en el server y el render ya sale con el rol
  // correcto, sin flash de contenido ni spinner (CLAUDE.md §2).
  ssr: true,

  modules: ['@nuxt/ui', '@nuxt/eslint'],

  // Obligatorio en Nuxt UI 3: sin esta hoja no se genera ninguna clase de
  // Tailwind y la app se sirve sin estilos.
  css: ['~/assets/css/main.css'],

  icon: {
    // Los iconos se INLINEAN en el bundle del cliente en build time.
    //
    // Sin esto, Nuxt Icon los resuelve en runtime y —aunque
    // @iconify-json/lucide esté instalado— sale a buscarlos por red: el sidebar
    // se veía sin iconos, con "loading icon lucide:users timed out after 1500ms"
    // en el log. Inlinearlos también evita requests en producción, que es lo que
    // corresponde con la restricción de costo de CLAUDE.md §1.
    //
    // La lista es EXPLÍCITA y no `scan: true` porque el sidebar y el nav pasan el
    // icono por binding dinámico (`:name="item.icon"`), y el escaneo estático no
    // ve esos nombres. Si agregás un icono nuevo a la app, va acá también: el
    // test tests/icons.test.ts compara las dos listas y falla si se desfasan.
    clientBundle: {
      scan: true,
      icons: [
        'lucide:calendar-days',
        'lucide:check',
        'lucide:circle-alert',
        'lucide:clipboard-list',
        'lucide:copy',
        'lucide:dumbbell',
        'lucide:history',
        'lucide:layout-grid',
        'lucide:list',
        'lucide:loader-circle',
        'lucide:log-out',
        'lucide:moon',
        'lucide:pencil',
        'lucide:plus',
        'lucide:shield',
        'lucide:sun',
        'lucide:trash-2',
        'lucide:triangle-alert',
        'lucide:upload',
        'lucide:user',
        'lucide:user-minus',
        'lucide:users',
        'lucide:x',
      ],
      sizeLimitKb: 512,
    },
  },

  nitro: {
    // Un solo deployable: Nitro sirve el SSR y monta la app Hono en /api.
    preset: 'vercel',
  },

  runtimeConfig: {
    // Privadas: solo server-side. La service_role NO va acá ni en ningún lado
    // que corra en respuesta a un request (CLAUDE.md §4).
    supabaseUrl: process.env.SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
    public: {
      supabaseUrl: process.env.SUPABASE_URL ?? '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
    },
  },
})
