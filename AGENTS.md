# GWJ — Global World Journal

> Shared instructions for every AI coding agent (Claude Code, Codex, Gemini CLI, etc.) working in this repo.

## ⚠️ This project is INDEPENDENT of Oxy

**GWJ has NOTHING to do with the Oxy ecosystem.** It is Nate's personal company project (Global World Journal, globalworldjournal.com), separate from OxyHQ/Mention/Allo/Homiio/etc.

- Do **NOT** use any `@oxyhq/*` package (core, services, auth, bloom, contracts). GWJ has its own types, auth, and UI.
- Do **NOT** use Oxy SSO/FedCM, `cloud.oxy.so` media, the Oxy API, Oxy's MongoDB, or any Oxy application data.
- Do **NOT** spawn the Oxy team agents (mention-*, oxy-*, bloom, allo, etc.) for GWJ work.
- The global `~/AGENTS.md` Oxy rules (Oxy SDK versions, SSO architecture, agent-first Oxy team) **do not apply here**, except for universal quality standards (below).

**Hosting (user decision, 2026-06-23):** GWJ is hosted ON the Oxy AWS account (`237343248947`, us-west-2, CLI `--profile oxy`) for convenience, but as **fully ISOLATED `gwj-*` resources** — its own ECR repos, ECS services, S3 bucket (`gwj-media`), CloudFront, and a **NEW dedicated MongoDB** (NOT Oxy's Mongo EC2). GWJ shares no application data, database, SSO, or SDKs with Oxy. Frontend deploys to Cloudflare Pages (project `gwj`). Infra still belongs in `~/Oxy/oxy-infra/terraform-uswest2/` (e.g. `app-gwj.tf`), applied manually — do not patch it ad hoc.

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
  backend/       @gwj/backend     — Express 5 + Mongoose 8 + Zod; REST + service layer; admin JWT; S3 upload
  mcp/           @gwj/mcp         — @modelcontextprotocol/sdk HTTP server (bearer token); wraps backend
  frontend/      @gwj/frontend    — Vite 6 + React 19 + Tailwind 4 (SPA) + public/_worker.js (Cloudflare SEO)
```

## Stack
TypeScript (strict), Vite 6, React 19, Tailwind 4, Express 5, Mongoose 8, Zod, `@modelcontextprotocol/sdk`, bcrypt, jsonwebtoken, multer, `@aws-sdk/client-s3`, Vitest, supertest. MongoDB Atlas (M0, own cluster). S3 `gwj-media` + CloudFront `cdn.globalworldjournal.com`. Backend+MCP on AWS ECS Fargate; frontend on Cloudflare Pages.

## Categories (fixed)
`World, Business, Markets, Tech, Politics, Opinion, Arts`

## Design (Direction A — "WSJ Classic")
Fonts: Playfair Display (headlines) · Libre Franklin (labels/kickers/bylines) · PT Serif (body). Accent red `#b31217`. Black/white, hairline rules, dense WSJ grid, centered serif masthead with double rule.

## Conventions (universal — these DO apply)
- Package manager: **bun** only (`bunx`, `bun install`, `bun.lock`). Never npm/yarn.
- `linker = "hoisted"` in root `bunfig.toml`.
- TypeScript strict. BANNED: `as any`, `@ts-ignore`/`@ts-expect-error`, `!` non-null assertions, silent `catch {}`, committed `console.log`, `var`, hardcoded secrets/URLs/magic numbers, TODO/FIXME/HACK comments.
- Avoid `useEffect` for data — use React Query / derived state / event handlers.
- No re-export barrel hacks (a package's own `index.ts` public surface is fine).
- Secrets via env only; never commit values; guard placeholder `-`/empty before use.
- Production-grade, clean, root-cause fixes. Self-audit integration points before claiming done.
- Conventional commits; end commit body with the Claude co-author trailer.

## Instruction files pattern
`AGENTS.md` is the single source of truth. `CLAUDE.md` is a thin `@AGENTS.md` import shim. Never let them diverge — edit `AGENTS.md` only.
