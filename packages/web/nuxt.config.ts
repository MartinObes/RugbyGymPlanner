export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',

  // SSR: la cookie de sesión se lee en el server y el render ya sale con el rol
  // correcto, sin flash de contenido ni spinner (CLAUDE.md §2).
  ssr: true,

  modules: ['@nuxt/ui'],

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
