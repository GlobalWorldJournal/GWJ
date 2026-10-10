import { generateKeyPairSync } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient, ObjectId, type Document } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { CATEGORIES, categorySlug } from '@gwj/shared-types';
import { connectDb, createDatabase, disconnectDb } from '@gwj/backend/src/db/client';
import { MIGRATIONS_FOLDER } from '@gwj/backend/src/db/migrationsFolder';
import { runMigrations } from '@gwj/backend/src/db/migrator';
import { articles } from '@gwj/backend/src/db/schema/articles';
import { followers } from '@gwj/backend/src/db/schema/followers';
import { createEmptyDatabase, dropDatabase } from '@gwj/backend/src/test/postgres';
import { articleService } from '@gwj/backend/src/services/articleService';
import { resolveActorKeyPair } from '@gwj/backend/src/activitypub/keyService';
import { takedownService } from '@gwj/backend/src/services/takedownService';
import { runMigration, type MigrationOptions, type MigrationResult } from '../run';

let mongod: MongoMemoryServer;
let mongo: MongoClient;
const created: string[] = [];

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  mongo = new MongoClient(mongod.getUri());
  await mongo.connect();
});

afterAll(async () => {
  await mongo.close();
  await mongod.stop();
  for (const name of created) await dropDatabase(name);
});

function pem(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { privateKeyPem: privateKey, publicKeyPem: publicKey };
}

const ARTICLE_FULL = new ObjectId('6a3a6dfba818982848e4c6c5');
const ARTICLE_DRAFT = new ObjectId('6a3a6dfba818982848e4c6c6');
const ARTICLE_ES = new ObjectId('6a3a6dfba818982848e4c6c7');
const TAKEDOWN_MATCHED = new ObjectId('6a3a6dfba818982848e4c6d0');
const NEWS_KEY = pem();

/** A source shaped like the production census of 2026-10-10, plus its edge cases. */
async function seedSource(dbName: string): Promise<void> {
  const db = mongo.db(dbName);
  const t0 = new Date('2026-06-23T13:33:23.521Z');
  await db.collection('articles').insertMany([
    {
      _id: ARTICLE_FULL,
      __v: 0,
      slug: 'oil-prices-climb',
      title: 'Oil prices climb',
      deck: 'Brent tops $90',
      kicker: 'Markets',
      category: 'Markets',
      language: 'en',
      author: 'Eleanor Vance',
      body: '# Oil\n\nUp.',
      heroImage: {
        url: 'https://cdn.globalworldjournal.com/articles/a.webp',
        caption: 'A rig',
        credit: 'AP',
        alt: 'Rig',
      },
      status: 'published',
      featured: 52,
      tags: ['oil', 'energy'],
      seo: {
        metaTitle: 'Oil',
        metaDescription: 'Oil up',
        ogImage: 'https://cdn.globalworldjournal.com/articles/a.webp',
      },
      source: {
        name: 'Wire',
        articleUrl: 'https://wire.example/a',
        imageUrl: 'https://wire.example/a.jpg',
      },
      publishedAt: t0,
      createdAt: t0,
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    },
    {
      // Draft; no caption; empty seo; no source; NO language (pre-multilanguage document).
      _id: ARTICLE_DRAFT,
      __v: 0,
      slug: 'draft-story',
      title: 'Draft story',
      deck: 'Deck',
      kicker: 'World',
      category: 'World',
      author: 'Nate',
      body: 'Body',
      heroImage: { url: 'https://cdn.example/b.webp', credit: 'GWJ', alt: '' },
      status: 'draft',
      featured: 1,
      tags: [],
      seo: {},
      publishedAt: null,
      createdAt: t0,
      updatedAt: t0,
    },
    {
      // Spanish edition; seo ABSENT; heroImage absent.
      _id: ARTICLE_ES,
      __v: 0,
      slug: 'los-gatos-de-2026',
      title: 'Los gatos de 2026',
      deck: 'Resumen',
      kicker: 'Mundo',
      category: 'World',
      language: 'es',
      author: 'Lucia Ferrer',
      body: 'Cuerpo',
      status: 'published',
      featured: 3,
      tags: ['es'],
      publishedAt: t0,
      createdAt: t0,
      updatedAt: t0,
    },
  ]);
  await db.collection('users').insertOne({
    _id: new ObjectId('6a3a6deca818982848e4c6c4'),
    __v: 0,
    username: 'nate',
    passwordHash: await bcrypt.hash('pw', 4),
    role: 'admin',
    createdAt: t0,
  });
  await db.collection('actorkeys').insertMany([
    { _id: new ObjectId(), __v: 0, username: 'news', ...NEWS_KEY, createdAt: t0, updatedAt: t0 },
    {
      _id: new ObjectId(),
      __v: 0,
      username: 'eleanorvance',
      ...pem(),
      createdAt: t0,
      updatedAt: t0,
    },
  ]);
  await db.collection('followers').insertMany([
    {
      _id: new ObjectId(),
      actorUsername: 'eleanorvance',
      actorId: 'https://m.example/users/a',
      inbox: 'https://m.example/users/a/inbox',
      sharedInbox: 'https://m.example/inbox',
      followedAt: t0,
      createdAt: t0,
      updatedAt: t0,
    },
    // Legacy single-actor shape: no actorUsername, no sharedInbox.
    {
      _id: new ObjectId(),
      actorId: 'https://m.example/users/b',
      inbox: 'https://m.example/users/b/inbox',
      followedAt: t0,
      createdAt: t0,
      updatedAt: t0,
    },
  ]);
  await db.collection('takedownrequests').insertMany([
    {
      _id: TAKEDOWN_MATCHED,
      __v: 0,
      requesterName: 'Jamie',
      requesterEmail: 'jamie@example.com',
      imageUrl: 'https://wire.example/a.jpg',
      claimType: 'copyright',
      explanation: 'My photo.',
      goodFaithAssertion: true,
      status: 'actioned',
      articleId: ARTICLE_FULL,
      resolution: 'Hero image removed',
      createdAt: t0,
      updatedAt: t0,
    },
    {
      // Unmatched: no URLs, no resolution, articleId null.
      _id: new ObjectId(),
      __v: 0,
      requesterName: 'Kai',
      requesterEmail: 'kai@example.com',
      claimType: 'other',
      explanation: 'Please review.',
      goodFaithAssertion: true,
      status: 'pending',
      articleId: null,
      createdAt: t0,
      updatedAt: t0,
    },
  ]);
  await db.collection('categories').insertMany(
    CATEGORIES.map((name, order) => ({
      _id: new ObjectId(),
      __v: 0,
      name,
      slug: categorySlug(name),
      order,
    })),
  );
}

interface Fixture {
  source: string;
  target: { url: string; name: string };
  run(mode: 'copy' | 'verify', overrides?: Partial<MigrationOptions>): Promise<MigrationResult>;
}

let sequence = 0;
async function fixture(seed = true): Promise<Fixture> {
  sequence += 1;
  const source = `gwj_src_${sequence}`;
  if (seed) await seedSource(source);
  const target = await createEmptyDatabase('gwj_mm');
  created.push(target.name);
  await runMigrations({
    databaseUrl: target.url,
    migrationsFolder: MIGRATIONS_FOLDER,
    run: 'all',
    expectedDatabase: target.name,
    dryRun: false,
    logger: { info: () => undefined },
  });
  return {
    source,
    target,
    run: (mode, overrides = {}) =>
      runMigration({
        mode,
        mongoUri: mongod.getUri(),
        sourceDatabase: source,
        databaseUrl: target.url,
        targetDatabase: target.name,
        allowEmpty: false,
        report: () => undefined,
        ...overrides,
      }),
  };
}

async function withTarget<T>(
  url: string,
  fn: (db: ReturnType<typeof createDatabase>['db']) => Promise<T>,
): Promise<T> {
  const { db, client } = createDatabase(url, 1);
  try {
    return await fn(db);
  } finally {
    await client.end({ timeout: 5 });
  }
}

describe('copy → verify', () => {
  it('copies every collection, verifies by checksum, and is idempotent on a second run', async () => {
    const f = await fixture();
    const first = await f.run('copy');
    expect(first.reasons).toEqual([]);
    expect(first.pass).toBe(true);
    expect(first.copy).toEqual({
      articles: { inserted: 3, updated: 0, unchanged: 0 },
      users: { inserted: 1, updated: 0, unchanged: 0 },
      actorkeys: { inserted: 2, updated: 0, unchanged: 0 },
      followers: { inserted: 2, updated: 0, unchanged: 0 },
      takedownrequests: { inserted: 2, updated: 0, unchanged: 0 },
    });
    for (const v of first.verification) {
      expect(v.source.count).toBeGreaterThan(0);
      expect(v.target).toEqual(v.source);
    }

    const second = await f.run('copy');
    expect(second.pass).toBe(true);
    expect(second.copy?.articles).toEqual({ inserted: 0, updated: 0, unchanged: 3 });
    expect(second.copy?.followers).toEqual({ inserted: 0, updated: 0, unchanged: 2 });
    expect((await f.run('verify')).pass).toBe(true);
  });

  it('preserves ids, sub-documents, defaults and legacy shapes exactly as the app saw them', async () => {
    const f = await fixture();
    expect((await f.run('copy')).pass).toBe(true);
    await withTarget(f.target.url, async (db) => {
      const [full] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, ARTICLE_FULL.toHexString()));
      expect(full?.heroImage).toEqual({
        url: 'https://cdn.globalworldjournal.com/articles/a.webp',
        caption: 'A rig',
        credit: 'AP',
        alt: 'Rig',
      });
      expect(full?.publishedAt?.toISOString()).toBe('2026-06-23T13:33:23.521Z');
      expect(full?.tags).toEqual(['oil', 'energy']);
      const [draft] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, ARTICLE_DRAFT.toHexString()));
      expect(draft?.language).toBe('en');
      expect(draft?.source).toBeNull();
      const [es] = await db
        .select()
        .from(articles)
        .where(eq(articles.id, ARTICLE_ES.toHexString()));
      expect(es?.seo).toEqual({});
      expect(es?.heroImage).toBeNull();
      const legacy = await db
        .select()
        .from(followers)
        .where(eq(followers.actorId, 'https://m.example/users/b'));
      expect(legacy.map((r) => [r.actorUsername, r.sharedInbox])).toEqual([['news', null]]);
    });
  });

  it('the copied rows are served by the ported backend (not just present in a table)', async () => {
    const f = await fixture();
    expect((await f.run('copy')).pass).toBe(true);
    await connectDb(f.target.url);
    try {
      const article = await articleService.getBySlug('oil-prices-climb');
      expect(article.id).toBe(ARTICLE_FULL.toHexString());
      expect(article.updatedAt).toBe('2026-07-01T00:00:00.000Z');
      // Queries parse as English (the Mongo index default_language) while this row is
      // stemmed as Spanish — Mongo behaved the same; a numeral is a lexeme in both.
      const found = await articleService.search('2026', { page: 1, limit: 10 });
      expect(found.data.map((a) => a.id)).toEqual([ARTICLE_ES.toHexString()]);
      // The ObjectId ref became the same hex string the DTO always exposed.
      const takedown = await takedownService.getById(TAKEDOWN_MATCHED.toHexString());
      expect(takedown.articleId).toBe(ARTICLE_FULL.toHexString());
      expect(takedown.resolution).toBe('Hero image removed');
      // A migrated actor key is used VERBATIM, never regenerated.
      expect(await resolveActorKeyPair('news')).toEqual(NEWS_KEY);
    } finally {
      await disconnectDb();
    }
  });
});

describe('verification can fail (the comparison is not vacuous)', () => {
  it('names the row when a PostgreSQL value is altered after the copy', async () => {
    const f = await fixture();
    expect((await f.run('copy')).pass).toBe(true);
    await withTarget(f.target.url, (db) =>
      db.execute(
        sql`update articles set body = body || '!' where id = ${ARTICLE_DRAFT.toHexString()}`,
      ),
    );
    const result = await f.run('verify');
    expect(result.pass).toBe(false);
    const articlesCheck = result.verification.find((v) => v.table === 'articles');
    expect(articlesCheck?.source.count).toBe(articlesCheck?.target.count);
    expect(articlesCheck?.changed).toEqual([ARTICLE_DRAFT.toHexString()]);
  });

  it('a Mongo write after the copy fails verify; a re-copy carries it (source newer wins)', async () => {
    const f = await fixture();
    expect((await f.run('copy')).pass).toBe(true);
    await mongo
      .db(f.source)
      .collection('articles')
      .updateOne(
        { _id: ARTICLE_FULL },
        { $set: { deck: 'Revised', updatedAt: new Date('2026-08-01T00:00:00.000Z') } },
      );
    expect((await f.run('verify')).pass).toBe(false);
    const recopy = await f.run('copy');
    expect(recopy.copy?.articles).toEqual({ inserted: 0, updated: 1, unchanged: 2 });
    expect(recopy.pass).toBe(true);
  });
});

describe('copy refuses instead of guessing', () => {
  it('refuses to overwrite a row PostgreSQL changed more recently, and writes nothing', async () => {
    const f = await fixture();
    expect((await f.run('copy')).pass).toBe(true);
    await withTarget(f.target.url, (db) =>
      db.execute(
        sql`update articles set deck = 'pg edit', updated_at = now() where id = ${ARTICLE_FULL.toHexString()}`,
      ),
    );
    await expect(f.run('copy')).rejects.toThrow(/NEWER in PostgreSQL/);
  });

  it('refuses when PostgreSQL holds a row Mongo does not', async () => {
    const f = await fixture();
    expect((await f.run('copy')).pass).toBe(true);
    await withTarget(f.target.url, (db) =>
      db.insert(followers).values({
        actorUsername: 'news',
        actorId: 'https://new.example/u',
        inbox: 'https://new.example/i',
      }),
    );
    await expect(f.run('copy')).rejects.toThrow(/exists only in PostgreSQL/);
  });

  it('refuses a document carrying a field with no target column, naming it, before any write', async () => {
    const f = await fixture();
    await mongo
      .db(f.source)
      .collection('articles')
      .updateOne({ _id: ARTICLE_ES }, { $set: { subtitle: 'unported' } });
    await expect(f.run('copy')).rejects.toThrow(
      new RegExp(`articles ${ARTICLE_ES.toHexString()}: fields with no target column: subtitle`),
    );
    const count = await withTarget(f.target.url, (db) => db.$count(articles));
    expect(count).toBe(0);
  });

  it('refuses an unknown collection, a missing source database and a mismatched target database', async () => {
    const f = await fixture();
    await expect(f.run('verify', { sourceDatabase: 'gwj_nope' })).rejects.toThrow(
      /does not exist on this host/,
    );
    await expect(f.run('verify', { targetDatabase: 'gwj' })).rejects.toThrow(/Refusing to migrate/);
    await mongo
      .db(f.source)
      .collection('comments')
      .insertOne({ text: 'x' } satisfies Document);
    await expect(f.run('copy')).rejects.toThrow(/does not account for: comments/);
  });

  it('fails when the categories collection is not exactly the CATEGORIES tuple (dropping it must lose nothing)', async () => {
    const f = await fixture();
    await mongo
      .db(f.source)
      .collection('categories')
      .updateOne({ name: 'Tech' }, { $set: { order: 99 } });
    const result = await f.run('copy');
    expect(result.pass).toBe(false);
    expect(result.copy).toBeNull();
    expect(result.reasons.join(' ')).toMatch(/category Tech stored as slug=tech order=99/);
  });

  it('fails on an empty source unless --allow-empty (zero is what a misdirected read prints)', async () => {
    const f = await fixture(false);
    await mongo
      .db(f.source)
      .collection('categories')
      .insertOne({ name: 'World', slug: 'world', order: 0 });
    const strict = await f.run('copy');
    expect(strict.pass).toBe(false);
    expect(strict.reasons.join(' ')).toMatch(/0 documents/);
  });
});
