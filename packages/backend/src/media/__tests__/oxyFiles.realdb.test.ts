import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import type { Express } from 'express';
import { CATEGORIES } from '@gwj/shared-types';
import { eq } from 'drizzle-orm';
import { OxyServer } from '@oxy.so/core/server';
import { loadEnv, resetEnvCache, type Env } from '../../env';
import { buildApp } from '../../app';
import { getDb } from '../../db/client';
import { newRecordId } from '../../db/ids';
import { users } from '../../db/schema/users';
import { mediaReferenceJobs } from '../../db/schema/mediaReferenceJobs';
import { mediaFileReferences } from '../../db/schema/mediaFileReferences';
import { oxyFileEvents } from '../../db/schema/oxyFileEvents';
import { legacyMediaObjects } from '../../db/schema/legacyMediaObjects';
import { legacyMediaReads } from '../../db/schema/legacyMediaReads';
import { writerPortraits } from '../../db/schema/writerPortraits';
import { mediaReconcileRuns } from '../../db/schema/mediaReconcileRuns';
import { useTestDatabase, type TestDatabase } from '../../test/postgres';
import { createFakeOxyFiles, FAKE_CLOUD_URL, FAKE_WEBHOOK_SECRET } from '../../test/fakeOxyFiles';
import { hashPassword } from '../../services/password';
import { recordChannelPost, removeChannelPost } from '../../channels/channelPosts';
import { validPngBuffer } from '../../__tests__/imageFixtures';
import { processReferenceJobs, syncEntityReferences } from '../referenceWorker';
import { enqueueReferenceSync } from '../referenceJobs';
import { runDueReconciliations } from '../reconcile';
import { flushLegacyReads } from '../legacyReads';
import { invalidateHiddenFiles } from '../availability';
import { createOxyUrls } from '../oxyUrls';
import { createLegacyMedia } from '../legacy';

let testDb: TestDatabase;
let app: Express;
let stop: () => void;
const oxy = createFakeOxyFiles();
const CDN = 'https://cdn.example.test';
const ADMIN = { username: 'nate', password: 'super-secret-pw' };

function setTestEnv(): Env {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = testDb.url;
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.ADMIN_USERNAME = ADMIN.username;
  process.env.ADMIN_PASSWORD = ADMIN.password;
  process.env.AWS_REGION = 'us-east-1';
  process.env.S3_BUCKET = 'test-bucket';
  process.env.CDN_BASE_URL = CDN;
  process.env.CORS_ORIGINS = '';
  resetEnvCache();
  return loadEnv();
}

beforeAll(async () => {
  testDb = await useTestDatabase();
  const built = buildApp(setTestEnv(), { oxyFiles: oxy });
  app = built.app;
  stop = built.stopChannels;
});

beforeEach(async () => {
  await testDb.truncateAll();
  oxy.files.clear();
  oxy.references.clear();
  invalidateHiddenFiles();
  await getDb()
    .insert(users)
    .values({
      id: newRecordId(),
      username: ADMIN.username,
      passwordHash: await hashPassword(ADMIN.password, 10),
      role: 'admin',
    });
});

afterAll(async () => {
  stop();
  await testDb.drop();
});

async function admin(): Promise<Record<string, string>> {
  const res = await request(app).post('/api/auth/login').send(ADMIN);
  return { authorization: `Bearer ${res.body.token as string}` };
}

async function upload(width = 1400, height = 900): Promise<{ url: string; fileId: string }> {
  const res = await request(app)
    .post('/api/admin/upload')
    .set(await admin())
    .attach('file', validPngBuffer(width, height), { filename: 'p.png', contentType: 'image/png' });
  expect(res.status).toBe(201);
  return { url: res.body.url, fileId: oxy.fileIdOf(res.body.url) ?? '' };
}

async function uploadCreative(): Promise<{ url: string; fileId: string }> {
  const res = await request(app)
    .post('/api/admin/ad-campaigns/creative')
    .set(await admin())
    .attach('file', validPngBuffer(900, 300), { filename: 'ad.png', contentType: 'image/png' });
  expect(res.status).toBe(201);
  return { url: res.body.url, fileId: oxy.fileIdOf(res.body.url) ?? '' };
}

async function createArticle(body: Record<string, unknown>): Promise<{ id: string; slug: string }> {
  const res = await request(app)
    .post('/api/admin/articles')
    .set(await admin())
    .send({
      title: `Story ${Math.random()}`,
      category: CATEGORIES[0],
      author: 'Nate',
      body: 'Text.',
      status: 'published',
      ...body,
    });
  expect(res.status).toBe(201);
  return { id: res.body.id, slug: res.body.slug };
}

function sign(body: string, secret = FAKE_WEBHOOK_SECRET, at = Math.floor(Date.now() / 1000)) {
  const signature = createHmac('sha256', secret).update(`${at}.${body}`).digest('hex');
  return `t=${at},v1=${signature}`;
}

async function sendEvent(event: Record<string, unknown>) {
  const body = JSON.stringify(event);
  return request(app)
    .post('/api/oxy/file-events')
    .set('content-type', 'application/json')
    .set('oxy-signature', sign(body))
    .send(body);
}

function fileEvent(
  fileId: string,
  type: string,
  status: string,
  occurredAt: string,
  id = `evt_${Math.random()}`,
) {
  return {
    id,
    type,
    occurredAt,
    file: { id: fileId, ownerKind: 'application', visibility: 'public', status },
    references: [],
  };
}

describe('URLs', () => {
  it("are the SDK's publicUrl exactly, and parse back to the file", () => {
    const sdk = new OxyServer({ baseURL: 'https://api.example.test', cloudURL: FAKE_CLOUD_URL });
    const urls = createOxyUrls(FAKE_CLOUD_URL);
    expect(urls.url('abc123def456')).toBe(sdk.assets.publicUrl('abc123def456'));
    expect(urls.url('abc123def456', 'w640')).toBe(sdk.assets.publicUrl('abc123def456', 'w640'));
    expect(urls.fileIdOf(urls.url('abc123def456', 'w640'))).toBe('abc123def456');
    expect(urls.fileIdOf('https://elsewhere.example/abc123def456')).toBeNull();
    expect(
      urls.fileIdsIn(
        `![a](${urls.url('aaaaaaaa1')}) and ${urls.url('bbbbbbbb2', 'w320')} ${urls.url('aaaaaaaa1')}`,
      ),
    ).toEqual(['aaaaaaaa1', 'bbbbbbbb2']);
    expect(urls.variantsFor('aaaaaaaa1', 700, 'image/webp').map((v) => v.width)).toEqual([
      320, 640,
    ]);
    expect(urls.variantsFor('aaaaaaaa1', 700, 'image/gif')).toEqual([]);
    expect(urls.rungFor(400)).toBe('w640');
    expect(urls.rungFor(5000)).toBe('w2048');
  });

  it('legacy CDN URLs are recognized and rewritten', () => {
    const legacy = createLegacyMedia(CDN);
    expect(legacy.keyOf(`${CDN}/articles/a%20b.webp`)).toBe('articles/a b.webp');
    expect(legacy.keyOf('https://other.example/x.png')).toBeNull();
    const text = `![x](${CDN}/articles/a.webp) and "${CDN}/writers/b.png"`;
    expect(legacy.urlsIn(text)).toHaveLength(2);
    expect(legacy.replaceIn(text, (key) => (key === 'articles/a.webp' ? 'NEW' : null))).toBe(
      `![x](NEW) and "${CDN}/writers/b.png"`,
    );
  });
});

describe('references', () => {
  it('an article references what it shows; a dropped image stays while a revision shows it; deletion releases all', async () => {
    const hero = await upload();
    const inline = await upload(1200, 800);
    const article = await createArticle({
      heroImage: { url: hero.url, alt: 'Hero' },
      body: `Lead.\n\n![Inline](${inline.url})`,
    });
    await processReferenceJobs(oxy);
    expect(oxy.referencesOf('article', article.id).sort()).toEqual(
      [hero.fileId, inline.fileId].sort(),
    );

    // Dropping the inline image: the revision recording the old body still shows it.
    const edited = await request(app)
      .patch(`/api/admin/articles/${article.id}`)
      .set(await admin())
      .send({ body: 'Lead only.' });
    expect(edited.status).toBe(200);
    await processReferenceJobs(oxy);
    expect(oxy.referencesOf('article', article.id)).toContain(inline.fileId);

    const removed = await request(app)
      .delete(`/api/admin/articles/${article.id}`)
      .set(await admin());
    expect(removed.status).toBe(204);
    await processReferenceJobs(oxy);
    expect(oxy.referencesOf('article', article.id)).toEqual([]);
    expect(
      await getDb()
        .select()
        .from(mediaFileReferences)
        .where(eq(mediaFileReferences.entityId, article.id)),
    ).toEqual([]);
    expect(await getDb().select().from(mediaReferenceJobs)).toEqual([]);
  });

  it('an ad campaign references its creative until it is deleted', async () => {
    const creative = await uploadCreative();
    const res = await request(app)
      .post('/api/admin/ad-campaigns')
      .set(await admin())
      .send({
        advertiserName: 'Acme',
        advertiserEmail: 'ads@acme.example',
        imageUrl: creative.url,
        clickUrl: 'https://acme.example',
        variant: 'inline',
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: new Date(Date.now() + 86_400_000).toISOString(),
        status: 'active',
      });
    expect(res.status).toBe(201);
    await processReferenceJobs(oxy);
    expect(oxy.referencesOf('ad_campaign', res.body.id)).toEqual([creative.fileId]);

    await request(app)
      .delete(`/api/admin/ad-campaigns/${res.body.id}`)
      .set(await admin());
    await processReferenceJobs(oxy);
    expect(oxy.referencesOf('ad_campaign', res.body.id)).toEqual([]);
  });

  it('a social card is referenced while its post is recorded', async () => {
    const card = await oxy.uploadImage(validPngBuffer(1080, 1350), 'image/png');
    const articleId = newRecordId();
    await recordChannelPost(articleId, 'instagram:en', { mediaId: 'm1', cardFileId: card.fileId });
    await processReferenceJobs(oxy);
    expect(oxy.referencesOf('social_card', `${articleId}:instagram:en`)).toEqual([card.fileId]);
    await removeChannelPost(articleId, 'instagram:en');
    await processReferenceJobs(oxy);
    expect(oxy.referencesOf('social_card', `${articleId}:instagram:en`)).toEqual([]);
  });

  it('a change while a job is pending is not lost (the generation moves)', async () => {
    const db = getDb();
    await enqueueReferenceSync(db, 'article', ['a1', 'a1']);
    await enqueueReferenceSync(db, 'article', ['a1']);
    const jobs = await db.select().from(mediaReferenceJobs);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.generation).toBe(1);
  });

  it('a failed sync is retried later, not dropped', async () => {
    const hero = await upload();
    const article = await createArticle({ heroImage: { url: hero.url, alt: 'Hero' } });
    const original = oxy.addReferences;
    oxy.addReferences = async () => {
      throw new Error('Oxy is down');
    };
    try {
      expect(await processReferenceJobs(oxy)).toBe(1);
    } finally {
      oxy.addReferences = original;
    }
    const [job] = await getDb().select().from(mediaReferenceJobs);
    expect(job).toMatchObject({
      entityId: article.id,
      status: 'pending',
      lastError: 'Oxy is down',
    });
    expect(job?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    // Due again later: it runs then.
    await processReferenceJobs(oxy, new Date(Date.now() + 2 * 60_000));
    expect(oxy.referencesOf('article', article.id)).toEqual([hero.fileId]);
  });

  it('the nightly reconciliation repairs missed and stale references, once a day', async () => {
    const hero = await upload();
    const article = await createArticle({ heroImage: { url: hero.url, alt: 'Hero' } });
    await getDb().delete(mediaReferenceJobs); // the reference write was "lost"
    oxy.references.add(`article|${newRecordId()}|${hero.fileId}`); // and a stale one lingers
    const results = await runDueReconciliations(oxy);
    expect(results.article).toMatchObject({ added: 1, removed: 1, inventory: 1 });
    expect(oxy.referencesOf('article', article.id)).toEqual([hero.fileId]);
    expect(
      await getDb()
        .select({ fileId: mediaFileReferences.fileId })
        .from(mediaFileReferences)
        .where(eq(mediaFileReferences.entityId, article.id)),
    ).toEqual([{ fileId: hero.fileId }]);
    expect(Object.keys(await runDueReconciliations(oxy))).toEqual([]);
    const runs = await getDb().select().from(mediaReconcileRuns);
    expect(runs.map((run) => run.entityType).sort()).toEqual(
      [
        'ad_campaign' as const,
        'article' as const,
        'social_card' as const,
        'writer_portrait' as const,
      ].sort(),
    );
  });

  it('syncing an entity that shows a file Oxy refuses records nothing for it', async () => {
    const article = await createArticle({ body: `![x](${FAKE_CLOUD_URL}/notarealfile9)` });
    const result = await syncEntityReferences(oxy, 'article', article.id);
    expect(result).toEqual({ added: 0, removed: 0, refused: 1 });
  });
});

describe('file events', () => {
  it('answers the registration challenge without a signature', async () => {
    const res = await request(app)
      .post('/api/oxy/file-events')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ type: 'webhook.challenge', challenge: 'c-123' }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ challenge: 'c-123' });
  });

  it('refuses a request whose signature does not verify', async () => {
    const body = JSON.stringify(
      fileEvent('aaaaaaaa1', 'file.blocked', 'blocked', new Date().toISOString()),
    );
    const res = await request(app)
      .post('/api/oxy/file-events')
      .set('content-type', 'application/json')
      .set('oxy-signature', sign(body, 'whsec_wrong'))
      .send(body);
    expect(res.status).toBe(400);
    expect(await getDb().select().from(oxyFileEvents)).toEqual([]);
  });

  it('a takedown hides the image from readers, an unblock shows it again, all audited once', async () => {
    const hero = await upload();
    const inline = await upload(1200, 800);
    const article = await createArticle({
      heroImage: { url: hero.url, alt: 'Hero' },
      body: `Lead.\n\n![Inline](${inline.url})`,
      seo: { ogImage: hero.url },
    });

    const blocked = fileEvent(
      hero.fileId,
      'file.blocked',
      'blocked',
      '2026-10-16T10:00:00.000Z',
      'evt_1',
    );
    expect((await sendEvent(blocked)).status).toBe(204);
    expect((await sendEvent(blocked)).status).toBe(204); // a redelivery
    const trashedInline = fileEvent(
      inline.fileId,
      'file.trashed',
      'trash',
      '2026-10-16T10:00:00.000Z',
    );
    expect((await sendEvent(trashedInline)).status).toBe(204);

    const shown = await request(app).get(`/api/articles/${article.slug}`);
    expect(shown.body.heroImage).toBeUndefined();
    expect(shown.body.body).not.toContain(inline.url);
    expect(shown.body.seo.ogImage).toBeUndefined();
    // The newsroom's own view keeps it.
    const adminView = await request(app)
      .get(`/api/admin/articles/${article.id}`)
      .set(await admin());
    expect(adminView.body.heroImage.url).toBe(hero.url);

    // An older event delivered late changes nothing.
    const stale = fileEvent(
      hero.fileId,
      'file.restored',
      'active',
      '2026-10-16T09:00:00.000Z',
      'evt_0',
    );
    expect((await sendEvent(stale)).status).toBe(204);
    expect(
      (await request(app).get(`/api/articles/${article.slug}`)).body.heroImage,
    ).toBeUndefined();

    const unblocked = fileEvent(
      hero.fileId,
      'file.unblocked',
      'active',
      '2026-10-16T11:00:00.000Z',
      'evt_2',
    );
    expect((await sendEvent(unblocked)).status).toBe(204);
    expect((await request(app).get(`/api/articles/${article.slug}`)).body.heroImage.url).toBe(
      hero.url,
    );

    const audit = await getDb()
      .select({ eventId: oxyFileEvents.eventId, outcome: oxyFileEvents.outcome })
      .from(oxyFileEvents)
      .where(eq(oxyFileEvents.fileId, hero.fileId));
    expect(audit.sort((a, b) => a.eventId.localeCompare(b.eventId))).toEqual([
      { eventId: 'evt_0', outcome: 'superseded' },
      { eventId: 'evt_1', outcome: 'applied' },
      { eventId: 'evt_2', outcome: 'applied' },
    ]);
  });

  it('a hidden ad creative gives the slot back', async () => {
    const creative = await uploadCreative();
    const res = await request(app)
      .post('/api/admin/ad-campaigns')
      .set(await admin())
      .send({
        advertiserName: 'Acme',
        advertiserEmail: 'ads@acme.example',
        imageUrl: creative.url,
        clickUrl: 'https://acme.example',
        variant: 'inline',
        startsAt: new Date(Date.now() - 1000).toISOString(),
        endsAt: new Date(Date.now() + 86_400_000).toISOString(),
        status: 'active',
      });
    expect(res.status).toBe(201);
    const live = await request(app).get('/api/ad-campaigns/active').query({ variant: 'inline' });
    expect(live.body.campaign?.imageUrl).toBe(creative.url);
    await sendEvent(
      fileEvent(creative.fileId, 'file.deleted', 'deleted', new Date().toISOString()),
    );
    const gone = await request(app).get('/api/ad-campaigns/active').query({ variant: 'inline' });
    expect(gone.body.campaign).toBeNull();
  });
});

describe('legacy media during the soak', () => {
  it('a legacy URL still renders and is counted', async () => {
    const article = await createArticle({
      heroImage: { url: `${CDN}/articles/old.webp`, alt: 'Old' },
    });
    const res = await request(app).get(`/api/articles/${article.slug}`);
    expect(res.body.heroImage.url).toBe(`${CDN}/articles/old.webp`);
    await flushLegacyReads();
    const [row] = await getDb().select().from(legacyMediaReads);
    expect(row).toMatchObject({ surface: 'api', count: 1 });
  });

  it('a writer portrait redirects to the legacy bucket until copied, then to Oxy', async () => {
    const legacy = await request(app).get('/api/writers/eleanorvance/portrait');
    expect(legacy.status).toBe(302);
    expect(legacy.headers.location).toBe(`${CDN}/writers/eleanorvance.png`);
    expect((await request(app).get('/api/writers/nobody/portrait')).status).toBe(404);

    const put = await request(app)
      .put('/api/admin/writers/eleanorvance/portrait')
      .set(await admin())
      .attach('file', validPngBuffer(512, 512), { filename: 'e.png', contentType: 'image/png' });
    expect(put.status).toBe(200);
    const fileId = oxy.fileIdOf(put.body.url) ?? '';
    expect(oxy.files.get(fileId)?.mime).toBe('image/png');
    const [row] = await getDb().select().from(writerPortraits);
    expect(row).toMatchObject({ username: 'eleanorvance', oxyFileId: fileId, uploadedBy: 'nate' });
    const moved = await request(app).get('/api/writers/eleanorvance/portrait');
    expect(moved.headers.location).toBe(put.body.url);
    await processReferenceJobs(oxy);
    expect(oxy.referencesOf('writer_portrait', 'eleanorvance')).toEqual([fileId]);

    const wrongShape = await request(app)
      .put('/api/admin/writers/eleanorvance/portrait')
      .set(await admin())
      .attach('file', validPngBuffer(800, 400), { filename: 'e.png', contentType: 'image/png' });
    expect(wrongShape.status).toBe(422);
  });

  it('an old CDN URL redirects to the Oxy file it was copied to', async () => {
    const image = await oxy.uploadImage(validPngBuffer(), 'image/png');
    await getDb()
      .insert(legacyMediaObjects)
      .values([
        {
          key: 'articles/u-a.webp',
          kind: 'image',
          size: 10,
          status: 'copied',
          oxyFileId: image.fileId,
        },
        {
          key: 'articles/u-a.w400.webp',
          kind: 'rendition',
          imageKey: 'articles/u-a.webp',
          renditionWidth: 400,
          size: 5,
          status: 'mapped',
          oxyFileId: image.fileId,
        },
        { key: 'articles/u-b.webp', kind: 'image', size: 10, status: 'failed' },
      ]);
    const main = await request(app).get('/legacy-media/articles/u-a.webp');
    expect(main.status).toBe(301);
    expect(main.headers.location).toBe(oxy.url(image.fileId));
    const rendition = await request(app).get('/legacy-media/articles/u-a.w400.webp');
    expect(rendition.headers.location).toBe(oxy.url(image.fileId, 'w640'));
    expect((await request(app).get('/legacy-media/articles/u-b.webp')).status).toBe(404);
    expect((await request(app).get('/legacy-media/articles/none.webp')).status).toBe(404);
  });
});
