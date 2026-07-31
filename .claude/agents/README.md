# CoachLab — Agentes de Claude Code

Claude Code los detecta automáticamente desde `.claude/agents/` y delega según el campo `description`
de cada uno. Están versionados en git a propósito: son parte del contrato del repo, igual que
`CLAUDE.md`.

## El set y su razón de ser

| Agente | Rol | Escritura |
|---|---|---|
| `orchestrator` | Agente padre: planifica, elige agente y modelo por paso, decide cuándo parar | Solo lectura (delega) |
| `spec-navigator` | Consulta `coach.html` / `README-CoachLab.md` como espec de producto y responde "cómo debe comportarse X" | Solo lectura |
| `domain-logic` | Implementa lógica pura en `packages/core/src/domain/` (resolveProgram, calcLoad, rmFor, lastPerf, rpeDelta, normName, parsers) | Sí |
| `db-schema` | Dueño del schema Postgres: migraciones SQL en `supabase/migrations/`, políticas RLS, CHECKs, triggers, seed | Sí |
| `ui-builder` | Nuxt 4 / Vue 3 / Nuxt UI, forms con Zod, textos es-UY | Sí |
| `test-writer` | Tests Vitest de dominio y de scoping RBAC; no toca código fuente | Solo tests |
| `rbac-auditor` | Audita las 5 capas de seguridad (RLS incluida) en rutas y helpers de acceso | Solo lectura |
| `code-reviewer` | Review general contra las convenciones de `CLAUDE.md` antes de merge | Solo lectura |
| `clean-code-analyst` | Legibilidad, nombres, duplicación, separación de capas. Corre **después** de `code-reviewer` | Solo lectura |
| `ux-reviewer` | Interfaz y experiencia en `packages/web/app/`: jerarquía, estados faltantes, contraste, mobile, microcopy | Solo lectura |
| `perf-optimizer` | Round trips a Supabase, cold start, render, bundle, latencia percibida | Sí |

## Flujo de trabajo típico por feature

1. **Tarea de más de un archivo o más de una preocupación** → `orchestrator` planifica y rutea.
2. **Duda de producto** → `spec-navigator` responde desde el prototipo.
3. **Cambio de schema** → `db-schema` escribe una migración nueva (nunca edita una aplicada) y
   regenera los tipos.
4. **Lógica de negocio** → `domain-logic` implementa la función pura.
5. **Tests** → `test-writer` cubre lo nuevo (dominio primero, scoping después, RLS al final).
6. **API** → rutas Hono sobre el dominio, con Zod como contrato.
7. **UI** → `ui-builder` arma pantallas y forms.
8. **Antes de commit** → `rbac-auditor` (si hubo rutas o queries nuevas) + `code-reviewer`, y recién
   después `clean-code-analyst`: correctitud primero, claridad después.

## Reglas transversales

- Todos los agentes leen `CLAUDE.md` como fuente de verdad; si detectan contradicción entre código y
  `CLAUDE.md`, la reportan en vez de resolverla en silencio.
- Los agentes de solo lectura tienen el tool list restringido a propósito: no ampliárselo.
- Ningún agente reabre decisiones de la tabla §2 de `CLAUDE.md`; si una tarea parece requerirlo, se
  frena y se consulta al dueño del repo.
- **Ninguna operación de usuario usa la `service_role` key** (`CLAUDE.md` §4). Es la regla que hace
  que RLS sirva de algo, y ningún agente la relaja por conveniencia ni por performance.
- **El stack cambió DOS veces, y las dos definiciones viejas están descartadas** (`CLAUDE.md` §1):

  | | Descartado |
  |---|---|
  | #1 | Next.js, Prisma, Neon, Auth.js, shadcn/ui, server actions |
  | #2 | AWS, SST, Lambda, CloudFront, DynamoDB, ElectroDB, single-table, GSI, argon2, JWT propio |

  **El stack actual es Nuxt 4 + Hono + Supabase (Postgres) desplegado en Vercel.** Cualquier residuo
  de los dos viejos que aparezca en el código, en los docs o en estos agentes se corrige, no se
  ignora — y confundir el stack actual con residuo es el mismo error al revés.

  > Estos archivos ya lo tuvieron: hasta el 2026-07-31 casi todos describían el stack #2, y
  > `code-reviewer` llegaba a pedir que se denunciaran "Vercel" y "PostgreSQL" como residuo. Si
  > cambia una decisión de `CLAUDE.md` §2, estos `.md` se actualizan en el mismo PR.
