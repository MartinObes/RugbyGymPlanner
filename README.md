# CoachLab

Gym application for rugby clubs who want more intelligent tracking of their players' weightlifting, as
well as a centralized platform for viewing routines and following players' progress.

The coach builds a mesocycle program (weeks → days → blocks → exercises) with loads in kg, as a % of
1RM, or bodyweight, plus a target RPE per exercise. Each player sees their routine **with the kilos
already computed from their own 1RM** ("80% → 112 kg"), logs what they actually did (real weight, reps,
perceived RPE, note of the day), and that comes back to the coach. Comparing target vs. perceived RPE
alongside the note is the product's key signal for adjusting loads.

One plan written in percentages scales to the whole squad with per-player loads. That's the point.

CoachLab is a **non-commercial** project built for a single club, and it runs at **zero cost**. That
constraint drives the stack.

## Stack

Nuxt renders on Vercel, a Hono app handles the API inside Nitro, and Supabase provides Postgres and
authentication. One deployable, two free accounts, no credit card.

| Layer | Choice |
|---|---|
| Frontend | Nuxt 4 (SSR) + Vue 3 + Nuxt UI |
| API | Hono mounted in Nitro, `@hono/zod-openapi` |
| Data | Supabase Postgres, SQL migrations, **RLS on every table** |
| Data access | `supabase-js` with generated types — deliberately no ORM |
| Client | hey-api generates the typed client from the OpenAPI spec |
| Auth | Supabase Auth, cookie sessions via `@supabase/ssr` |
| Hosting | Vercel (Hobby — non-commercial only) |
| Validation | Zod at the edges, `CHECK` constraints for invariants |

Everything is TypeScript.

Two earlier stacks were tried and dropped: Next.js/Prisma/Neon, and AWS serverless with DynamoDB
single-table. [CLAUDE.md](CLAUDE.md) §1 records why.

## Getting started

```bash
pnpm install
# Create a project at supabase.com, then put URL + anon key in packages/web/.env
pnpm supabase db push   # apply the schema
pnpm gen:types          # regenerate types from the schema
pnpm seed               # exercise catalog + admin (never against production)
pnpm dev
```

No Docker required — migrations run against the hosted project.

## Where things live

- **[CLAUDE.md](CLAUDE.md)** — the master context: what the product is, which decisions are settled and
  why, the domain model, the RBAC rules, the conventions. Read it before touching code.
- **[docs/superpowers/plans/](docs/superpowers/plans/)** — one implementation plan per roadmap phase.
- **[.claude/agents/](.claude/agents/)** — the specialized agents this repo uses and when each applies.

```
supabase/migrations/  SQL schema, versioned. Source of truth
packages/core/        shared: pure domain logic, Zod validators
packages/api/         Hono routes and middleware (a library, not a deployable)
packages/web/         Nuxt app; server/api/[...].ts mounts the Hono app
```

`packages/core/src/domain/` holds the business rules as pure functions with no Supabase, no Hono and no
Vue in sight — program resolution, load calculation, 1RM matching, last-performance lookup, the Excel
and text importers. They're the first thing tested and the last thing that should change.
