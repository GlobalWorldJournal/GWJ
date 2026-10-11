# Global World Journal (GWJ) — Design Spec

> **Historical (design spec of 2026-06-23).** Kept as the record of the original v1 intent; it is NOT the current architecture. Its database choice is stated as it is now (PostgreSQL + Drizzle, `DATABASE_URL`); it predates the OIDC/SSM secret model and the CI-gated, digest-pinned deploys. Current sources of truth: `AGENTS.md`, `docs/DATABASE.md`, `docs/INFRA.md`, `infra/`.

**Date:** 2026-06-23
**Domain:** globalworldjournal.com (Cloudflare DNS)
**Goal:** A WSJ-style news site for "Global World Journal" — public reader site + admin CMS + an MCP server so AI agents can manage the newspaper. Vite + Tailwind frontend, PostgreSQL (Drizzle) + Zod backend, deployed on AWS (backend) + Cloudflare Pages (frontend).

## Scope (v1)
- **Reader site** — public homepage (WSJ-style dense grid) + article pages + category pages + search.
- **Admin CMS** — single admin user `nate`, login-protected, create/edit/publish/delete articles, upload images.
- **MCP server** — remote HTTP MCP (bearer token) exposing content-management tools so AI agents create/edit/publish articles and upload images.

Out of scope v1: multi-user accounts, paywall/subscriptions, comments, newsletters.

## Architecture
Bun monorepo, `packages/` layout. One Zod source of truth shared by API, MCP, and frontend.

```
GWJ/
  packages/
    shared-types/   @gwj/shared-types — Zod schemas + inferred TS types (Article, Category, User, DTOs)
    backend/        @gwj/backend     — Express 5 + Drizzle (PostgreSQL) + Zod; REST API; admin JWT; S3 upload
    mcp/            @gwj/mcp         — @modelcontextprotocol/sdk HTTP server; tools call backend service layer
    frontend/       @gwj/frontend    — Vite 6 + React 19 + TS + Tailwind 4 (SPA) + public/_worker.js (SEO)
  bunfig.toml       # linker = "hoisted"
  package.json      # workspaces: ["packages/*"]
  tsconfig.base.json
```

Data flow: agents/admin → (MCP tools | admin REST) → backend service layer → PostgreSQL / S3. Readers → SPA → public REST. Crawlers → CF `_worker.js` → prerendered HTML + JSON-LD.

## Data model (Zod in shared-types → Drizzle tables)
**Article**
- `slug` (string, unique, kebab) · `title` · `deck` (subhead) · `kicker` (eyebrow label) · `category` (enum) · `author` (string)
- `body`: ordered array of content blocks — `{type:'paragraph', text}` | `{type:'heading', text}` | `{type:'image', url, caption?, credit?}` | `{type:'quote', text, attribution?}` | `{type:'list', ordered, items[]}`
- `heroImage`: `{ url, caption?, credit?, alt }` (optional)
- `status`: `'draft' | 'published'` · `featured`: number (0 = normal; higher = portada rank) · `tags`: string[]
- `seo`: `{ metaTitle?, metaDescription?, ogImage? }` (fallback to title/deck/heroImage)
- `publishedAt`: date|null · `createdAt` · `updatedAt`
- Indexes: unique `slug`; `{status, publishedAt:-1}`; `{category, publishedAt:-1}`; text index on `title, deck`.

**Category** — fixed enum, seeded: `World, Business, Markets, Tech, Politics, Opinion, Arts`. Doc: `{ slug, name, order }`.

**User** — only `nate`: `{ username, passwordHash (bcrypt), role:'admin', createdAt }`. Seeded from `ADMIN_USERNAME` + `ADMIN_PASSWORD` env at deploy; password never committed.

## Backend API (Express 5)
Public (no auth):
- `GET /api/articles?category=&featured=&page=&limit=` → published only, paginated.
- `GET /api/articles/:slug` → single published article.
- `GET /api/categories`
- `GET /api/search?q=` → text search published.
- `GET /healthz`

Admin (JWT bearer, login as `nate`):
- `POST /api/auth/login` → `{token}`
- `GET /api/admin/articles` (incl. drafts) · `POST /api/admin/articles` · `PATCH /api/admin/articles/:id` · `DELETE /api/admin/articles/:id`
- `POST /api/admin/articles/:id/publish` (sets status+publishedAt) · `/unpublish`
- `POST /api/admin/upload` (multipart → S3 → `{ url }` CDN)

Cross-cutting: Zod-validate every request body (shared schemas); `helmet`; CORS allowlist (frontend + admin origins); per-route rate limits; structured errors `{error, details?}`. A **service layer** (`services/articleService.ts`, `uploadService.ts`) holds business logic so REST controllers and MCP tools share it (no duplication).

## MCP server (remote HTTP, bearer)
`@modelcontextprotocol/sdk` Streamable HTTP transport. Auth: `Authorization: Bearer <MCP_TOKEN>` (SSM secret). Tools (args validated by the same Zod schemas):
- `list_articles({status?, category?, page?})` · `get_article({slug|id})`
- `create_article({...ArticleInput})` → returns slug/id
- `update_article({id, ...partial})` · `publish_article({id})` · `unpublish_article({id})` · `delete_article({id})`
- `upload_image({ base64|url, filename, alt? })` → returns CDN url
- `list_categories()`
Tools call the backend **service layer** directly (same process or internal HTTP) — single business-logic path.

## SEO (rendering option A)
`packages/frontend/public/_worker.js` (Expo-style copy of `public/` → `dist/`; Advanced-Mode `_worker.js` at deploy root):
- For `/`, `/article/:slug`, `/:category`: fetch API, inject `<title>`, meta description, Open Graph, Twitter card, and **JSON-LD `NewsArticle`/`WebSite`**; serve prerendered HTML head + content shell. SPA hydrates for users.
- `GET /sitemap.xml` (published articles + categories) and `/robots.txt` generated by the worker.
- Otherwise `env.ASSETS.fetch(request)` (honors `_redirects` SPA fallback).

## UI / design (Direction A — "WSJ Classic")
- **Fonts (Google):** Headlines **Playfair Display** (800/900) · labels/kickers/bylines **Libre Franklin** (uppercase, tracked) · body & decks **PT Serif**.
- **Color:** black `#111` text, white bg, accent red `#b31217`, hairline rules `#ddd`/`#e5e5e5`. Minimal color, WSJ-restrained.
- **Masthead:** centered serif "Global World Journal", date line + double rule under it. Section nav bar below (the 7 categories + Search).
- **Homepage:** dense grid — lead/hero story (large headline + hero image), secondary stories in columns separated by thin vertical rules, a "What's News" rail (bulleted brief items), section blocks per category. Kicker eyebrows, serif heads, sans bylines.
- **Article page:** single measured-width reading column, kicker + headline + deck + byline + hero, serif body, related links.
- **Responsive:** mobile-first; multi-column grid collapses to single column; nav → drawer on small screens. Tailwind v4 with design tokens as CSS vars.

## Infra / deploy
- **Backend + MCP:** Docker ARM64 → ECR → ECS Fargate (mirror Oxy pattern). ALB host rules: `api.globalworldjournal.com` → backend:PORT, `mcp.globalworldjournal.com` → mcp:PORT. (Or single service exposing both; decide in plan.)
- **DB:** PostgreSQL 17 — own database `gwj` (own role `gwj`) on the shared RDS instance `oxy-postgres`; no data shared with Oxy. `DATABASE_URL` secret.
- **Media:** S3 bucket `gwj-media` + CloudFront `cdn.globalworldjournal.com`. Public read via CDN; uploads via signed backend.
- **Frontend:** Cloudflare Pages, `globalworldjournal.com` + `www`. Build = `bun run build` (Vite) producing `dist/` with `_worker.js`.
- **Secrets:** GitHub Actions repo secrets → SSM `/gwj/*`. `JWT_SECRET`, `DATABASE_URL`, `MCP_TOKEN`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `AWS_*`, `S3_BUCKET`, `CDN_BASE_URL`. Never commit values; guard placeholders.
- **CI:** `.github/workflows/deploy-aws.yml` (build+push+ECS deploy) · `deploy-cloudflare.yml` (Pages). Pin `bun-version` consistently across CI + Dockerfile.

## Stack & quality
- TypeScript strict everywhere. No `as any`, no `@ts-ignore`, no `!`, no silent catches, no hardcoded secrets (per AGENTS.md).
- Vite 6, React 19, Tailwind 4, Express 5, Drizzle ORM + postgres.js, Zod, `@modelcontextprotocol/sdk`, bcrypt, jsonwebtoken, multer + `@aws-sdk/client-s3`.
- **Tests:** Vitest (Zod schema validation, service-layer logic, slug generation, JSON-LD builder) + supertest (API routes incl. auth + validation failures). MCP tool smoke tests against the service layer.

## Repo
New repo under the dedicated company GitHub org `GlobalWorldJournal/GWJ` (NOT oxy).

## Open items (resolved)
- Rendering: A (SPA + `_worker.js` SEO). ✅
- MCP transport: A (remote HTTP, bearer). ✅
- Media: A (new S3 + CloudFront). ✅
- DB: PostgreSQL (`gwj` on `oxy-postgres`). ✅
- Typography: A (Playfair / Libre Franklin / PT Serif). ✅
