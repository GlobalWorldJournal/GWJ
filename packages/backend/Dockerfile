# Build context is the REPO ROOT (see deploy-aws.yml: context: .)
FROM oven/bun:1.3.14-alpine AS base
WORKDIR /app

# Install deps with the full workspace manifest set so the hoisted linker
# resolves all members; copy bunfig.toml FIRST so linker="hoisted" applies.
COPY bunfig.toml package.json bun.lock ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/backend/package.json packages/backend/
COPY packages/mcp/package.json packages/mcp/
COPY packages/frontend/package.json packages/frontend/
COPY packages/mongo-migration/package.json packages/mongo-migration/
RUN bun install --frozen-lockfile

# Source needed at runtime (bun runs TypeScript directly). `packages/backend`
# includes `drizzle/` — the migrations the one-shot `src/db/migrate.ts` applies.
COPY tsconfig.base.json ./
COPY packages/shared-types packages/shared-types
COPY packages/backend packages/backend
# TEMPORARY — the one-time Mongo -> Postgres copy, run as an ECS one-shot from
# this image during the cutover (docs/POSTGRES-CUTOVER.md). Removed, with the
# package, when gwj-mongo is decommissioned. The backend never imports it.
COPY packages/mongo-migration packages/mongo-migration

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000
WORKDIR /app/packages/backend
CMD ["bun", "run", "src/index.ts"]
