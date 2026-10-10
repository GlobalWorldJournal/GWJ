import { timingSafeEqual } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Health } from '@gwj/shared-types';
import { createGwjClient, type BackendCredentials, type GwjClient } from './client.js';
import { loadEnv, type Env } from './env.js';
import { errorFields, logger } from './logger.js';
import { createMcpServer } from './tools.js';

const MCP_PATH = '/mcp';
const NANOSECONDS_PER_MILLISECOND = 1_000_000n;
const JSON_RPC_VERSION = '2.0';

/** Constant-time string comparison that never leaks length via timing-sensitive paths. */
function tokenEquals(presented: string | undefined, expected: string): boolean {
  if (presented === undefined) return false;
  const presentedBuf = Buffer.from(presented, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (presentedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(presentedBuf, expectedBuf);
}

/**
 * Constant-time comparison of a presented bearer token against the expected secret.
 * Returns false for any missing/malformed header or length mismatch without leaking timing.
 */
export function checkBearer(authorization: string | undefined, expected: string): boolean {
  if (!authorization) return false;
  const match = /^Bearer (.+)$/.exec(authorization);
  return tokenEquals(match?.[1], expected);
}

/**
 * Express middleware enforcing the MCP token. Accepts EITHER the
 * `Authorization: Bearer <token>` header OR a `?token=<token>` query param (for
 * clients that can't set custom headers). The header is preferred — a token in
 * the URL can leak into access logs.
 */
function requireBearer(expected: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
    if (checkBearer(req.headers.authorization, expected) || tokenEquals(queryToken, expected)) {
      next();
      return;
    }
    res.status(401).json({
      jsonrpc: JSON_RPC_VERSION,
      error: { code: -32001, message: 'Unauthorized' },
      id: null,
    });
  };
}

/**
 * Build the express app: unauthenticated `/healthz`, bearer-gated stateless MCP at `/mcp`.
 * A fresh `McpServer` + transport is created per request (stateless Streamable HTTP).
 */
/**
 * One log line per MCP request. The path is logged WITHOUT its query string: a
 * client that cannot send headers authenticates with `?token=`, which must never
 * reach the logs. The ALB's health polls are skipped.
 */
function requestLog() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const started = process.hrtime.bigint();
    // Captured now: by `finish` a mounted router has rewritten req.url/req.path.
    const path = req.path;
    res.on('finish', () => {
      if (path === '/healthz' && res.statusCode < 500) return;
      const fields = {
        method: req.method,
        path,
        status: res.statusCode,
        durationMs: Number((process.hrtime.bigint() - started) / NANOSECONDS_PER_MILLISECOND),
      };
      if (res.statusCode >= 500) logger.error('request', fields);
      else logger.info('request', fields);
    });
    next();
  };
}

export function createApp(env: Env, client: GwjClient): express.Express {
  const app = express();
  app.use(requestLog());
  app.use(express.json({ limit: '25mb' }));

  const health: Health = { ok: true, release: env.GWJ_RELEASE ?? null };
  app.get('/healthz', (_req, res) => {
    res.json(health);
  });

  app.use(MCP_PATH, requireBearer(env.MCP_TOKEN));

  app.post(MCP_PATH, async (req, res) => {
    let transport: StreamableHTTPServerTransport | undefined;
    try {
      const server = await createMcpServer(client);
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => {
        void transport?.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      // Details go to the log; the client gets a generic JSON-RPC error. (Tool
      // failures are not this path: `guard` returns those to the agent as results.)
      logger.error('mcp request failed', errorFields(error));
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: JSON_RPC_VERSION,
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
      void transport?.close();
    }
  });

  // The stateless transport does not support standalone GET/DELETE sessions.
  const methodNotAllowed = (_req: Request, res: Response): void => {
    res.status(405).json({
      jsonrpc: JSON_RPC_VERSION,
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    });
  };
  app.get(MCP_PATH, methodNotAllowed);
  app.delete(MCP_PATH, methodNotAllowed);

  return app;
}

/** The API token when configured; otherwise the admin login (transition). */
function backendCredentials(env: Env): BackendCredentials {
  if (env.GWJ_API_TOKEN) return { kind: 'token', token: env.GWJ_API_TOKEN };
  if (env.ADMIN_USERNAME && env.ADMIN_PASSWORD) {
    return { kind: 'password', username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD };
  }
  throw new Error('No backend credentials (loadEnv guarantees one kind is set)');
}

function main(): void {
  const env = loadEnv();
  const client = createGwjClient({
    apiBaseUrl: env.API_BASE_URL,
    credentials: backendCredentials(env),
  });
  const app = createApp(env, client);
  app.listen(env.MCP_PORT, () => {
    logger.info('gwj mcp listening', { port: env.MCP_PORT });
  });
}

// Only auto-start when run directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
