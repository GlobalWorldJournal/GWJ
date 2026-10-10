# Global World Journal (GWJ)

WSJ-style news site for **Global World Journal** — a public reader site, an admin CMS, and a remote **MCP server** so AI agents can manage the newspaper.

> **Independent project.** GWJ has nothing to do with the Oxy ecosystem. It uses none of the `@oxyhq/*` packages, Oxy auth/SSO, Oxy infra, or Oxy agents. See `AGENTS.md`.

## Stack
Bun monorepo (`packages/*`), TypeScript strict.

| Package | What |
|---------|------|
| `@gwj/shared-types` | Zod schemas + TS types (single source of truth) |
| `@gwj/backend` | Express 5 + Drizzle (PostgreSQL) + Zod — REST API, admin JWT, S3 upload |
| `@gwj/mongo-migration` | One-time MongoDB → PostgreSQL copy + verification (removed after the cutover) |
| `@gwj/mcp` | `@modelcontextprotocol/sdk` HTTP server (bearer token) for AI agents |
| `@gwj/frontend` | Vite 6 + React 19 + Tailwind 4 SPA + Cloudflare `_worker.js` (SEO) |

PostgreSQL 17 (`gwj` database) · S3 `gwj-media` + CloudFront `cdn.globalworldjournal.com` · AWS ECS Fargate (backend+mcp) · Cloudflare Pages (frontend).

## Develop
```bash
bun install
cp .env.example .env   # fill in secrets
docker compose up -d postgres migrate          # local PostgreSQL + schema
bun run seed           # seed the admin user
bun run dev            # all packages
TEST_POSTGRES_URL=postgres://gwj:gwj@127.0.0.1:5432/postgres bun run test
```

## Docs
- Design spec: `docs/superpowers/specs/2026-06-23-gwj-design.md`
- Build plan: `docs/superpowers/plans/2026-06-23-gwj-build.md`
- Database: `docs/DATABASE.md` · Mongo → Postgres cutover: `docs/POSTGRES-CUTOVER.md`
