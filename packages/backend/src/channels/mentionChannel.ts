import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { articlePublicUrl, type Article } from '@gwj/shared-types';
import type { Env } from '../env';
import { errorFields, logger } from '../logger';
import { accessToken, isGrantCached } from './mentionOauthService';
import type { PublishChannel } from './types';

const MENTION_MCP_ENDPOINT = 'https://mcp.mention.earth/mcp';

/** Build the post text: title, deck, then the canonical article URL — same shape as Facebook's. */
function buildText(article: Article, url: string): string {
  const lines = [article.title];
  const deck = article.deck?.trim();
  if (deck && deck.length > 0) lines.push(deck);
  lines.push(url);
  return lines.join('\n\n');
}

/** A failed Mention call (an MCP error, a timeout, a malformed reply). The outbox retries it. */
export class MentionError extends Error {
  constructor(
    readonly tool: string,
    message: string,
  ) {
    super(`mention ${tool}: ${message}`);
    this.name = 'MentionError';
  }
}

/** One MCP connection, used for exactly one tool call then closed — @gwj never switches accounts, so there is no session to keep warm across calls. */
async function callTool(env: Env, tool: string, args: Record<string, unknown>): Promise<string> {
  const token = await accessToken(env);
  const client = new Client({ name: 'gwj-backend', version: '0.1.0' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(MENTION_MCP_ENDPOINT), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      }),
    );
    const result = await client.callTool({ name: tool, arguments: args });
    const text = (result.content as Array<{ type: string; text?: string }>)
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('\n');
    if (result.isError) throw new MentionError(tool, text.slice(0, 500));
    return text;
  } catch (error) {
    if (error instanceof MentionError) throw error;
    throw new MentionError(tool, error instanceof Error ? error.message : String(error));
  } finally {
    await client.close().catch(() => undefined);
  }
}

/** What a delivered post is recorded as: enough to retract it later. */
interface MentionPostRef {
  postId: string;
}

function isMentionRef(
  ref: Record<string, unknown>,
): ref is Record<string, unknown> & MentionPostRef {
  return typeof ref.postId === 'string';
}

/**
 * GWJ's own account on Mention (@gwj), posted to for the English edition only
 * — @gwj is one account with one feed, so one post per story (not one per
 * edition) avoids tripling the same headline on it. Authorized once by an
 * admin (`/api/admin/mention/connect`), then self-renewing forever
 * (`mentionOauthService.ts`) — no static token in env, unlike every other
 * channel here.
 *
 * No `update`: Mention's own API has no edit-post tool at all (confirmed
 * against Herald, which already runs this exact grant live) — not a gap,
 * the platform itself doesn't support it.
 */
export function mentionChannel(env: Env): PublishChannel {
  return {
    name: 'mention',
    platform: 'mention',
    servesLanguage: (language) => language === 'en',
    isEnabled: () => isGrantCached(),
    async publish(article: Article) {
      if (article.language !== 'en') return;
      const url = articlePublicUrl(env.FEDIVERSE_DOMAIN, 'en', article.slug);
      const text = await callTool(env, 'create-post', {
        variants: [{ tag: 'en', text: buildText(article, url) }],
        status: 'published',
      });
      const id = /^\[([^\]]+)\]/m.exec(text)?.[1];
      if (!id || id === 'unknown') {
        throw new MentionError('create-post', `no post id in the reply: ${text.slice(0, 200)}`);
      }
      return { postId: id };
    },
    async retract(ref: Record<string, unknown>) {
      if (!isMentionRef(ref)) return;
      try {
        await callTool(env, 'delete-post', { id: ref.postId });
      } catch (error) {
        logger.error('mention: retract failed', errorFields(error));
        throw error;
      }
    },
  };
}
