import { CATEGORIES, type Article } from '@gwj/shared-types'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkBearer } from '../index.js'
import { createMcpServer } from '../tools.js'
import type { GwjClient } from '../client.js'

function sampleArticle(overrides: Partial<Article> = {}): Article {
  const now = new Date().toISOString()
  return {
    id: 'a1',
    slug: 'sample-article',
    title: 'Sample Article',
    category: CATEGORIES[0],
    author: 'nate',
    body: [{ type: 'paragraph', text: 'hello' }],
    status: 'draft',
    featured: 0,
    tags: [],
    seo: {},
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

/** A fully-mocked GwjClient; each method is a vi.fn so calls can be asserted. */
function mockClient(): GwjClient {
  return {
    listArticles: vi.fn(),
    getArticle: vi.fn(),
    createArticle: vi.fn(),
    updateArticle: vi.fn(),
    publishArticle: vi.fn(),
    unpublishArticle: vi.fn(),
    deleteArticle: vi.fn(),
    uploadImage: vi.fn(),
    listCategories: vi.fn(),
  }
}

/** Spin up the MCP server with a mocked client and a connected in-memory client. */
async function connect(client: GwjClient): Promise<Client> {
  const server = await createMcpServer(client)
  const mcpClient = new Client({ name: 'test-client', version: '0.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)])
  return mcpClient
}

describe('GWJ MCP tools', () => {
  let mcpClient: Client | undefined

  afterEach(async () => {
    await mcpClient?.close()
    mcpClient = undefined
  })

  it('exposes all nine content tools', async () => {
    mcpClient = await connect(mockClient())
    const { tools } = await mcpClient.listTools()
    const names = tools.map((t) => t.name).sort()
    expect(names).toEqual(
      [
        'create_article',
        'delete_article',
        'get_article',
        'list_articles',
        'list_categories',
        'publish_article',
        'unpublish_article',
        'update_article',
        'upload_image',
      ].sort(),
    )
  })

  it('create_article validates input and calls client.createArticle', async () => {
    const client = mockClient()
    const created = sampleArticle({ id: 'created-1' })
    vi.mocked(client.createArticle).mockResolvedValue(created)
    mcpClient = await connect(client)

    const result = await mcpClient.callTool({
      name: 'create_article',
      arguments: {
        title: 'Markets rally on rate-cut hopes',
        category: CATEGORIES[2],
        author: 'nate',
        body: [{ type: 'paragraph', text: 'Equities climbed today.' }],
      },
    })

    expect(client.createArticle).toHaveBeenCalledTimes(1)
    const passed = vi.mocked(client.createArticle).mock.calls[0]?.[0]
    expect(passed?.title).toBe('Markets rally on rate-cut hopes')
    expect(passed?.category).toBe(CATEGORIES[2])
    // Schema defaults are applied before reaching the client.
    expect(passed?.status).toBe('draft')
    expect(passed?.featured).toBe(0)
    expect(result.isError).toBeFalsy()
    const content = result.content as Array<{ type: string; text: string }>
    expect(JSON.parse(content[0]?.text ?? '{}').id).toBe('created-1')
  })

  it('rejects create_article with an invalid category and never calls the client', async () => {
    const client = mockClient()
    mcpClient = await connect(client)

    const result = await mcpClient.callTool({
      name: 'create_article',
      arguments: { title: 'X', category: 'Sports', author: 'nate', body: [] },
    })

    expect(result.isError).toBe(true)
    expect(client.createArticle).not.toHaveBeenCalled()
  })

  it('rejects create_article missing required fields', async () => {
    const client = mockClient()
    mcpClient = await connect(client)

    const result = await mcpClient.callTool({
      name: 'create_article',
      arguments: { title: 'No author or category' },
    })

    expect(result.isError).toBe(true)
    expect(client.createArticle).not.toHaveBeenCalled()
  })

  it('update_article splits id from the patch', async () => {
    const client = mockClient()
    vi.mocked(client.updateArticle).mockResolvedValue(sampleArticle({ id: 'u1', deck: 'new deck' }))
    mcpClient = await connect(client)

    await mcpClient.callTool({
      name: 'update_article',
      arguments: { id: 'u1', deck: 'new deck' },
    })

    expect(client.updateArticle).toHaveBeenCalledWith('u1', { deck: 'new deck' })
  })

  it('surfaces a client error as an MCP error result', async () => {
    const client = mockClient()
    vi.mocked(client.publishArticle).mockRejectedValue(new Error('boom'))
    mcpClient = await connect(client)

    const result = await mcpClient.callTool({
      name: 'publish_article',
      arguments: { id: 'a1' },
    })

    expect(result.isError).toBe(true)
  })
})

describe('checkBearer', () => {
  const token = 'super-secret-token'

  it('accepts the correct bearer token', () => {
    expect(checkBearer(`Bearer ${token}`, token)).toBe(true)
  })

  it('rejects a wrong token', () => {
    expect(checkBearer('Bearer wrong-token', token)).toBe(false)
  })

  it('rejects a missing header', () => {
    expect(checkBearer(undefined, token)).toBe(false)
  })

  it('rejects a malformed header (no Bearer prefix)', () => {
    expect(checkBearer(token, token)).toBe(false)
  })

  it('rejects an empty bearer value', () => {
    expect(checkBearer('Bearer ', token)).toBe(false)
  })
})

describe('loadEnv', () => {
  const base = {
    MCP_TOKEN: 'tok',
    API_BASE_URL: 'https://api.example.com',
    ADMIN_USERNAME: 'nate',
    ADMIN_PASSWORD: 'pw',
  }

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('rejects a placeholder dash secret', async () => {
    const { loadEnv } = await import('../env.js')
    expect(() => loadEnv({ ...base, MCP_TOKEN: '-' })).toThrow(/MCP_TOKEN/)
  })

  it('rejects a missing required value', async () => {
    const { loadEnv } = await import('../env.js')
    const incomplete = { ...base }
    delete (incomplete as Record<string, string>).API_BASE_URL
    expect(() => loadEnv(incomplete)).toThrow(/API_BASE_URL/)
  })

  it('defaults MCP_PORT and strips a trailing slash from API_BASE_URL', async () => {
    const { loadEnv } = await import('../env.js')
    const env = loadEnv({ ...base, API_BASE_URL: 'https://api.example.com/' })
    expect(env.MCP_PORT).toBe(4100)
    expect(env.API_BASE_URL).toBe('https://api.example.com')
  })
})
