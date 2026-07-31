# CoachLab — Índice de planes de implementación

Un plan por fase del roadmap (`CLAUDE.md` §6). Cada fase entrega software funcionando y testeable
por sí sola. Ejecutarlas en orden: cada una asume que la anterior está mergeada en `main`.

> ## ⚠ Los planes con fecha 2026-07-27 están OBSOLETOS
>
> Los cinco planes originales se escribieron contra **AWS + DynamoDB + ElectroDB + JWT propio**, stack
> descartado a mitad de F0 (`CLAUDE.md` §1 explica por qué). Todos llevan un banner arriba.
>
> **Cada fase, al empezar, regenera su plan contra el stack vigente** (Nuxt + Hono + Supabase). F1, F2
> y F3 ya lo hicieron. **Usá siempre el plan de la fecha más nueva** de cada fase: el viejo queda como
> registro histórico, y su arquitectura es inválida.
>
> - **F0 está implementado**, pero contra el stack nuevo. El registro real es
>   [`docs/IMPLEMENTATION-F0.md`](../../IMPLEMENTATION-F0.md) — leé ese, no el plan.
> - De los planes viejos **solo sigue valiendo la especificación de producto** (pantallas, flujos,
>   textos de UI, reglas de negocio, criterios de aceptación). Los pasos técnicos, no.

| Fase | Plan vigente | Entrega |
|---|---|---|
| F0 | ~~[f0-setup](2026-07-27-f0-setup.md)~~ → [IMPLEMENTATION-F0](../../IMPLEMENTATION-F0.md) | Monorepo, schema Postgres con RLS, API Hono con OpenAPI, Nuxt SSR, dominio con tests en verde |
| F1 | [2026-07-28-f1-auth-shell](2026-07-28-f1-auth-shell.md) | Registro/login con Supabase Auth, guards de rol en la API y en Nuxt, shell con sidebar, vínculo jugador↔coach por invite code |
| F2 | [2026-07-28-f2-coach-panel](2026-07-28-f2-coach-panel.md) | Plantel, grupos custom, editor de programas con autosave, assignments con prioridad, import de las planillas reales |
| **F3** | **[2026-07-29-f3-player-panel](2026-07-29-f3-player-panel.md)** ← **la fase actual** | Perfil con 1RM, "Mi semana" con kg calculados y "última vez", registro y completar día, cambiar contraseña |
| F4 | [f4-feedback-deploy](2026-07-27-f4-feedback-deploy.md) — **regenerar antes de ejecutar** | Vista de feedback del coach (progreso + RPE objetivo vs. percibido), keepalive, dominio propio |

**F3 tiene además un spec aprobado y un handoff:**

- [`docs/superpowers/specs/2026-07-29-f3-player-panel-design.md`](../specs/2026-07-29-f3-player-panel-design.md)
  — el diseño y las cuatro decisiones que tomó el dueño del repo.
- [`docs/HANDOFF-F3.md`](../../HANDOFF-F3.md) — **empezá por acá si arrancás la implementación en un
  chat nuevo.** Estado del repo, baseline de tests, y lo que los docs afirman y el código desmiente.

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

## Deuda conocida — estado al 2026-07-29

Los tres puntos que esta sección listaba como bloqueantes se resolvieron durante F1 y F2. Se deja el
registro porque el "antes" explica decisiones que siguen en pie.

1. **Faltan los archivos de referencia — sigue vigente, pero ya no bloquea.** `CLAUDE.md` §1 declara
   `coach.html`, `README-CoachLab.md` y `NEXTJS_APP_CONTEXT.md` como fuente de verdad y **no están en el
   repo**, así que `spec-navigator` no tiene qué leer.
   **Lo que sí se resolvió:** el formato del import ya **no** depende de eso. El 2026-07-29 el dueño del
   repo aportó dos libros de Excel reales del preparador físico y el formato quedó validado contra ellos
   — y resultó **distinto** del que se había asumido. El parser es
   `packages/core/src/domain/parseCoachSheet.ts` y el análisis está en `docs/IMPLEMENTATION-F2.md` §3.5.
   Si aparece una duda de producto que ni el spec ni el plan de la fase responden, **decilo en vez de
   inventar**.
2. **~~Faltan las cuentas de Supabase y Vercel.~~ Resuelto.** El proyecto está creado y desplegado desde
   F0; las migraciones se aplican con `pnpm db:push` contra el proyecto hosted.
3. **~~Las políticas de RLS nunca corrieron contra una base real.~~ Resuelto.** `pnpm verify:setup`
   (`scripts/verify-setup.mjs`) las ejercita contra Supabase con usuarios de verdad, y F1/F2 pasaron.
   Cada fase nueva le agrega sus checks: es la capa 1 de `CLAUDE.md` §4 y ningún unit test la cubre.

**Deuda que sí hay que tener presente hoy** (medida el 2026-07-29, detalle en
[`docs/HANDOFF-F3.md`](../../HANDOFF-F3.md) §5.2):

- **`pnpm lint` no existe.** El gate de `CLAUDE.md` §5 lo pide, pero ningún package define el script.
- **`packages/web typecheck` no chequea nada y sale con código 0** (`vue-tsc` crashea e igual reporta
  éxito). Lo único que typecheckea los `.vue` es `pnpm --filter @coachlab/web build`.
