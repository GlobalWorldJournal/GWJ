# GWJ — Global World Journal

> Shared instructions for every AI coding agent (Claude Code, Codex, Gemini CLI, etc.) working in this repo. Documentation belongs in `docs/`, history in git, status in issues — this file holds only rules, commands and pointers. **Budget: under 8 KB.**

## ⚠️ This project is INDEPENDENT of Oxy

**GWJ has NOTHING to do with the Oxy ecosystem.** It is Nate's personal company project (Global World Journal, globalworldjournal.com), separate from OxyHQ/Mention/Allo/Homiio/etc.

- Do **NOT** use any `@oxyhq/*` package (core, services, auth, bloom, contracts). GWJ has its own types, auth, and UI.
- Do **NOT** use Oxy SSO/FedCM, `cloud.oxy.so` media, the Oxy API, any Oxy database, or any Oxy application data.
- Do **NOT** spawn the Oxy team agents (mention-*, oxy-*, bloom, allo, etc.) for GWJ work.
- The global `~/AGENTS.md` Oxy rules (Oxy SDK versions, SSO architecture, agent-first Oxy team) **do not apply here**, except for universal quality standards (below).

**Hosting (user decision, 2026-06-23):** GWJ is hosted ON the Oxy AWS account (`237343248947`, us-west-2, CLI `--profile oxy`) for convenience, but as **fully ISOLATED `gwj-*` resources** — its own ECR repos, ECS services, S3 bucket (`gwj-media`), CloudFront, and its **own PostgreSQL database `gwj`** (own login role `gwj`, SSM `/gwj/DATABASE_URL`) on the shared RDS instance `oxy-postgres` (user decision 2026-10-10). GWJ shares the instance only: no database, role, table, application data, SSO, or SDKs with Oxy. Frontend deploys to Cloudflare Pages (project `gwj`). **Infra is STANDALONE in `~/GWJ/infra/`** — its own terraform state (S3 key `gwj/terraform.tfstate`), its own IAM roles (`gwj-ecs-execution`/`gwj-ecs-task`), its own SSM `/gwj/*` and `gwj-tasks` security group. It consumes Oxy's shared VPC/ALB/ECS-cluster ONLY via read-only data sources, so a GWJ `plan`/`apply` can never modify Oxy's resources. Do NOT put GWJ resources in `oxy-infra`. (Sole cross-reference: `oxy-postgres-sg`, owned by oxy-infra with inline ingress, lists `gwj-tasks-sg` by id so GWJ can reach its database.)

## What GWJ is
WSJ-style news site for "Global World Journal". Public reader SPA + admin CMS + a remote MCP server so AI agents manage the newspaper.

- **Domain:** globalworldjournal.com (Cloudflare DNS)
- **Repo:** `GlobalWorldJournal/GWJ` (dedicated company GitHub org, NOT the OxyHQ org)
- **Design spec:** `docs/superpowers/specs/2026-06-23-gwj-design.md`
- **Build plan:** `docs/superpowers/plans/2026-06-23-gwj-build.md`

## Architecture
Bun monorepo, `packages/` layout. Single Zod source of truth shared by all packages.
```
packages/
  shared-types/  @gwj/shared-types — Zod schemas + TS types
  backend/       @gwj/backend     — Express 5 + Drizzle (PostgreSQL) + Zod; REST + service layer; admin JWT; S3 upload
  mcp/           @gwj/mcp         — @modelcontextprotocol/sdk HTTP server (bearer token); wraps backend
  frontend/      @gwj/frontend    — Vite 6 + React 19 + Tailwind 4 (SPA) + public/_worker.js (Cloudflare SEO)
```

## Stack
TypeScript (strict), Vite 6, React 19, Tailwind 4, Express 5, Drizzle ORM + postgres.js, Zod, `@modelcontextprotocol/sdk`, bcrypt (`Bun.password`), jsonwebtoken, multer, `@aws-sdk/client-s3`, `bun test` + supertest (frontend: Vitest + jsdom). PostgreSQL 17 (database `gwj` on `oxy-postgres`). S3 `gwj-media` + CloudFront `cdn.globalworldjournal.com`. Backend+MCP on AWS ECS Fargate; frontend on Cloudflare Pages.

## Database (PostgreSQL) — rules (details: `docs/DATABASE.md`)
- PostgreSQL is the only datastore. Never add a second database, driver or ORM beside Drizzle/postgres.js; `DATABASE_URL` is the only connection setting.
- Migrations: `bun run --cwd packages/backend db:generate`, then add exactly one `-- oxy:deploy-phase=pre|post` line and read the SQL. Apply ONLY with `db:migrate --target-database=<db>` (deploy runs it as an ECS one-shot) — never `drizzle-kit migrate`, never hand-edit `drizzle/meta`.
- Adding a category/language/status value is a schema change: tuple + `db:generate` + migration in the same PR (CHECK constraints).
- DB tests are `*.realdb.test.ts` against real Postgres: `TEST_POSTGRES_URL=postgres://gwj:gwj@127.0.0.1:5432/postgres bun run test` (`docker compose up -d postgres`). No mocks, no skips.
- Article/user ids stay 24-hex (federated Note ids embed them). SQLSTATE is on `err.cause` — use `src/db/pgErrors.ts`.

## Editorial voice (user decision, 2026-10-23)
Every story is GWJ's own reporting. Nothing published or stored may reveal outside provenance or AI drafting: no `source`/provenance fields, no outlet photo credits (there is no credit field), no source lists in bodies, no AI disclosures in copy. Name another outlet only for a direct quote or an exclusive given to it.

## Categories (fixed)
`World, Business, Markets, Tech, Politics, Opinion, Arts`

## Design (Direction A — "WSJ Classic")
Fonts: Playfair Display (headlines) · Libre Franklin (labels/kickers/bylines) · PT Serif (body). Accent red `#b31217`. Black/white, hairline rules, dense WSJ grid, centered serif masthead with double rule.

## Conventions (universal — these DO apply)
- Package manager: **bun** only (`bunx`, `bun install`, `bun.lock`). Never npm/yarn.
- `linker = "hoisted"` in root `bunfig.toml`.
- TypeScript strict. BANNED: `as any`, `@ts-ignore`/`@ts-expect-error`, `!` non-null assertions, silent `catch {}`, committed `console.log`, `var`, hardcoded secrets/URLs/magic numbers, TODO/FIXME/HACK comments.
- The bans are enforced, not advisory: `bun run lint` (Biome + `scripts/check-banned.ts`) and the type checker's (`bun check`) `noUnusedLocals`/`noUnusedParameters` gate CI. Scripts print with `process.stdout/stderr.write`.
- Formatting and lint are Biome (`biome.json`, single quotes, semicolons, width 100): `bun run format` / `bun run lint:fix`; CI runs `biome ci .`, so unformatted code fails. No ESLint/Prettier.
- Avoid `useEffect` for data — use React Query / derived state / event handlers.
- No re-export barrel hacks (a package's own `index.ts` public surface is fine).
- Secrets via env only; never commit values; guard placeholder `-`/empty before use.
- Production-grade, clean, root-cause fixes. Self-audit integration points before claiming done.
- Conventional commits; end commit body with the Claude co-author trailer.

## Instruction files pattern
`AGENTS.md` is the single source of truth. `CLAUDE.md` is a thin `@AGENTS.md` import shim. Never let them diverge — edit `AGENTS.md` only.
