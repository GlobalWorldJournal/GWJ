import {
  ArticleInputSchema,
  ArticleListQuerySchema,
  ArticleUpdateSchema,
  CorrectionInputSchema,
  PopularArticlesQuerySchema,
  TakedownActionSchema,
  TakedownListQuerySchema,
  LANGUAGE_NAMES,
  SUPPORTED_LANGUAGES,
  WRITERS,
  authorSlug,
  pickWriter,
} from '@gwj/shared-types';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { BackendError, type GwjClient } from './client.js';

/** Wrap any serializable value as a single JSON text content block. */
function jsonResult(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
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
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: message }) }] };
}

/** Run a tool handler, converting any thrown error into an MCP error result. */
async function guard(run: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await run();
  } catch (error) {
    return errorResult(error);
  }
}

const ArticleRefShape = {
  id: z.string().min(1).optional().describe('Article id'),
  slug: z.string().min(1).optional().describe('Article slug'),
};

const ArticleIdShape = { id: z.string().min(1).describe('Article id') };

const CorrectionShape = {
  id: z.string().min(1).describe('Article id'),
  ...CorrectionInputSchema.shape,
};

const RevisionShape = {
  id: z.string().min(1).describe('Article id'),
  revisionId: z.number().int().positive().describe('A revision id from list_revisions'),
};

const LinkTranslationShape = {
  id: z.string().min(1).describe('The article to link (e.g. the Spanish edition)'),
  translationOf: z
    .string()
    .min(1)
    .describe('Any article of the story it translates (e.g. the English original)'),
};

/**
 * Create-article input: `author` is optional because the agent normally should
 * not name a byline. When omitted, the tool auto-assigns one from the writer
 * roster (see `pickWriter`) based on the article's category before calling the
 * backend, which still requires an author.
 */
const CreateArticleShape = {
  // `status` is driven by `draft` below, so the two can never disagree.
  ...ArticleInputSchema.omit({ status: true }).shape,
  author: z
    .string()
    .min(1)
    .optional()
    .describe('Byline; auto-assigned from the writer roster by category when omitted'),
  draft: z
    .boolean()
    .optional()
    .describe('Hold as a draft instead of publishing. Default: false (publish immediately).'),
};

const UpdateArticleShape = {
  id: z.string().min(1).describe('Article id to update'),
  ...ArticleUpdateSchema.shape,
};

const TakedownActionShape = {
  id: z.string().min(1).describe('Takedown request id from list_takedowns'),
  ...TakedownActionSchema.shape,
};

const UploadImageShape = {
  filename: z.string().min(1).describe('Target filename, e.g. "hero.jpg"'),
  base64: z.string().optional().describe('Base64-encoded image data (data URI prefix allowed)'),
  url: z
    .string()
    .url()
    .optional()
    .describe(
      'Remote https image URL; the server downloads it, validates it and copies it to our CDN',
    ),
};

/**
 * Register every GWJ content-management tool on the given MCP server.
 * The client is injected so the server and the tool wiring can be tested in isolation.
 */
export function registerTools(server: McpServer, client: GwjClient): McpServer {
  server.registerTool(
    'list_articles',
    {
      description:
        'List or SEARCH articles (including drafts). Pass `q` to full-text search headlines, decks and bodies (each edition in its own language; headline matches rank first) — ALWAYS do this before create_article to check whether a similar story already exists and avoid publishing a duplicate. Also filters by language, category, status, featured, `tag` and `author` (exact byline); `sort: "latest"` lists newest first instead of front-page order; paginated.',
      inputSchema: ArticleListQuerySchema.shape,
    },
    (args) => guard(async () => jsonResult(await client.listArticles(args))),
  );

  server.registerTool(
    'get_article',
    {
      description: 'Fetch a single article by `id` or `slug` (exactly one is required).',
      inputSchema: ArticleRefShape,
    },
    (args) => guard(async () => jsonResult(await client.getArticle(args))),
  );

  server.registerTool(
    'create_article',
    {
      description:
        'Create and PUBLISH a new article immediately (pass draft:true to hold it back, or scheduledAt to publish it automatically at that time). The byline is auto-assigned from the writer roster by category when `author` is omitted. Returns the article.',
      inputSchema: CreateArticleShape,
    },
    (args) => {
      const { draft, ...rest } = args;
      const author = rest.author ?? pickWriter(rest.category, rest.title).name;
      // One request creates the article directly in its final state: a failure
      // can never leave an orphan draft that a retry would then duplicate.
      // A scheduled story waits as a draft until its time comes.
      const status = draft || rest.scheduledAt ? 'draft' : 'published';
      return guard(async () => jsonResult(await client.createArticle({ ...rest, author, status })));
    },
  );

  server.registerTool(
    'update_article',
    {
      description: 'Update fields of an existing article by id. Returns the updated article.',
      inputSchema: UpdateArticleShape,
    },
    (args) => {
      const { id, ...patch } = args;
      return guard(async () => jsonResult(await client.updateArticle(id, patch)));
    },
  );

  server.registerTool(
    'publish_article',
    {
      description: 'Publish an article (sets status to published and stamps publishedAt).',
      inputSchema: ArticleIdShape,
    },
    ({ id }) => guard(async () => jsonResult(await client.publishArticle(id))),
  );

  server.registerTool(
    'unpublish_article',
    {
      description: 'Unpublish an article (reverts it to draft).',
      inputSchema: ArticleIdShape,
    },
    ({ id }) => guard(async () => jsonResult(await client.unpublishArticle(id))),
  );

  server.registerTool(
    'delete_article',
    {
      description: 'Permanently delete an article by id.',
      inputSchema: ArticleIdShape,
    },
    ({ id }) => guard(async () => jsonResult(await client.deleteArticle(id))),
  );

  server.registerTool(
    'upload_image',
    {
      description:
        'Copy an image to our CDN from a remote URL (preferred) or base64 data. It is validated first: a 422 means the image is unusable (not an image, truncated, too small or too large) — try another image. Returns the CDN url. Alt text belongs on the article (heroImage.alt or the Markdown image), not here.',
      inputSchema: UploadImageShape,
    },
    (args) => guard(async () => jsonResult(await client.uploadImage(args))),
  );

  server.registerTool(
    'list_categories',
    { description: 'List the fixed set of newspaper categories.' },
    () => guard(async () => jsonResult(await client.listCategories())),
  );

  server.registerTool(
    'add_correction',
    {
      description:
        'Append a dated, PUBLIC correction note to an article after fixing a factual error in it (fix the text with update_article first). Readers see it below the story; it can never be edited or removed. Use it for factual errors, not for routine copy edits.',
      inputSchema: CorrectionShape,
    },
    ({ id, text }) => guard(async () => jsonResult(await client.addCorrection(id, text))),
  );

  server.registerTool(
    'list_revisions',
    {
      description:
        "An article's history, newest first: each revision is the state BEFORE one change, with who made it (`actor`) and when. Use get_revision to read one and restore_revision to roll the content back.",
      inputSchema: ArticleIdShape,
    },
    ({ id }) => guard(async () => jsonResult(await client.listRevisions(id))),
  );

  server.registerTool(
    'get_revision',
    {
      description: "One revision's full snapshot (headline, body, images, tags, SEO…).",
      inputSchema: RevisionShape,
    },
    ({ id, revisionId }) => guard(async () => jsonResult(await client.getRevision(id, revisionId))),
  );

  server.registerTool(
    'restore_revision',
    {
      description:
        "Roll an article's CONTENT back to a revision (live/draft status and URL are unchanged). The restore is itself recorded, so it can be undone the same way.",
      inputSchema: RevisionShape,
    },
    ({ id, revisionId }) =>
      guard(async () => jsonResult(await client.restoreRevision(id, revisionId))),
  );

  server.registerTool(
    'link_translation',
    {
      description:
        'Link an EXISTING article as another language edition of an existing story (readers can switch editions; search engines see them as alternates). Prefer passing `translationOf` to create_article when writing the translation. A story holds at most one article per language. Returns the article with its `translations`.',
      inputSchema: LinkTranslationShape,
    },
    ({ id, translationOf }) =>
      guard(async () => {
        await client.updateArticle(id, { translationOf });
        return jsonResult(await client.getArticle({ id }));
      }),
  );

  server.registerTool(
    'list_takedowns',
    {
      description:
        'Takedown requests from rights holders and people in our stories, newest first (filter by `status`: pending, actioned, dismissed). Each names the article it matched (`articleId`) when one did. The requester details are personal data: use them to decide, never publish them. Needs the `takedowns` scope.',
      inputSchema: TakedownListQuerySchema.shape,
    },
    (args) => guard(async () => jsonResult(await client.listTakedowns(args))),
  );

  server.registerTool(
    'act_on_takedown',
    {
      description:
        'Resolve a takedown request: `actioned` (with `apply`: `unpublish` takes the matched story down everywhere, including its fediverse and Telegram posts; `clear-hero-image` removes just the disputed image, from the posts too; `none` records the decision only) or `dismissed`. Explain the decision in `resolution`. Needs the `takedowns` scope.',
      inputSchema: TakedownActionShape,
    },
    ({ id, ...action }) => guard(async () => jsonResult(await client.actOnTakedown(id, action))),
  );

  server.registerTool(
    'get_most_popular',
    {
      description:
        "An edition's most read published stories over the last `days` (default 2, today included), most read first — what readers are following. Use it to decide what to follow up, update or translate.",
      inputSchema: PopularArticlesQuerySchema.shape,
    },
    (args) => guard(async () => jsonResult(await client.popularArticles(args))),
  );

  server.registerTool(
    'list_languages',
    {
      description:
        "List the editions (languages) the paper publishes in. Pass an article's `language` to create_article to publish it in that edition; write the article's prose in that language. When it is a version of a story another edition already ran, also pass `translationOf` (that article's id) so the editions are linked.",
    },
    () =>
      guard(async () =>
        jsonResult(SUPPORTED_LANGUAGES.map((code) => ({ code, name: LANGUAGE_NAMES[code] }))),
      ),
  );

  server.registerTool(
    'list_writers',
    {
      description:
        "List The Global World Journal's staff writers (the byline roster). Each writer covers one or more sections (`beats`). When writing a story, choose a writer whose beats include the story's category and pass that name as the article's `author`. Returns name, beats, title and authorSlug (the /author/<slug> profile page).",
    },
    () =>
      guard(async () =>
        jsonResult(
          WRITERS.map((w) => ({
            name: w.name,
            beats: w.beats,
            title: w.title,
            authorSlug: authorSlug(w.name),
          })),
        ),
      ),
  );

  return server;
}

/** Construct the GWJ MCP server with all tools registered against the given client. */
export async function createMcpServer(client: GwjClient): Promise<McpServer> {
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
  const server = new McpServer(
    { name: 'gwj-mcp', version: '0.1.0' },
    { capabilities: { logging: {} } },
  );
  return registerTools(server, client);
}
