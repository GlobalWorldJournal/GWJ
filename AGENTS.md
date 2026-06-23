# GWJ — Global World Journal

> Shared instructions for every AI coding agent (Claude Code, Codex, Gemini CLI, etc.) working in this repo.

## ⚠️ This project is INDEPENDENT of Oxy

**GWJ has NOTHING to do with the Oxy ecosystem.** It is Nate's personal company project (Global World Journal, globalworldjournal.com), separate from OxyHQ/Mention/Allo/Homiio/etc.

- Do **NOT** use any `@oxyhq/*` package (core, services, auth, bloom, contracts). GWJ has its own types, auth, and UI.
- Do **NOT** use Oxy SSO/FedCM, `cloud.oxy.so` media, Oxy API, or any Oxy infra/SSM/terraform.
- Do **NOT** spawn the Oxy team agents (mention-*, oxy-*, bloom, allo, etc.) for GWJ work.
- Do **NOT** deploy to the Oxy AWS account or Oxy Cloudflare projects. GWJ has its own AWS resources and its own Cloudflare Pages project.
- The global `~/AGENTS.md` Oxy rules (Oxy SDK versions, SSO architecture, Oxy infra, agent-first Oxy team) **do not apply here**, except for universal quality standards (below).

## What GWJ is
WSJ-style news site for "Global World Journal". Public reader SPA + admin CMS + a remote MCP server so AI agents manage the newspaper.

- **Domain:** globalworldjournal.com (Cloudflare DNS)
- **Repo:** `NateIsern/GWJ` (personal GitHub, NOT the OxyHQ org)
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
