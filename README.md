# CoachLab

Gym application for rugby clubs who want more intelligent tracking of their players' weightlifting, as
well as a centralized platform for viewing routines and following players' progress.

The coach builds a mesocycle program (weeks → days → blocks → exercises) with loads in kg, as a % of
1RM, or bodyweight, plus a target RPE per exercise. Each player sees their routine **with the kilos
already computed from their own 1RM** ("80% → 112 kg"), logs what they actually did (real weight, reps,
perceived RPE, note of the day), and that comes back to the coach. Comparing target vs. perceived RPE
alongside the note is the product's key signal for adjusting loads.

One plan written in percentages scales to the whole squad with per-player loads. That's the point.

## Stack

Serverless on AWS. CloudFront routes to two Lambdas — one running the Nuxt SSR server, one running the
API — and the API talks to a single DynamoDB table.

| Layer | Choice |
|---|---|
| Frontend | Nuxt 4 (SSR) + Vue 3 + Nuxt UI |
| API | Hono on Node.js Lambda, `@hono/zod-openapi` |
| Data | DynamoDB single-table, ElectroDB |
| Client | hey-api generates the typed client from the OpenAPI spec |
| Auth | JWT in an httpOnly cookie, argon2 hashing |
| IaC | SST v3 |
| Validation | Zod — the same schemas are the API contract |

Everything is TypeScript: infra, backend, frontend.

## Getting started

```bash
pnpm install
npx sst secret set JwtSecret "<something long and random>"
pnpm sst dev            # table, API and Nuxt live against your personal stage
pnpm seed               # exercise catalog + admin (never against production)
```

Requires an AWS account with resolvable credentials (`aws configure`).

## Where things live

- **[CLAUDE.md](CLAUDE.md)** — the master context: what the product is, which decisions are settled and
  why, the domain model, the RBAC rules, the conventions. Read it before touching code.
- **[docs/superpowers/plans/](docs/superpowers/plans/)** — one implementation plan per roadmap phase.
- **[.claude/agents/](.claude/agents/)** — the specialized agents this repo uses and when each applies.

```
infra/            SST: storage, api, web, secrets
packages/core/    shared: pure domain logic, ElectroDB entities, access helpers, Zod validators
packages/api/     Hono routes and middleware
packages/web/     Nuxt app
```

`packages/core/src/domain/` holds the business rules as pure functions with no AWS, no Hono and no Vue
in sight — program resolution, load calculation, 1RM matching, last-performance lookup, the Excel and
text importers. They're the first thing tested and the last thing that should change.
