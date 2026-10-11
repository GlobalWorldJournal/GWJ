# Build context is the REPO ROOT (see deploy-aws.yml: context: .)
FROM oven/bun:1.4.2-alpine AS base
WORKDIR /app

COPY bunfig.toml package.json bun.lock ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/backend/package.json packages/backend/
COPY packages/mcp/package.json packages/mcp/
COPY packages/frontend/package.json packages/frontend/
# Production dependencies of the workspaces this image runs, nothing else (no
# test/build tooling, no frontend). Every manifest above is still copied: the
# frozen lockfile describes the whole workspace.
RUN bun install --frozen-lockfile --production --filter '@gwj/mcp'

COPY tsconfig.base.json ./
COPY packages/shared-types packages/shared-types
COPY packages/mcp packages/mcp

ENV NODE_ENV=production
ENV MCP_PORT=4100
EXPOSE 4100
WORKDIR /app/packages/mcp
# The base image's unprivileged user: the app writes nothing to disk.
USER bun
CMD ["bun", "run", "src/index.ts"]
