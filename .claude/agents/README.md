# CoachLab — Agentes de Claude Code

Copiar esta carpeta a `.claude/agents/` en la raíz del repo (junto a `CLAUDE.md`) y versionarla en git. Claude Code los detecta automáticamente y delega según el campo `description` de cada uno.

## El set y su razón de ser

| Agente | Rol | Escritura |
|---|---|---|
| `spec-navigator` | Consulta `coach.html` / `README-CoachLab.md` como espec de producto y responde "cómo debe comportarse X" | Solo lectura |
| `domain-logic` | Implementa lógica pura en `lib/domain/` (resolveProgram, calcLoad, lastPerf, normName, parsers de Excel/texto) | Sí |
| `db-schema` | Dueño de `schema.prisma`, migraciones y seed | Sí |
| `ui-builder` | Componentes React/Next, forms RHF+Zod, shadcn, textos es-UY | Sí |
| `test-writer` | Tests Vitest de dominio y de scoping RBAC; no toca código fuente | Solo tests |
| `rbac-auditor` | Audita las 4 capas de seguridad en server actions y queries | Solo lectura |
| `code-reviewer` | Review general contra las convenciones de `CLAUDE.md` antes de merge | Solo lectura |

## Flujo de trabajo típico por feature

1. **Duda de producto** → `spec-navigator` responde desde el prototipo.
2. **Cambio de datos** → `db-schema` modifica schema + migración.
3. **Lógica de negocio** → `domain-logic` implementa la función pura.
4. **Tests** → `test-writer` cubre lo nuevo (dominio primero, scoping después).
5. **UI** → `ui-builder` arma pantallas y forms sobre las server actions.
6. **Antes de commit** → `rbac-auditor` (si hubo actions/queries nuevas) + `code-reviewer`.

## Reglas transversales

- Todos los agentes leen `CLAUDE.md` como fuente de verdad; si detectan contradicción entre código y `CLAUDE.md`, la reportan en vez de resolverla en silencio.
- Los agentes de solo lectura tienen el tool list restringido a propósito: no ampliárselo.
- Ningún agente reabre decisiones de la tabla §2 de `CLAUDE.md`; si una tarea parece requerirlo, se frena y se consulta al dueño del repo.
