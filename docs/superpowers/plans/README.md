# CoachLab — Índice de planes de implementación

Un plan por fase del roadmap (`CLAUDE.md` §6). Cada fase entrega software funcionando y testeable
por sí sola. Ejecutarlas en orden: cada una asume que la anterior está mergeada en `main`.

| Fase | Plan | Entrega | Rama |
|---|---|---|---|
| F0 | [f0-setup](2026-07-27-f0-setup.md) | Monorepo SST desplegando a tu stage: tabla DynamoDB, entidades ElectroDB, API Hono con OpenAPI, Nuxt SSR, dominio con tests en verde | `feature/f0-setup` |
| F1 | [f1-auth-shell](2026-07-27-f1-auth-shell.md) | Registro/login con JWT en cookie, guards de rol en la API y en Nuxt, shell con sidebar, vínculo jugador↔coach por invite code | `feature/f1-auth-shell` |
| F2 | [f2-coach-panel](2026-07-27-f2-coach-panel.md) | Plantel, grupos custom, editor de programas con autosave, assignments con prioridad, import Excel/texto | `feature/f2-coach-panel` |
| F3 | [f3-player-panel](2026-07-27-f3-player-panel.md) | Perfil con 1RM, "Mi semana" con kg calculados y "última vez", registro y completar día | `feature/f3-player-panel` |
| F4 | [f4-feedback-deploy](2026-07-27-f4-feedback-deploy.md) | Vista de feedback del coach (progreso + RPE objetivo vs. percibido), stage `production` | `feature/f4-feedback-deploy` |

## Estructura del monorepo

Ya creada en el repo (directorios con `.gitkeep`; se borran cuando entra el primer archivo real):

```
infra/                            # SST: storage, api, web, secrets
packages/
  core/src/domain/                # funciones puras + sus .test.ts co-locados
  core/src/entities/              # ElectroDB — único lugar que conoce las claves
  core/src/access/                # requireRole, can, scopedPlayer, scopedProgram
  core/src/validators/            # schemas Zod = contrato OpenAPI
  api/src/routes/                 # una ruta por recurso
  api/src/middleware/             # auth, requireRole, errores
  web/app/pages/                  # el router de Nuxt sale de acá — ver CLAUDE.md §5
  web/app/{components,composables,middleware,layouts,plugins}/
  web/generated/                  # cliente hey-api, fuera de app/ a propósito
docs/superpowers/plans/
```

Convenciones fijadas acá (no estaban en `CLAUDE.md`, se documentan para no decidirlas dos veces):

- **Segmentos de ruta en inglés** (`/coach/players`, no `/coach/plantel`). `CLAUDE.md` §5 pide
  identificadores en inglés y textos de UI en español; la ruta es código, el label del sidebar es UI.
- **Las rutas las genera Nuxt desde `app/pages/`** — no hay tabla de rutas escrita a mano. La regla de
  `index.vue` vs. archivo hermano del directorio está en `CLAUDE.md` §5: elegir anidamiento cuando las
  vistas comparten carga y encabezado, hermanas cuando no.
- **Tests co-locados**: `calcLoad.ts` + `calcLoad.test.ts`. Sin carpeta `tests/` aparte — el dominio
  es lo único con cobertura obligatoria y conviene que el test viaje al lado.
- **Ids con ULID** (`ulid`), no UUID: son ordenables por tiempo, lo que en DynamoDB significa que un
  `sk` de id ya viene ordenado por creación y ahorra un atributo.

## Cómo se relacionan con el stack

El stack cambió después de escribir la primera versión de estos planes. Lo que **sobrevivió** intacto
es todo `packages/core/src/domain/`: `normName`, `calcLoad`, `rmFor`, `resolveProgram`, `lastPerf`,
`buildPlayerDay`, `rpeDelta` y los parsers son funciones puras sobre tipos propios, así que no les
afecta si abajo hay Postgres o DynamoDB. Sus tests son los mismos. Lo que se rehízo es todo lo demás:
persistencia, transporte, auth y UI.

## Deuda conocida antes de empezar

1. **Faltan los archivos de referencia.** `CLAUDE.md` §1 declara `coach.html`, `README-CoachLab.md` y
   `NEXTJS_APP_CONTEXT.md` como fuente de verdad, pero **no están en el repo**. `spec-navigator` no
   tiene qué leer. Bloquea parcialmente F2 (formato exacto del import Excel/texto) y el catálogo de
   ~48 ejercicios del seed. Cada punto afectado está marcado con **⚠ NECESITA PROTOTIPO**, con el
   contrato que se asume mientras tanto.
2. **`pnpm` no está instalado** en la máquina (hay npm 10.9.4 y corepack 0.34.6). Tarea 0 de F0.
3. **Hace falta una cuenta de AWS con credenciales configuradas** (`aws configure` o un perfil SSO)
   antes de la primera tarea de SST.
