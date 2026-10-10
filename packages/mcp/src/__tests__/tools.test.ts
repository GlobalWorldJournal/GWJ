import { CATEGORIES, WRITERS, pickWriter, type Article } from '@gwj/shared-types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { checkBearer, createApp } from '../index.js';
import { createMcpServer } from '../tools.js';
import type { GwjClient } from '../client.js';

function sampleArticle(overrides: Partial<Article> = {}): Article {
  const now = new Date().toISOString();
  return {
    id: 'a1',
    slug: 'sample-article',
    title: 'Sample Article',
    category: CATEGORIES[0],
    language: 'en',
    author: 'nate',
    body: 'hello',
    status: 'draft',
    featured: 0,
    tags: [],
    seo: {},
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
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
    listRevisions: vi.fn(),
    getRevision: vi.fn(),
    restoreRevision: vi.fn(),
    addCorrection: vi.fn(),
  };
}

/** Spin up the MCP server with a mocked client and a connected in-memory client. */
async function connect(client: GwjClient): Promise<Client> {
  const server = await createMcpServer(client);
  const mcpClient = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), mcpClient.connect(clientTransport)]);
  return mcpClient;
}

describe('GWJ MCP tools', () => {
  let mcpClient: Client | undefined;

  afterEach(async () => {
    await mcpClient?.close();
    mcpClient = undefined;
  });

  it('exposes all content tools', async () => {
    mcpClient = await connect(mockClient());
    const { tools } = await mcpClient.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'add_correction',
        'create_article',
        'delete_article',
        'get_article',
        'get_revision',
        'link_translation',
        'list_articles',
        'list_categories',
        'list_languages',
        'list_revisions',
        'list_writers',
        'publish_article',
        'restore_revision',
        'unpublish_article',
        'update_article',
        'upload_image',
      ].sort(),
    );
  });

  it('create_article validates input and creates the article published, in ONE call', async () => {
    const client = mockClient();
    const created = sampleArticle({ id: 'created-1', status: 'published' });
    vi.mocked(client.createArticle).mockResolvedValue(created);
    mcpClient = await connect(client);

    const result = await mcpClient.callTool({
      name: 'create_article',
      arguments: {
        title: 'Markets rally on rate-cut hopes',
        category: CATEGORIES[2],
        author: 'nate',
        body: '# Markets rally\n\nEquities climbed today.',
      },
    });

    expect(client.createArticle).toHaveBeenCalledTimes(1);
    // Atomic: no separate publish call that could fail and strand a draft.
    expect(client.publishArticle).not.toHaveBeenCalled();
    const passed = vi.mocked(client.createArticle).mock.calls[0]?.[0];
    expect(passed?.title).toBe('Markets rally on rate-cut hopes');
    expect(passed?.category).toBe(CATEGORIES[2]);
    // An explicit author is preserved (not overwritten by the auto-byline).
    expect(passed?.author).toBe('nate');
    // The body is accepted as a Markdown string.
    expect(passed?.body).toBe('# Markets rally\n\nEquities climbed today.');
    // Published by default; schema defaults are applied before reaching the client.
    expect(passed?.status).toBe('published');
    expect(passed?.featured).toBe(0);
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0]?.text ?? '{}').id).toBe('created-1');
  });

  it('create_article with draft:true creates a draft', async () => {
    const client = mockClient();
    vi.mocked(client.createArticle).mockResolvedValue(sampleArticle({ id: 'held-1' }));
    mcpClient = await connect(client);

    const result = await mcpClient.callTool({
      name: 'create_article',
      arguments: {
        title: 'Held story',
        category: CATEGORIES[0],
        author: 'nate',
        body: 'Body',
        draft: true,
      },
    });

    expect(result.isError).toBeFalsy();
    expect(vi.mocked(client.createArticle).mock.calls[0]?.[0]?.status).toBe('draft');
    expect(client.publishArticle).not.toHaveBeenCalled();
  });

  it('auto-assigns a roster byline when create_article omits the author', async () => {
    const client = mockClient();
    vi.mocked(client.createArticle).mockResolvedValue(sampleArticle({ id: 'auto-1' }));
    mcpClient = await connect(client);

    const title = 'Chipmakers post record quarterly revenue';
    const category = 'Tech';
    const result = await mcpClient.callTool({
      name: 'create_article',
      arguments: {
        title,
        category,
        body: 'Demand for AI accelerators drove the surge.',
      },
    });

    expect(result.isError).toBeFalsy();
    expect(client.createArticle).toHaveBeenCalledTimes(1);
    const passed = vi.mocked(client.createArticle).mock.calls[0]?.[0];
    // The byline is filled in deterministically by pickWriter for the category.
    const expected = pickWriter(category, title);
    expect(passed?.author).toBe(expected.name);
    // The assigned writer is a real member of the roster on the matching beat.
    expect(WRITERS.some((w) => w.name === passed?.author)).toBe(true);
    expect(expected.beats).toContain(category);
  });

  it('rejects create_article with an invalid category and never calls the client', async () => {
    const client = mockClient();
    mcpClient = await connect(client);

    const result = await mcpClient.callTool({
      name: 'create_article',
      arguments: { title: 'X', category: 'Sports', author: 'nate', body: 'Body text' },
    });

    expect(result.isError).toBe(true);
    expect(client.createArticle).not.toHaveBeenCalled();
  });

  it('rejects create_article missing required fields', async () => {
    const client = mockClient();
    mcpClient = await connect(client);

    const result = await mcpClient.callTool({
      name: 'create_article',
      arguments: { title: 'No author or category' },
    });

    expect(result.isError).toBe(true);
    expect(client.createArticle).not.toHaveBeenCalled();
  });

  it('update_article splits id from the patch', async () => {
    const client = mockClient();
    vi.mocked(client.updateArticle).mockResolvedValue(
      sampleArticle({ id: 'u1', deck: 'new deck' }),
    );
    mcpClient = await connect(client);

    await mcpClient.callTool({
      name: 'update_article',
      arguments: { id: 'u1', deck: 'new deck' },
    });

    expect(client.updateArticle).toHaveBeenCalledWith('u1', { deck: 'new deck' });
  });

  it('surfaces a client error as an MCP error result', async () => {
    const client = mockClient();
    vi.mocked(client.publishArticle).mockRejectedValue(new Error('boom'));
    mcpClient = await connect(client);

    const result = await mcpClient.callTool({
      name: 'publish_article',
      arguments: { id: 'a1' },
    });

    expect(result.isError).toBe(true);
  });
});

describe('checkBearer', () => {
  const token = 'super-secret-token';

  it('accepts the correct bearer token', () => {
    expect(checkBearer(`Bearer ${token}`, token)).toBe(true);
  });

  it('rejects a wrong token', () => {
    expect(checkBearer('Bearer wrong-token', token)).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(checkBearer(undefined, token)).toBe(false);
  });

  it('rejects a malformed header (no Bearer prefix)', () => {
    expect(checkBearer(token, token)).toBe(false);
  });

  it('rejects an empty bearer value', () => {
    expect(checkBearer('Bearer ', token)).toBe(false);
  });
});

describe('loadEnv', () => {
  const base = {
    MCP_TOKEN: 'tok',
    API_BASE_URL: 'https://api.example.com',
    ADMIN_USERNAME: 'nate',
    ADMIN_PASSWORD: 'pw',
  };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('rejects a placeholder dash secret', async () => {
    const { loadEnv } = await import('../env.js');
    expect(() => loadEnv({ ...base, MCP_TOKEN: '-' })).toThrow(/MCP_TOKEN/);
  });

  it('rejects a missing required value', async () => {
    const { loadEnv } = await import('../env.js');
    const incomplete = { ...base };
    delete (incomplete as Record<string, string>).API_BASE_URL;
    expect(() => loadEnv(incomplete)).toThrow(/API_BASE_URL/);
  });

  it('defaults MCP_PORT and strips a trailing slash from API_BASE_URL', async () => {
    const { loadEnv } = await import('../env.js');
    const env = loadEnv({ ...base, API_BASE_URL: 'https://api.example.com/' });
    expect(env.MCP_PORT).toBe(4100);
    expect(env.API_BASE_URL).toBe('https://api.example.com');
  });
});

describe('GET /healthz', () => {
  it('reports the running release without requiring the MCP token', async () => {
    const { loadEnv } = await import('../env.js');
    const env = loadEnv({
      MCP_TOKEN: 'secret',
      API_BASE_URL: 'https://api.example.com',
      ADMIN_USERNAME: 'nate',
      ADMIN_PASSWORD: 'pw',
      GWJ_RELEASE: 'abc123',
    });
    const server = createApp(env, mockClient()).listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${port}/healthz`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, release: 'abc123' });
    } finally {
      server.close();
    }
  });
});

describe('MCP request log', () => {
  it('logs the request path but never the query string (which may carry ?token=)', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const { loadEnv } = await import('../env.js');
    const env = loadEnv({
      MCP_TOKEN: 'secret',
      API_BASE_URL: 'https://api.example.com',
      ADMIN_USERNAME: 'nate',
      ADMIN_PASSWORD: 'pw',
    });
    const server = createApp(env, mockClient()).listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${port}/mcp?token=wrong-token-value`, {
        method: 'POST',
      });
      expect(res.status).toBe(401);
      await new Promise((resolve) => setImmediate(resolve));
      const logged = stdout.mock.calls.map(([chunk]) => String(chunk)).join('');
      expect(logged).toContain('"path":"/mcp"');
      expect(logged).toContain('"status":401');
      expect(logged).not.toContain('wrong-token-value');
    } finally {
      server.close();
      stdout.mockRestore();
    }
  });
});

describe('MCP HTTP hardening', () => {
  it('sends security headers and cuts off a client after repeated failed authentications', async () => {
    const { loadEnv } = await import('../env.js');
    const env = loadEnv({
      MCP_TOKEN: 'secret',
      API_BASE_URL: 'https://api.example.com',
      ADMIN_USERNAME: 'nate',
      ADMIN_PASSWORD: 'pw',
    });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const server = createApp(env, mockClient()).listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      const url = `http://127.0.0.1:${port}/mcp`;
      const attempt = () =>
        fetch(url, { method: 'POST', headers: { authorization: 'Bearer wrong' } });

      const first = await attempt();
      expect(first.status).toBe(401);
      expect(first.headers.get('x-content-type-options')).toBe('nosniff');
      for (let i = 1; i < 20; i += 1) expect((await attempt()).status).toBe(401);
      const refused = await attempt();
      expect(refused.status).toBe(429);
      expect(await refused.json()).toMatchObject({ error: { code: -32029 } });
    } finally {
      server.close();
    }
  });
});

describe('link_translation', () => {
  it('links an article into another story and returns it with its editions', async () => {
    const client = mockClient();
    vi.mocked(client.updateArticle).mockResolvedValue(sampleArticle({ id: 'es-1' }));
    vi.mocked(client.getArticle).mockResolvedValue(
      sampleArticle({
        id: 'es-1',
        translations: [{ id: 'en-1', language: 'en', slug: 'original', status: 'published' }],
      }),
    );
    const mcp = await connect(client);
    const result = await mcp.callTool({
      name: 'link_translation',
      arguments: { id: 'es-1', translationOf: 'en-1' },
    });
    await mcp.close();

    expect(result.isError).toBeFalsy();
    expect(client.updateArticle).toHaveBeenCalledWith('es-1', { translationOf: 'en-1' });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0]?.text ?? '{}').translations).toHaveLength(1);
  });
});

describe('revision tools', () => {
  it('restore_revision rolls back by article id and revision id', async () => {
    const client = mockClient();
    vi.mocked(client.restoreRevision).mockResolvedValue(
      sampleArticle({ id: 'a1', title: 'Old headline' }),
    );
    const mcp = await connect(client);
    const result = await mcp.callTool({
      name: 'restore_revision',
      arguments: { id: 'a1', revisionId: 7 },
    });
    await mcp.close();
    expect(result.isError).toBeFalsy();
    expect(client.restoreRevision).toHaveBeenCalledWith('a1', 7);
  });

  it('rejects a non-integer revision id without calling the backend', async () => {
    const client = mockClient();
    const mcp = await connect(client);
    const result = await mcp.callTool({
      name: 'get_revision',
      arguments: { id: 'a1', revisionId: 'latest' },
    });
    await mcp.close();
    expect(result.isError).toBe(true);
    expect(client.getRevision).not.toHaveBeenCalled();
  });
});

describe('create_article scheduling', () => {
  it('a scheduledAt makes the article a draft that waits for its time', async () => {
    const client = mockClient();
    vi.mocked(client.createArticle).mockResolvedValue(sampleArticle({ id: 'later-1' }));
    const mcp = await connect(client);
    const result = await mcp.callTool({
      name: 'create_article',
      arguments: {
        title: 'Morning briefing',
        category: CATEGORIES[0],
        author: 'nate',
        body: 'Body',
        scheduledAt: '2026-10-11T07:00:00Z',
      },
    });
    await mcp.close();
    expect(result.isError).toBeFalsy();
    expect(vi.mocked(client.createArticle).mock.calls[0]?.[0]).toMatchObject({
      status: 'draft',
      scheduledAt: '2026-10-11T07:00:00Z',
    });
  });
});

describe('add_correction', () => {
  it('appends a correction and rejects an empty one without calling the backend', async () => {
    const client = mockClient();
    vi.mocked(client.addCorrection).mockResolvedValue(sampleArticle({ id: 'a1' }));
    const mcp = await connect(client);
    const ok = await mcp.callTool({
      name: 'add_correction',
      arguments: { id: 'a1', text: 'An earlier version misstated the date of the vote.' },
    });
    const empty = await mcp.callTool({
      name: 'add_correction',
      arguments: { id: 'a1', text: '  ' },
    });
    await mcp.close();
    expect(ok.isError).toBeFalsy();
    expect(client.addCorrection).toHaveBeenCalledWith(
      'a1',
      'An earlier version misstated the date of the vote.',
    );
    expect(empty.isError).toBe(true);
    expect(client.addCorrection).toHaveBeenCalledTimes(1);
  });
});

describe('loadEnv credentials', () => {
  it('accepts an API token alone, or the admin login, and refuses neither', async () => {
    const { loadEnv } = await import('../env.js');
    const base = { MCP_TOKEN: 'secret', API_BASE_URL: 'https://api.example.com' };
    expect(loadEnv({ ...base, GWJ_API_TOKEN: 'gwj_x' }).GWJ_API_TOKEN).toBe('gwj_x');
    expect(loadEnv({ ...base, ADMIN_USERNAME: 'nate', ADMIN_PASSWORD: 'pw' }).ADMIN_USERNAME).toBe(
      'nate',
    );
    expect(() => loadEnv(base)).toThrow(/GWJ_API_TOKEN/);
    expect(() => loadEnv({ ...base, ADMIN_USERNAME: 'nate' })).toThrow(/GWJ_API_TOKEN/);
  });
});
