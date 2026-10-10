# Build context is the REPO ROOT (see deploy-aws.yml: context: .)
FROM oven/bun:1.3.14-alpine AS base
WORKDIR /app

COPY bunfig.toml package.json bun.lock ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/backend/package.json packages/backend/
COPY packages/mcp/package.json packages/mcp/
COPY packages/frontend/package.json packages/frontend/
# Every workspace in bun.lock must be present, or --frozen-lockfile refuses.
COPY packages/mongo-migration/package.json packages/mongo-migration/
RUN bun install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/shared-types packages/shared-types
COPY packages/mcp packages/mcp

ENV NODE_ENV=production
ENV MCP_PORT=4100
EXPOSE 4100
WORKDIR /app/packages/mcp
CMD ["bun", "run", "src/index.ts"]
