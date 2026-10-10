import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { count, eq } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { actorKeys } from '../../db/schema/actorKeys';
import { followers } from '../../db/schema/followers';
import { users } from '../../db/schema/users';
import { useTestDatabase, type TestDatabase } from '../../test/postgres';
import { followerService } from '../followerService';
import { resolveActorKeyPair } from '../keyService';
import { seedAdminUser } from '../../seed';
import type { Env } from '../../env';

let testDb: TestDatabase;

beforeAll(async () => {
  testDb = await useTestDatabase();
});
beforeEach(async () => {
  await testDb.truncateAll();
});
afterAll(async () => {
  await testDb.drop();
});

const ALICE = 'https://remote.example/users/alice';

describe('followerService (PostgreSQL)', () => {
  it('a repeat Follow updates the inbox and KEEPS a stored shared inbox it omits (Mongo $set undefined was a no-op)', async () => {
    await followerService.upsert({
      actorUsername: 'news',
      actorId: ALICE,
      inbox: 'https://remote.example/users/alice/inbox',
      sharedInbox: 'https://remote.example/inbox',
    });
    await followerService.upsert({
      actorUsername: 'news',
      actorId: ALICE,
      inbox: 'https://remote.example/a/inbox2',
    });
    const rows = await getDb().select().from(followers);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.inbox).toBe('https://remote.example/a/inbox2');
    expect(rows[0]?.sharedInbox).toBe('https://remote.example/inbox');
    expect(await followerService.listDeliveryTargets('news')).toEqual([
      'https://remote.example/inbox',
    ]);
  });

  it('keeps followedAt from the first Follow', async () => {
    await followerService.upsert({
      actorUsername: 'news',
      actorId: ALICE,
      inbox: 'https://r.example/i',
      followedAt: '2026-01-01T00:00:00.000Z',
    });
    await followerService.upsert({
      actorUsername: 'news',
      actorId: ALICE,
      inbox: 'https://r.example/i',
      followedAt: '2026-05-01T00:00:00.000Z',
    });
    const [row] = await getDb().select().from(followers);
    expect(row?.followedAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('lists actor ids newest first with a deterministic tie-break, and pages', async () => {
    const at = new Date('2026-03-01T00:00:00.000Z');
    for (const name of ['a', 'b', 'c']) {
      await getDb()
        .insert(followers)
        .values({
          actorUsername: 'news',
          actorId: `https://r.example/${name}`,
          inbox: 'https://r.example/i',
          followedAt: at,
        });
    }
    await getDb()
      .insert(followers)
      .values({
        actorUsername: 'news',
        actorId: 'https://r.example/new',
        inbox: 'https://r.example/i',
        followedAt: new Date('2026-04-01T00:00:00.000Z'),
      });
    expect(await followerService.listActorIds('news', 0, 10)).toEqual([
      'https://r.example/new',
      'https://r.example/c',
      'https://r.example/b',
      'https://r.example/a',
    ]);
    expect(await followerService.listActorIds('news', 1, 2)).toEqual([
      'https://r.example/c',
      'https://r.example/b',
    ]);
    expect(await followerService.count('news')).toBe(4);
  });

  it('remove() and removeEverywhere() report what they deleted', async () => {
    await followerService.upsert({
      actorUsername: 'news',
      actorId: ALICE,
      inbox: 'https://r.example/i',
    });
    await followerService.upsert({
      actorUsername: 'eleanorvance',
      actorId: ALICE,
      inbox: 'https://r.example/i',
    });
    expect(await followerService.remove('noticias', ALICE)).toBe(false);
    expect(await followerService.remove('news', ALICE)).toBe(true);
    expect(await followerService.removeEverywhere(ALICE)).toBe(1);
    expect(await followerService.removeEverywhere(ALICE)).toBe(0);
  });
});

describe('resolveActorKeyPair (PostgreSQL)', () => {
  it('returns a persisted key VERBATIM (keys copied from Mongo must survive)', async () => {
    await getDb()
      .insert(actorKeys)
      .values({ username: 'news', privateKeyPem: 'PRIVATE-PEM', publicKeyPem: 'PUBLIC-PEM' });
    expect(await resolveActorKeyPair('news')).toEqual({
      privateKeyPem: 'PRIVATE-PEM',
      publicKeyPem: 'PUBLIC-PEM',
    });
  });

  it('concurrent first use converges on ONE persisted key', async () => {
    const results = await Promise.all([1, 2, 3].map(() => resolveActorKeyPair('noticias')));
    const [row] = await getDb()
      .select({ n: count() })
      .from(actorKeys)
      .where(eq(actorKeys.username, 'noticias'));
    expect(row?.n).toBe(1);
    const [stored] = await getDb()
      .select()
      .from(actorKeys)
      .where(eq(actorKeys.username, 'noticias'));
    for (const r of results) expect(r.publicKeyPem).toBe(stored?.publicKeyPem);
    expect(stored?.privateKeyPem).toMatch(/^-----BEGIN PRIVATE KEY-----/);
  });
});

describe('seedAdminUser (PostgreSQL)', () => {
  it('is idempotent: a re-seed re-hashes the password but keeps the id (the JWT sub)', async () => {
    const env = { ADMIN_USERNAME: 'nate', ADMIN_PASSWORD: 'first-password' } as Env;
    await seedAdminUser(env);
    const [first] = await getDb().select().from(users);
    await seedAdminUser({ ...env, ADMIN_PASSWORD: 'second-password' });
    const rows = await getDb().select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(first?.id);
    expect(rows[0]?.id).toMatch(/^[0-9a-f]{24}$/);
    expect(rows[0]?.passwordHash).not.toBe(first?.passwordHash);
  });
});
