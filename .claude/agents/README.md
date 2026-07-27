# CoachLab — Agentes de Claude Code

Claude Code los detecta automáticamente desde `.claude/agents/` y delega según el campo `description`
de cada uno. Están versionados en git a propósito: son parte del contrato del repo, igual que
`CLAUDE.md`.

## El set y su razón de ser

| Agente | Rol | Escritura |
|---|---|---|
| `spec-navigator` | Consulta `coach.html` / `README-CoachLab.md` como espec de producto y responde "cómo debe comportarse X" | Solo lectura |
| `domain-logic` | Implementa lógica pura en `packages/core/src/domain/` (resolveProgram, calcLoad, rmFor, lastPerf, rpeDelta, normName, parsers) | Sí |
| `db-schema` | Dueño del single-table design: entidades ElectroDB, índices en `infra/storage.ts`, seed | Sí |
| `ui-builder` | Nuxt 4 / Vue 3 / Nuxt UI, forms con Zod, textos es-UY | Sí |
| `test-writer` | Tests Vitest de dominio y de scoping RBAC; no toca código fuente | Solo tests |
| `rbac-auditor` | Audita las 4 capas de seguridad en rutas de la API y helpers de acceso | Solo lectura |
| `code-reviewer` | Review general contra las convenciones de `CLAUDE.md` antes de merge | Solo lectura |

## Flujo de trabajo típico por feature

1. **Duda de producto** → `spec-navigator` responde desde el prototipo.
2. **Cambio de access pattern** → `db-schema` modifica entidades e índices.
3. **Lógica de negocio** → `domain-logic` implementa la función pura.
4. **Tests** → `test-writer` cubre lo nuevo (dominio primero, scoping después).
5. **API** → rutas Hono sobre las entidades y el dominio, con Zod como contrato.
6. **UI** → `ui-builder` arma pantallas y forms sobre el cliente generado por hey-api.
7. **Antes de commit** → `rbac-auditor` (si hubo rutas o queries nuevas) + `code-reviewer`.

## Reglas transversales

- Todos los agentes leen `CLAUDE.md` como fuente de verdad; si detectan contradicción entre código y
  `CLAUDE.md`, la reportan en vez de resolverla en silencio.
- Los agentes de solo lectura tienen el tool list restringido a propósito: no ampliárselo.
- Ningún agente reabre decisiones de la tabla §2 de `CLAUDE.md`; si una tarea parece requerirlo, se
  frena y se consulta al dueño del repo.
- **El stack cambió** (era Next.js + Prisma + Postgres/Neon + Auth.js + Vercel; ahora es AWS
  serverless con Nuxt + Hono + DynamoDB). Cualquier residuo del stack viejo que aparezca en el código
  o en los docs se corrige, no se ignora.
