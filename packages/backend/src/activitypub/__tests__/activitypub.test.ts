import { generateKeyPairSync } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import type { Express } from 'express'
import { CATEGORIES, type ArticleInput } from '@gwj/shared-types'
import { loadEnv, resetEnvCache, type Env } from '../../env'
import { buildApp, type BuiltApp } from '../../app'
import { ArticleModel } from '../../models/Article'
import { FollowerModel } from '../../models/Follower'
import { articleService } from '../../services/articleService'
import { signRequest, computeDigest } from '../httpSignature'
import { clearRemoteActorCache } from '../remoteActor'
import type { ActorKeyPair } from '../keyService'

let mongod: MongoMemoryServer
let built: BuiltApp
let app: Express

const DOMAIN = 'globalworldjournal.com'
const ORIGIN = `https://${DOMAIN}`
const CDN_BASE = 'https://cdn.example.test'

// Local actors exercised by the tests.
const NEWS = 'news' // en edition (Service)
const NOTICIAS = 'noticias' // es edition (Service)
const WRITER_USERNAME = 'eleanorvance' // writer actor (Person)
const WRITER_NAME = 'Eleanor Vance'
const newsId = `${ORIGIN}/users/${NEWS}`
const noticiasId = `${ORIGIN}/users/${NOTICIAS}`
const writerId = `${ORIGIN}/users/${WRITER_USERNAME}`

/** A fresh RSA-2048 keypair for a local actor (injected to skip DB generation). */
function localKeyPair(): ActorKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  return { privateKeyPem: privateKey, publicKeyPem: publicKey }
}

const keyPairs: Record<string, ActorKeyPair> = {
  [NEWS]: localKeyPair(),
  [NOTICIAS]: localKeyPair(),
  [WRITER_USERNAME]: localKeyPair(),
}

// A "remote follower" actor (mastodon-like) that signs its Follow.
const REMOTE_ACTOR_ID = 'https://remote.example/users/alice'
const REMOTE_INBOX = 'https://remote.example/users/alice/inbox'
const REMOTE_SHARED_INBOX = 'https://remote.example/inbox'
const REMOTE_KEY_ID = `${REMOTE_ACTOR_ID}#main-key`
const remoteKeys = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

/** Captured outbound POSTs (Accept / Create / Announce) for assertions. */
let outboundPosts: { url: string; init: RequestInit }[] = []

/** A fake fetch: serves the remote actor document; records POSTs. */
const fakeFetch: typeof fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const method = (init?.method ?? 'GET').toUpperCase()
  if (method === 'GET' && url === REMOTE_ACTOR_ID) {
    const actor = {
      id: REMOTE_ACTOR_ID,
      inbox: REMOTE_INBOX,
      endpoints: { sharedInbox: REMOTE_SHARED_INBOX },
      publicKey: { id: REMOTE_KEY_ID, owner: REMOTE_ACTOR_ID, publicKeyPem: remoteKeys.publicKey },
    }
    return new Response(JSON.stringify(actor), {
      status: 200,
      headers: { 'content-type': 'application/activity+json' },
    })
  }
  if (method === 'POST') {
    outboundPosts.push({ url, init: init ?? {} })
    return new Response('', { status: 202 })
  }
  return new Response('not found', { status: 404 })
}) as typeof fetch

/** Fake DNS resolver: every host resolves to a public IP so the SSRF guard passes. */
const fakeDns = async () => [{ address: '93.184.216.34', family: 4 }]

function setTestEnv(): Env {
  process.env.NODE_ENV = 'test'
  process.env.PORT = '4000'
  process.env.MONGO_URI = mongod.getUri()
  process.env.JWT_SECRET = 'test-jwt-secret'
  process.env.ADMIN_USERNAME = 'nate'
  process.env.ADMIN_PASSWORD = 'super-secret-pw'
  process.env.AWS_REGION = 'us-east-1'
  delete process.env.AWS_ACCESS_KEY_ID
  delete process.env.AWS_SECRET_ACCESS_KEY
  process.env.S3_BUCKET = 'test-bucket'
  process.env.CDN_BASE_URL = CDN_BASE
  process.env.CORS_ORIGINS = 'https://globalworldjournal.com'
  process.env.FEDIVERSE_DOMAIN = DOMAIN
  delete process.env.FEDIVERSE_EDITION_USERNAMES
  resetEnvCache()
  return loadEnv()
}

async function seedPublished(overrides: Partial<ArticleInput> = {}): Promise<void> {
  const draft = await articleService.create({
    title: 'Markets Rally Today',
    category: CATEGORIES[2],
    language: 'en',
    author: WRITER_NAME,
    body: '# Markets\n\nA strong session **today** across the board.',
    status: 'draft',
    featured: 0,
    tags: [],
    seo: {},
    deck: 'The deck summary line.',
    heroImage: { url: `${CDN_BASE}/articles/hero.jpg`, alt: 'Trading floor' },
    ...overrides,
  })
  await articleService.publish(draft.id)
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  const env = setTestEnv()
  built = buildApp(env, {
    activityPub: { keyPairs, fetchOptions: { fetch: fakeFetch, resolveDns: fakeDns } },
  })
  await built.activityPub.initialize()
  app = built.app
})

beforeEach(async () => {
  await ArticleModel.deleteMany({})
  await FollowerModel.deleteMany({})
  outboundPosts = []
  clearRemoteActorCache()
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  built.activityPub.dispose()
  await mongoose.disconnect()
  await mongod.stop()
})

describe('ActivityPub WebFinger (multi-actor)', () => {
  it('resolves an EDITION handle (noticias) to its actor id', async () => {
    const res = await request(app).get(`/.well-known/webfinger?resource=acct:${NOTICIAS}@${DOMAIN}`)
    expect(res.status).toBe(200)
    expect(res.body.subject).toBe(`acct:${NOTICIAS}@${DOMAIN}`)
    const self = res.body.links.find((l: { rel: string }) => l.rel === 'self')
    expect(self.type).toBe('application/activity+json')
    expect(self.href).toBe(noticiasId)
  })

  it('resolves a WRITER handle (eleanorvance) to its actor id', async () => {
    const res = await request(app).get(`/.well-known/webfinger?resource=acct:${WRITER_USERNAME}@${DOMAIN}`)
    expect(res.status).toBe(200)
    expect(res.body.subject).toBe(`acct:${WRITER_USERNAME}@${DOMAIN}`)
    const self = res.body.links.find((l: { rel: string }) => l.rel === 'self')
    expect(self.href).toBe(writerId)
  })

  it('404s an unknown handle and a wrong domain', async () => {
    const unknown = await request(app).get(`/.well-known/webfinger?resource=acct:nobody@${DOMAIN}`)
    expect(unknown.status).toBe(404)
    const wrongDomain = await request(app).get(`/.well-known/webfinger?resource=acct:${NEWS}@other.example`)
    expect(wrongDomain.status).toBe(404)
  })
})

describe('ActivityPub NodeInfo (multi-actor)', () => {
  it('discovery links to the 2.1 document', async () => {
    const res = await request(app).get('/.well-known/nodeinfo')
    expect(res.status).toBe(200)
    expect(res.body.links[0].href).toBe(`${ORIGIN}/nodeinfo/2.1`)
  })

  it('2.1 reports gwj, 21 users (3 editions + 18 writers), published count', async () => {
    await seedPublished({ title: 'Story One' })
    await seedPublished({ title: 'Story Two' })
    const res = await request(app).get('/nodeinfo/2.1')
    expect(res.status).toBe(200)
    expect(res.body.software.name).toBe('gwj')
    expect(res.body.openRegistrations).toBe(false)
    expect(res.body.usage.users.total).toBe(21)
    expect(res.body.usage.localPosts).toBe(2)
  })
})

describe('ActivityPub Actor — edition vs writer', () => {
  it('edition (news) is a Service with site url and apex ids', async () => {
    const res = await request(app).get(`/users/${NEWS}`).set('accept', 'application/activity+json')
    expect(res.status).toBe(200)
    expect(res.body['@context']).toContain('https://w3id.org/security/v1')
    expect(res.body.id).toBe(newsId)
    expect(res.body.type).toBe('Service')
    expect(res.body.preferredUsername).toBe(NEWS)
    expect(res.body.name).toBe('The Global World Journal')
    expect(res.body.url).toBe(ORIGIN)
    expect(res.body.inbox).toBe(`${newsId}/inbox`)
    expect(res.body.endpoints.sharedInbox).toBe(`${ORIGIN}/inbox`)
    expect(res.body.publicKey.id).toBe(`${newsId}#main-key`)
    expect(res.body.publicKey.publicKeyPem).toContain('BEGIN PUBLIC KEY')
  })

  it('es edition (noticias) has a localized Spanish summary', async () => {
    const res = await request(app).get(`/users/${NOTICIAS}`).set('accept', 'application/activity+json')
    expect(res.status).toBe(200)
    expect(res.body.type).toBe('Service')
    expect(res.body.summary).toContain('español')
  })

  it('writer (eleanorvance) is a Person whose icon points at the CDN avatar', async () => {
    const res = await request(app).get(`/users/${WRITER_USERNAME}`).set('accept', 'application/activity+json')
    expect(res.status).toBe(200)
    expect(res.body.type).toBe('Person')
    expect(res.body.name).toBe(WRITER_NAME)
    expect(res.body.preferredUsername).toBe(WRITER_USERNAME)
    // url uses the HYPHENATED web author slug.
    expect(res.body.url).toBe(`${ORIGIN}/author/eleanor-vance`)
    // icon is the pre-generated CDN avatar keyed by fediUsername.
    expect(res.body.icon.url).toBe(`${CDN_BASE}/writers/${WRITER_USERNAME}.png`)
    expect(res.body.icon.mediaType).toBe('image/png')
    expect(res.body.summary).toContain('Markets')
    expect(res.body.publicKey.id).toBe(`${writerId}#main-key`)
  })

  it('redirects a browser to the actor public page (writer → author page)', async () => {
    const res = await request(app).get(`/users/${WRITER_USERNAME}`).set('accept', 'text/html')
    expect(res.status).toBe(302)
    expect(res.headers.location).toBe(`${ORIGIN}/author/eleanor-vance`)
  })

  it('404s an unknown username', async () => {
    const res = await request(app).get('/users/nobody').set('accept', 'application/activity+json')
    expect(res.status).toBe(404)
  })
})

describe('ActivityPub Outbox — filtered by language / author', () => {
  it('edition outbox filters by language', async () => {
    await seedPublished({ title: 'English Story', language: 'en', author: WRITER_NAME })
    await seedPublished({ title: 'Spanish Story', language: 'es', author: WRITER_NAME })

    const enHead = await request(app).get(`/users/${NEWS}/outbox`).set('accept', ACTIVITY_JSON())
    expect(enHead.body.totalItems).toBe(1)
    const enPage = await request(app).get(`/users/${NEWS}/outbox?page=1`).set('accept', ACTIVITY_JSON())
    expect(enPage.body.orderedItems[0].object.content).toContain('<strong>English Story</strong>')
    expect(enPage.body.orderedItems[0].actor).toBe(newsId)

    const esHead = await request(app).get(`/users/${NOTICIAS}/outbox`).set('accept', ACTIVITY_JSON())
    expect(esHead.body.totalItems).toBe(1)
    const esPage = await request(app).get(`/users/${NOTICIAS}/outbox?page=1`).set('accept', ACTIVITY_JSON())
    expect(esPage.body.orderedItems[0].object.content).toContain('<strong>Spanish Story</strong>')
  })

  it('writer outbox filters by author and attributes the Note to the writer', async () => {
    await seedPublished({ title: 'By Eleanor', author: WRITER_NAME })
    await seedPublished({ title: 'By Someone Else', author: 'Marcus Lin' })

    const head = await request(app).get(`/users/${WRITER_USERNAME}/outbox`).set('accept', ACTIVITY_JSON())
    expect(head.body.totalItems).toBe(1)
    const page = await request(app).get(`/users/${WRITER_USERNAME}/outbox?page=1`).set('accept', ACTIVITY_JSON())
    expect(page.body.orderedItems).toHaveLength(1)
    const create = page.body.orderedItems[0]
    expect(create.actor).toBe(writerId)
    expect(create.object.attributedTo).toBe(writerId)
    expect(create.object.content).toContain('<strong>By Eleanor</strong>')
    expect(create.object.url).toMatch(new RegExp(`^${ORIGIN}/article/`))
    expect(create.object.attachment[0].url).toBe(`${CDN_BASE}/articles/hero.jpg`)
  })
})

/** The Accept header value used for AS2 GET requests. */
function ACTIVITY_JSON(): string {
  return 'application/activity+json'
}

/** Build a signed inbox POST request for the given activity body + target path. */
function signedInbox(body: string, target: string) {
  const signed = signRequest({
    privateKeyPem: remoteKeys.privateKey,
    keyId: REMOTE_KEY_ID,
    method: 'POST',
    url: `${ORIGIN}${target}`,
    body,
    headers: { 'content-type': 'application/activity+json' },
  })
  return {
    Date: signed.Date,
    Digest: computeDigest(body),
    Signature: signed.Signature,
  }
}

/** Send a signed inbox POST through supertest. */
function postInbox(target: string, body: string) {
  const h = signedInbox(body, target)
  return request(app)
    .post(target)
    .set('content-type', 'application/activity+json')
    .set('host', DOMAIN)
    .set('date', h.Date)
    .set('digest', h.Digest)
    .set('signature', h.Signature)
    .send(body)
}

describe('ActivityPub Inbox — per actor', () => {
  it('a Follow to the WRITER persists a follower scoped to that actor + signed Accept from the writer', async () => {
    const body = JSON.stringify({
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: 'https://remote.example/activities/follow/w1',
      type: 'Follow',
      actor: REMOTE_ACTOR_ID,
      object: writerId,
    })
    const res = await postInbox(`/users/${WRITER_USERNAME}/inbox`, body)
    expect(res.status).toBe(202)

    const follower = await FollowerModel.findOne({ actorUsername: WRITER_USERNAME, actorId: REMOTE_ACTOR_ID }).lean()
    expect(follower).not.toBeNull()
    expect(follower?.inbox).toBe(REMOTE_INBOX)
    // Not a follower of any edition.
    expect(await FollowerModel.countDocuments({ actorUsername: NEWS })).toBe(0)

    const accept = outboundPosts.find((p) => p.url === REMOTE_INBOX)
    expect(accept).toBeDefined()
    const acceptHeaders = accept?.init.headers as Record<string, string> | undefined
    expect(acceptHeaders?.Signature).toContain(`keyId="${writerId}#main-key"`)
    const acceptBody = JSON.parse((accept?.init.body as string) ?? '{}')
    expect(acceptBody.type).toBe('Accept')
    expect(acceptBody.actor).toBe(writerId)
  })

  it('the shared /inbox routes a Follow to the actor named in object (edition)', async () => {
    const body = JSON.stringify({
      id: 'https://remote.example/activities/follow/e1',
      type: 'Follow',
      actor: REMOTE_ACTOR_ID,
      object: newsId,
    })
    const res = await postInbox('/inbox', body)
    expect(res.status).toBe(202)
    expect(await FollowerModel.countDocuments({ actorUsername: NEWS, actorId: REMOTE_ACTOR_ID })).toBe(1)
  })

  it('rejects a missing signature with 401, no follower persisted', async () => {
    const body = JSON.stringify({ type: 'Follow', actor: REMOTE_ACTOR_ID, object: writerId })
    const res = await request(app)
      .post(`/users/${WRITER_USERNAME}/inbox`)
      .set('content-type', 'application/activity+json')
      .set('host', DOMAIN)
      .set('date', new Date().toUTCString())
      .set('digest', computeDigest(body))
      .send(body)
    expect(res.status).toBe(401)
    expect(await FollowerModel.countDocuments({})).toBe(0)
  })

  it('rejects a tampered body (digest mismatch) with 401', async () => {
    const original = JSON.stringify({ type: 'Follow', actor: REMOTE_ACTOR_ID, object: writerId })
    const h = signedInbox(original, `/users/${WRITER_USERNAME}/inbox`)
    const tampered = JSON.stringify({ type: 'Follow', actor: 'https://evil.example/x', object: writerId })
    const res = await request(app)
      .post(`/users/${WRITER_USERNAME}/inbox`)
      .set('content-type', 'application/activity+json')
      .set('host', DOMAIN)
      .set('date', h.Date)
      .set('digest', h.Digest)
      .set('signature', h.Signature)
      .send(tampered)
    expect(res.status).toBe(401)
  })

  it('rejects a Follow whose host header is not the apex (proxy/host mismatch)', async () => {
    const body = JSON.stringify({ type: 'Follow', actor: REMOTE_ACTOR_ID, object: writerId })
    const h = signedInbox(body, `/users/${WRITER_USERNAME}/inbox`)
    const res = await request(app)
      .post(`/users/${WRITER_USERNAME}/inbox`)
      .set('content-type', 'application/activity+json')
      .set('host', 'api.globalworldjournal.com') // proxied origin host, NOT the apex
      .set('date', h.Date)
      .set('digest', h.Digest)
      .set('signature', h.Signature)
      .send(body)
    expect(res.status).toBe(401)
  })

  it('Undo(Follow) removes only the scoped follower', async () => {
    await FollowerModel.create({ actorUsername: WRITER_USERNAME, actorId: REMOTE_ACTOR_ID, inbox: REMOTE_INBOX, followedAt: new Date() })
    await FollowerModel.create({ actorUsername: NEWS, actorId: REMOTE_ACTOR_ID, inbox: REMOTE_INBOX, followedAt: new Date() })

    const body = JSON.stringify({
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: 'https://remote.example/activities/undo/1',
      type: 'Undo',
      actor: REMOTE_ACTOR_ID,
      object: { type: 'Follow', actor: REMOTE_ACTOR_ID, object: writerId },
    })
    const res = await postInbox(`/users/${WRITER_USERNAME}/inbox`, body)
    expect(res.status).toBe(202)
    expect(await FollowerModel.countDocuments({ actorUsername: WRITER_USERNAME })).toBe(0)
    // The edition follow is untouched.
    expect(await FollowerModel.countDocuments({ actorUsername: NEWS })).toBe(1)
  })

  it('Delete of an actor removes it from every actor it followed', async () => {
    await FollowerModel.create({ actorUsername: WRITER_USERNAME, actorId: REMOTE_ACTOR_ID, inbox: REMOTE_INBOX, followedAt: new Date() })
    await FollowerModel.create({ actorUsername: NEWS, actorId: REMOTE_ACTOR_ID, inbox: REMOTE_INBOX, followedAt: new Date() })

    const body = JSON.stringify({
      id: 'https://remote.example/activities/delete/1',
      type: 'Delete',
      actor: REMOTE_ACTOR_ID,
      object: REMOTE_ACTOR_ID,
    })
    const res = await postInbox('/inbox', body)
    expect(res.status).toBe(202)
    expect(await FollowerModel.countDocuments({ actorId: REMOTE_ACTOR_ID })).toBe(0)
  })
})

describe('ActivityPub Followers collection — per actor', () => {
  it('reports a page of actor ids for one actor only', async () => {
    await FollowerModel.create({ actorUsername: WRITER_USERNAME, actorId: REMOTE_ACTOR_ID, inbox: REMOTE_INBOX, followedAt: new Date() })
    const head = await request(app).get(`/users/${WRITER_USERNAME}/followers`).set('accept', ACTIVITY_JSON())
    expect(head.body.totalItems).toBe(1)
    const page = await request(app).get(`/users/${WRITER_USERNAME}/followers?page=1`).set('accept', ACTIVITY_JSON())
    expect(page.body.orderedItems).toEqual([REMOTE_ACTOR_ID])

    // The edition has no followers.
    const editionHead = await request(app).get(`/users/${NEWS}/followers`).set('accept', ACTIVITY_JSON())
    expect(editionHead.body.totalItems).toBe(0)
  })
})

describe('ActivityPub publish delivery — writer Create + edition Announce', () => {
  it('a roster-author article: writer Creates to its followers, edition Announces to its followers', async () => {
    // The writer's follower and the en-edition's follower are different remote inboxes.
    const writerInbox = 'https://remote.example/users/wfollower/inbox'
    const editionInbox = 'https://remote.example/users/efollower/inbox'
    await FollowerModel.create({ actorUsername: WRITER_USERNAME, actorId: 'https://remote.example/users/wfollower', inbox: writerInbox, followedAt: new Date() })
    await FollowerModel.create({ actorUsername: NEWS, actorId: 'https://remote.example/users/efollower', inbox: editionInbox, followedAt: new Date() })

    await seedPublished({ title: 'Federated Headline', language: 'en', author: WRITER_NAME })
    await vi.waitFor(() => expect(outboundPosts.length).toBeGreaterThanOrEqual(2))

    // Writer delivers a Create to its follower, signed by the writer.
    const createDelivery = outboundPosts.find((p) => p.url === writerInbox)
    expect(createDelivery).toBeDefined()
    const createBody = JSON.parse((createDelivery?.init.body as string) ?? '{}')
    expect(createBody.type).toBe('Create')
    expect(createBody.actor).toBe(writerId)
    expect(createBody.object.attributedTo).toBe(writerId)
    const createHeaders = createDelivery?.init.headers as Record<string, string> | undefined
    expect(createHeaders?.Signature).toContain(`keyId="${writerId}#main-key"`)

    // Edition delivers an Announce of the SAME Note id to its follower, signed by the edition.
    const announceDelivery = outboundPosts.find((p) => p.url === editionInbox)
    expect(announceDelivery).toBeDefined()
    const announceBody = JSON.parse((announceDelivery?.init.body as string) ?? '{}')
    expect(announceBody.type).toBe('Announce')
    expect(announceBody.actor).toBe(newsId)
    // object is the Note id authored by the writer (a string ref → boost, not a copy).
    expect(announceBody.object).toBe(createBody.object.id)
    const announceHeaders = announceDelivery?.init.headers as Record<string, string> | undefined
    expect(announceHeaders?.Signature).toContain(`keyId="${newsId}#main-key"`)
  })

  it('a non-roster byline: the edition authors the Create directly (no Announce)', async () => {
    const editionInbox = 'https://remote.example/users/efollower2/inbox'
    await FollowerModel.create({ actorUsername: NEWS, actorId: 'https://remote.example/users/efollower2', inbox: editionInbox, followedAt: new Date() })

    await seedPublished({ title: 'Wire Report', language: 'en', author: 'Reuters Staff' })
    await vi.waitFor(() => expect(outboundPosts.length).toBeGreaterThanOrEqual(1))

    const delivery = outboundPosts.find((p) => p.url === editionInbox)
    expect(delivery).toBeDefined()
    const body = JSON.parse((delivery?.init.body as string) ?? '{}')
    expect(body.type).toBe('Create')
    expect(body.actor).toBe(newsId)
    expect(body.object.attributedTo).toBe(newsId)
    // No Announce was sent (no writer actor for a non-roster byline).
    expect(outboundPosts.some((p) => {
      const parsed = JSON.parse((p.init.body as string) ?? '{}')
      return parsed.type === 'Announce'
    })).toBe(false)
  })

  it('publish with no followers is a no-op (no outbound delivery)', async () => {
    await seedPublished({ title: 'Lonely Story', author: WRITER_NAME })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(outboundPosts.filter((p) => (p.init.method ?? 'GET').toUpperCase() === 'POST')).toHaveLength(0)
  })
})
