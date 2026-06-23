import {
  ArticleInputSchema,
  ArticleListQuerySchema,
  ArticleUpdateSchema,
} from '@gwj/shared-types'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { BackendError, type GwjClient } from './client.js'

/** Wrap any serializable value as a single JSON text content block. */
function jsonResult(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

/** Turn a thrown error into an MCP error result instead of propagating it. */
function errorResult(error: unknown): CallToolResult {
  if (error instanceof BackendError) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { error: error.message, status: error.status, details: error.details },
            null,
            2,
          ),
        },
      ],
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: message }) }] }
}

/** Run a tool handler, converting any thrown error into an MCP error result. */
async function guard(run: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await run()
  } catch (error) {
    return errorResult(error)
  }
}

const ArticleRefShape = {
  id: z.string().min(1).optional().describe('Article id'),
  slug: z.string().min(1).optional().describe('Article slug'),
}

const ArticleIdShape = { id: z.string().min(1).describe('Article id') }

const UpdateArticleShape = {
  id: z.string().min(1).describe('Article id to update'),
  ...ArticleUpdateSchema.shape,
}

const UploadImageShape = {
  filename: z.string().min(1).describe('Target filename, e.g. "hero.jpg"'),
  alt: z.string().optional().describe('Alt text for the image'),
  base64: z.string().optional().describe('Base64-encoded image data (data URI prefix allowed)'),
  url: z.string().url().optional().describe('Remote image URL to fetch and re-upload'),
}

/**
 * Register every GWJ content-management tool on the given MCP server.
 * The client is injected so the server and the tool wiring can be tested in isolation.
 */
export function registerTools(server: McpServer, client: GwjClient): McpServer {
  server.registerTool(
    'list_articles',
    {
      description:
        'List articles (including drafts) with optional category/status/featured filters and pagination.',
      inputSchema: ArticleListQuerySchema.shape,
    },
    (args) => guard(async () => jsonResult(await client.listArticles(args))),
  )

  server.registerTool(
    'get_article',
    {
      description: 'Fetch a single article by `id` or `slug` (exactly one is required).',
      inputSchema: ArticleRefShape,
    },
    (args) => guard(async () => jsonResult(await client.getArticle(args))),
  )

  server.registerTool(
    'create_article',
    {
      description: 'Create a new article (defaults to draft). Returns the created article.',
      inputSchema: ArticleInputSchema.shape,
    },
    (args) => guard(async () => jsonResult(await client.createArticle(args))),
  )

  server.registerTool(
    'update_article',
    {
      description: 'Update fields of an existing article by id. Returns the updated article.',
      inputSchema: UpdateArticleShape,
    },
    (args) => {
      const { id, ...patch } = args
      return guard(async () => jsonResult(await client.updateArticle(id, patch)))
    },
  )

  server.registerTool(
    'publish_article',
    {
      description: 'Publish an article (sets status to published and stamps publishedAt).',
      inputSchema: ArticleIdShape,
    },
    ({ id }) => guard(async () => jsonResult(await client.publishArticle(id))),
  )

  server.registerTool(
    'unpublish_article',
    {
      description: 'Unpublish an article (reverts it to draft).',
      inputSchema: ArticleIdShape,
    },
    ({ id }) => guard(async () => jsonResult(await client.unpublishArticle(id))),
  )

  server.registerTool(
    'delete_article',
    {
      description: 'Permanently delete an article by id.',
      inputSchema: ArticleIdShape,
    },
    ({ id }) => guard(async () => jsonResult(await client.deleteArticle(id))),
  )

  server.registerTool(
    'upload_image',
    {
      description:
        'Upload an image from base64 data or a remote URL to media storage. Returns the CDN url.',
      inputSchema: UploadImageShape,
    },
    (args) => guard(async () => jsonResult(await client.uploadImage(args))),
  )

  server.registerTool(
    'list_categories',
    { description: 'List the fixed set of newspaper categories.' },
    () => guard(async () => jsonResult(await client.listCategories())),
  )

  return server
}

/** Construct the GWJ MCP server with all tools registered against the given client. */
export async function createMcpServer(client: GwjClient): Promise<McpServer> {
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js')
  const server = new McpServer(
    { name: 'gwj-mcp', version: '0.1.0' },
    { capabilities: { logging: {} } },
  )
  return registerTools(server, client)
}
