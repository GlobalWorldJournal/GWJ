import { timingSafeEqual } from 'node:crypto'
import express, { type NextFunction, type Request, type Response } from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createGwjClient, type GwjClient } from './client.js'
import { loadEnv, type Env } from './env.js'
import { createMcpServer } from './tools.js'

const MCP_PATH = '/mcp'
const JSON_RPC_VERSION = '2.0'

/**
 * Constant-time comparison of a presented bearer token against the expected secret.
 * Returns false for any missing/malformed header or length mismatch without leaking timing.
 */
export function checkBearer(authorization: string | undefined, expected: string): boolean {
  if (!authorization) return false
  const match = /^Bearer (.+)$/.exec(authorization)
  const presentedToken = match?.[1]
  if (presentedToken === undefined) return false
  const presented = Buffer.from(presentedToken, 'utf8')
  const expectedBuf = Buffer.from(expected, 'utf8')
  if (presented.length !== expectedBuf.length) return false
  return timingSafeEqual(presented, expectedBuf)
}

/** Express middleware factory enforcing the MCP bearer token. */
function requireBearer(expected: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (checkBearer(req.headers.authorization, expected)) {
      next()
      return
    }
    res
      .status(401)
      .json({ jsonrpc: JSON_RPC_VERSION, error: { code: -32001, message: 'Unauthorized' }, id: null })
  }
}

/**
 * Build the express app: unauthenticated `/healthz`, bearer-gated stateless MCP at `/mcp`.
 * A fresh `McpServer` + transport is created per request (stateless Streamable HTTP).
 */
export function createApp(env: Env, client: GwjClient): express.Express {
  const app = express()
  app.use(express.json({ limit: '25mb' }))

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true })
  })

  app.use(MCP_PATH, requireBearer(env.MCP_TOKEN))

  app.post(MCP_PATH, async (req, res) => {
    let transport: StreamableHTTPServerTransport | undefined
    try {
      const server = await createMcpServer(client)
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
      res.on('close', () => {
        void transport?.close()
        void server.close()
      })
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      if (!res.headersSent) {
        res
          .status(500)
          .json({ jsonrpc: JSON_RPC_VERSION, error: { code: -32603, message }, id: null })
      }
      void transport?.close()
    }
  })

  // The stateless transport does not support standalone GET/DELETE sessions.
  const methodNotAllowed = (_req: Request, res: Response): void => {
    res
      .status(405)
      .json({ jsonrpc: JSON_RPC_VERSION, error: { code: -32000, message: 'Method not allowed.' }, id: null })
  }
  app.get(MCP_PATH, methodNotAllowed)
  app.delete(MCP_PATH, methodNotAllowed)

  return app
}

function main(): void {
  const env = loadEnv()
  const client = createGwjClient({
    apiBaseUrl: env.API_BASE_URL,
    adminUsername: env.ADMIN_USERNAME,
    adminPassword: env.ADMIN_PASSWORD,
  })
  const app = createApp(env, client)
  app.listen(env.MCP_PORT, () => {
    process.stdout.write(`@gwj/mcp listening on :${env.MCP_PORT}\n`)
  })
}

// Only auto-start when run directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
