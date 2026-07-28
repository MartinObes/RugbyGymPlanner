# CoachLab — Índice de planes de implementación

Un plan por fase del roadmap (`CLAUDE.md` §6). Cada fase entrega software funcionando y testeable
por sí sola. Ejecutarlas en orden: cada una asume que la anterior está mergeada en `main`.

> ## ⚠ Estado de estos planes tras el cambio de stack del 2026-07-27
>
> Los cinco planes se escribieron contra **AWS + DynamoDB + ElectroDB + JWT propio**, stack descartado
> a mitad de F0 (`CLAUDE.md` §1 explica por qué). Todos llevan un banner arriba.
>
> - **F0 está implementado**, pero contra el stack nuevo. El registro real es
>   [`docs/IMPLEMENTATION-F0.md`](../../IMPLEMENTATION-F0.md) — leé ese, no el plan.
> - **F1 a F4 siguen siendo válidos como especificación de producto** (pantallas, flujos, textos de
>   UI, reglas de negocio, criterios de aceptación). Sus pasos técnicos no: hay que regenerar cada
>   plan contra el stack vigente al empezar la fase.

| Fase | Plan | Entrega |
|---|---|---|
| F0 | ~~[f0-setup](2026-07-27-f0-setup.md)~~ → [IMPLEMENTATION-F0](../../IMPLEMENTATION-F0.md) | Monorepo, schema Postgres con RLS, API Hono con OpenAPI, Nuxt SSR, dominio con tests en verde |
| F1 | [f1-auth-shell](2026-07-27-f1-auth-shell.md) | Registro/login con Supabase Auth, guards de rol en la API y en Nuxt, shell con sidebar, vínculo jugador↔coach por invite code |
| F2 | [f2-coach-panel](2026-07-27-f2-coach-panel.md) | Plantel, grupos custom, editor de programas con autosave, assignments con prioridad, import Excel/texto |
| F3 | [f3-player-panel](2026-07-27-f3-player-panel.md) | Perfil con 1RM, "Mi semana" con kg calculados y "última vez", registro y completar día |
| F4 | [f4-feedback-deploy](2026-07-27-f4-feedback-deploy.md) | Vista de feedback del coach (progreso + RPE objetivo vs. percibido), keepalive, dominio propio |

## Convenciones fijadas acá

No estaban en `CLAUDE.md`; se documentan para no decidirlas dos veces. Siguen vigentes.

- **Segmentos de ruta en inglés** (`/coach/players`, no `/coach/plantel`). `CLAUDE.md` §5 pide
  identificadores en inglés y textos de UI en español; la ruta es código, el label del sidebar es UI.
- **Las rutas las genera Nuxt desde `app/pages/`** — no hay tabla de rutas escrita a mano. La regla de
  `index.vue` vs. archivo hermano del directorio está en `CLAUDE.md` §5: elegir anidamiento cuando las
  vistas comparten carga y encabezado, hermanas cuando no.
- **Tests co-locados**: `calcLoad.ts` + `calcLoad.test.ts`. Sin carpeta `tests/` aparte — el dominio
  es lo único con cobertura obligatoria y conviene que el test viaje al lado.

Una convención **quedó sin efecto**: los planes fijaban ids **ULID** porque en DynamoDB un `sk`
ordenable por tiempo ahorra un atributo. En Postgres los ids son `uuid` con `gen_random_uuid()` y el
orden sale de `created_at` o de `order_index`.

## Deuda conocida antes de empezar

1. **Faltan los archivos de referencia.** `CLAUDE.md` §1 declara `coach.html`, `README-CoachLab.md` y
   `NEXTJS_APP_CONTEXT.md` como fuente de verdad, pero **no están en el repo**. `spec-navigator` no
   tiene qué leer. Bloquea parcialmente F2 (formato exacto del import Excel/texto) y el catálogo de
   ~48 ejercicios del seed. Cada punto afectado está marcado con **⚠ NECESITA PROTOTIPO**, con el
   contrato que se asume mientras tanto.
2. **Faltan las cuentas de Supabase y Vercel.** Ninguna pide tarjeta. Los pasos exactos están en
   [`docs/IMPLEMENTATION-F0.md`](../../IMPLEMENTATION-F0.md) §6.
3. **Las políticas de RLS nunca corrieron contra una base real.** Es lo primero a validar cuando
   exista el proyecto de Supabase.
