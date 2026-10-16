import express, { Router, type Request, type Response } from 'express';
import { ACTIVITY_JSON_TYPE, LD_JSON_TYPE, type ArticleListQuery } from '@gwj/shared-types';
import { articleService, type ListOptions } from '../services/articleService';
import {
  buildActor,
  buildFollowersCollection,
  buildFollowersPage,
  buildFollowingCollection,
  buildOutboxCollection,
  buildOutboxPage,
  buildWebFinger,
  FOLLOWERS_PAGE_SIZE,
  OUTBOX_PAGE_SIZE,
} from './documents';
import { followerService } from './followerService';
import type { InboxService } from './inboxService';
import type { ActorIdentity, ActorRegistry } from './identity';
import { NotFoundError } from '../errors';
import type { MediaPresenter } from '../media/presentation';

/** Software metadata advertised via NodeInfo. */
const SOFTWARE_NAME = 'gwj';
const SOFTWARE_VERSION = '0.1.0';
/** Max bytes accepted on an inbox POST (AP activities are small). */
const INBOX_BODY_LIMIT = 1024 * 1024;

/** True when the client explicitly asked for ActivityPub/JSON-LD. */
function wantsActivityJson(req: Request): boolean {
  const accept = req.header('accept') ?? '';
  return (
    accept.includes(ACTIVITY_JSON_TYPE) ||
    accept.includes(LD_JSON_TYPE) ||
    accept.includes('application/json')
  );
}

/** Send an AS2 document with the correct content type. */
function sendActivityJson(res: Response, body: unknown): void {
  res.type(ACTIVITY_JSON_TYPE).json(body);
}

/** Parse a `?page=N` query param into a positive integer (default 1). */
function readPage(req: Request): number {
  const raw = req.query.page;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export interface ActivityPubRouterDeps {
  registry: ActorRegistry;
  /** Resolve an actor's public key PEM for its Actor document; null when unavailable. */
  getPublicKeyPem: (username: string) => Promise<string | null>;
  inbox: InboxService;
  /** Count of all published articles (NodeInfo `localPosts`). */
  countPublished: () => Promise<number>;
  /** Count of published articles for one actor's outbox (by language or author). */
  countForActor: (actor: ActorIdentity) => Promise<number>;
  /** Shows articles' images as readers may see them. */
  presenter: MediaPresenter;
}

/** The `ListOptions` that scope a listing to one actor's articles. */
function listOptionsForActor(actor: ActorIdentity): ListOptions {
  return actor.kind === 'writer' ? { author: actor.authorName } : {};
}

/** The `ArticleListQuery` that scopes a listing to one actor's articles. */
function listQueryForActor(actor: ActorIdentity, page: number): ArticleListQuery {
  const query: ArticleListQuery = { page, limit: OUTBOX_PAGE_SIZE };
  if (actor.kind === 'edition' && actor.language) query.language = actor.language;
  return query;
}

/**
 * The ActivityPub surface. Mounted at the app root because its paths
 * (`/.well-known/*`, `/users/*`, `/inbox`, `/nodeinfo/*`) are anchored to the apex
 * and proxied there verbatim by Cloudflare. All ids come from the registry
 * (apex-based), never from the request host. A single `/users/<username>`
 * namespace serves both edition and writer actors.
 */
export function createActivityPubRouter(deps: ActivityPubRouterDeps): Router {
  const router = Router();
  const { registry } = deps;

  /** Resolve the actor for a `:username` route param or 404. */
  function requireActor(req: Request, what: string): ActorIdentity {
    const username = req.params.username;
    const actor = typeof username === 'string' ? registry.get(username) : undefined;
    if (!actor) throw new NotFoundError(`${what} not found`);
    return actor;
  }

  // --- WebFinger (RFC 7033): resolves ANY registered handle ---
  router.get('/.well-known/webfinger', (req: Request, res: Response) => {
    const resource = req.query.resource;
    const value = Array.isArray(resource) ? resource[0] : resource;
    if (typeof value !== 'string' || !value.startsWith('acct:')) {
      throw new NotFoundError('Resource not found');
    }
    const acct = value.slice('acct:'.length);
    const [username, domain] = acct.split('@');
    const actor = username ? registry.get(username) : undefined;
    if (!actor || domain !== registry.domain) throw new NotFoundError('Resource not found');
    res.type('application/jrd+json').json(buildWebFinger(actor));
  });

  // --- NodeInfo discovery + document ---
  router.get('/.well-known/nodeinfo', (_req: Request, res: Response) => {
    res.json({
      links: [
        {
          rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1',
          href: `${registry.origin}/nodeinfo/2.1`,
        },
      ],
    });
  });

  router.get('/nodeinfo/2.1', async (_req: Request, res: Response) => {
    const localPosts = await deps.countPublished();
    const usersTotal = registry.all.length;
    res.type('application/json; profile="http://nodeinfo.diaspora.software/ns/schema/2.1#"').json({
      version: '2.1',
      software: { name: SOFTWARE_NAME, version: SOFTWARE_VERSION },
      protocols: ['activitypub'],
      services: { inbound: [], outbound: [] },
      openRegistrations: false,
      usage: {
        users: { total: usersTotal, activeMonth: usersTotal, activeHalfyear: usersTotal },
        localPosts,
      },
      metadata: {},
    });
  });

  // --- Actor ---
  router.get('/users/:username', async (req: Request, res: Response) => {
    const actor = requireActor(req, 'Actor');
    // A browser asking for HTML is sent to the actor's public page.
    if (!wantsActivityJson(req)) {
      res.redirect(302, actor.url);
      return;
    }
    const publicKeyPem = await deps.getPublicKeyPem(actor.username);
    if (!publicKeyPem) throw new NotFoundError('Actor not available');
    sendActivityJson(res, buildActor(actor, publicKeyPem));
  });

  // --- Outbox (OrderedCollection, paged Create activities newest first) ---
  router.get('/users/:username/outbox', async (req: Request, res: Response) => {
    const actor = requireActor(req, 'Outbox');
    const total = await deps.countForActor(actor);
    if (req.query.page === undefined) {
      sendActivityJson(res, buildOutboxCollection(actor, total));
      return;
    }
    const page = readPage(req);
    const result = await articleService.list(
      listQueryForActor(actor, page),
      listOptionsForActor(actor),
    );
    sendActivityJson(
      res,
      buildOutboxPage(actor, await deps.presenter.articles(result.data), page, total),
    );
  });

  // --- Followers (OrderedCollection of actor ids), per actor ---
  router.get('/users/:username/followers', async (req: Request, res: Response) => {
    const actor = requireActor(req, 'Followers');
    const total = await followerService.count(actor.username);
    if (req.query.page === undefined) {
      sendActivityJson(res, buildFollowersCollection(actor, total));
      return;
    }
    const page = readPage(req);
    const actorIds = await followerService.listActorIds(
      actor.username,
      (page - 1) * FOLLOWERS_PAGE_SIZE,
      FOLLOWERS_PAGE_SIZE,
    );
    sendActivityJson(res, buildFollowersPage(actor, actorIds, page, total));
  });

  // --- Following (empty: actors follow nobody) ---
  router.get('/users/:username/following', (req: Request, res: Response) => {
    const actor = requireActor(req, 'Following');
    sendActivityJson(res, buildFollowingCollection(actor));
  });

  // --- Inbox (per-actor and shared) ---
  // A dedicated raw-body parser captures the exact bytes the remote signed, which
  // is required to verify the Digest header. This runs only on these POST routes.
  const rawBody = express.raw({ type: () => true, limit: INBOX_BODY_LIMIT });

  const handleInbox = async (
    req: Request,
    res: Response,
    targetActor: ActorIdentity | undefined,
  ): Promise<void> => {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const result = await deps.inbox.handle({
      method: req.method,
      // The remote signed `(request-target)` against the apex path it POSTed to,
      // which Cloudflare proxies here unchanged; `originalUrl` preserves it.
      path: req.originalUrl,
      headers: req.headers,
      rawBody: body,
      targetActor,
    });
    res.status(result.status).json({ status: result.reason });
  };

  router.post('/users/:username/inbox', rawBody, async (req: Request, res: Response) => {
    const actor = requireActor(req, 'Inbox');
    await handleInbox(req, res, actor);
  });

  router.post('/inbox', rawBody, async (req: Request, res: Response) => {
    await handleInbox(req, res, undefined);
  });

  return router;
}
