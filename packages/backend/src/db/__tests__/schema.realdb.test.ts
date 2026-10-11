import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { CATEGORIES, SUPPORTED_LANGUAGES } from '@gwj/shared-types';
import { getDb } from '../client';
import { newRecordId } from '../ids';
import { MIGRATIONS_FOLDER } from '../migrationsFolder';
import { articles, type NewArticleRow } from '../schema/articles';
import { constraintNameOf, pgErrorCode } from '../pgErrors';
import { useTestDatabase, type TestDatabase } from '../../test/postgres';
import { createErrorHandler } from '../../middleware/error';
import type { NextFunction, Request, Response } from 'express';

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

function article(overrides: Partial<NewArticleRow> = {}): NewArticleRow {
  const id = overrides.id ?? newRecordId();
  return {
    id,
    translationGroupId: id,
    slug: `slug-${newRecordId()}`,
    title: 'A title',
    category: 'World',
    author: 'Eleanor Vance',
    body: 'Body.',
    ...overrides,
  };
}

async function insertError(values: NewArticleRow): Promise<unknown> {
  try {
    await getDb().insert(articles).values(values);
  } catch (err) {
    return err;
  }
  throw new Error('expected the insert to be rejected');
}

const sqlFiles = readdirSync(MIGRATIONS_FOLDER).filter((f) => f.endsWith('.sql'));

describe('generated migrations', () => {
  it('reads at least the initial migration (positive control for the checks below)', () => {
    expect(sqlFiles).toContain('0000_init.sql');
  });

  it.each(sqlFiles)('%s carries exactly one deploy-phase marker', (file) => {
    const markers = readFileSync(join(MIGRATIONS_FOLDER, file), 'utf8')
      .split('\n')
      .filter((l) => /^-- oxy:deploy-phase=(pre|post)$/.test(l.trim()));
    expect(markers).toHaveLength(1);
  });

  it.each(sqlFiles)(
    '%s contains no unbound $N placeholder (a value interpolated into a CHECK)',
    (file) => {
      expect(readFileSync(join(MIGRATIONS_FOLDER, file), 'utf8')).not.toMatch(/\$\d/);
    },
  );
});

describe('indexes exist (no functional test can detect a missing index)', () => {
  const expected = [
    'articles_pkey',
    'articles_slug_unique',
    'articles_status_published_at_idx',
    'articles_language_status_published_at_idx',
    'articles_category_published_at_idx',
    'articles_search_vector_idx',
    'users_pkey',
    'users_username_unique',
    'actor_keys_pkey',
    'followers_pkey',
    'followers_actor_username_actor_id_unique',
    'followers_actor_username_followed_at_idx',
    'takedown_requests_pkey',
    'takedown_requests_status_created_at_idx',
    'ad_campaigns_pkey',
    'ad_campaigns_live_idx',
    'ad_campaigns_status_created_at_idx',
  ];

  it('every ported index is present by name, and a bogus name is absent', async () => {
    const rows = await getDb().execute<{ indexname: string }>(
      sql`select indexname from pg_indexes where schemaname = 'public'`,
    );
    const names = rows.map((r) => r.indexname);
    expect(names.length).toBeGreaterThanOrEqual(expected.length);
    for (const name of expected) expect(names).toContain(name);
    expect(names).not.toContain('articles_no_such_index');
  });

  it('the search vector index is GIN', async () => {
    const rows = await getDb().execute<{ indexdef: string }>(
      sql`select indexdef from pg_indexes where indexname = 'articles_search_vector_idx'`,
    );
    expect(rows[0]?.indexdef).toMatch(/USING gin/);
  });
});

describe('constraints', () => {
  // These two are the gate for growing a closed set: adding a category or a
  // language to @gwj/shared-types without `db:generate` + a migration makes the
  // first production write of it fail — and this test fail first.
  it.each(CATEGORIES)('accepts category %s', async (category) => {
    await getDb().insert(articles).values(article({ category }));
  });

  it.each(SUPPORTED_LANGUAGES)('accepts language %s', async (language) => {
    await getDb().insert(articles).values(article({ language }));
  });

  it('rejects an unknown category, language, status and a negative featured weight', async () => {
    const bad: [Partial<NewArticleRow>, string][] = [
      [{ category: 'Sports' as NewArticleRow['category'] }, 'articles_category_check'],
      [{ language: 'de' as NewArticleRow['language'] }, 'articles_language_check'],
      [{ status: 'archived' as NewArticleRow['status'] }, 'articles_status_check'],
      [{ featured: -1 }, 'articles_featured_check'],
      [{ id: 'not-an-object-id' }, 'articles_id_format'],
    ];
    for (const [overrides, constraint] of bad) {
      const err = await insertError(article(overrides));
      expect(pgErrorCode(err)).toBe('23514');
      expect(constraintNameOf(err)).toBe(constraint);
    }
  });

  it('ties published_at to status in both directions', async () => {
    const published = await insertError(article({ status: 'published', publishedAt: null }));
    expect(constraintNameOf(published)).toBe('articles_published_at_check');
    const draft = await insertError(article({ status: 'draft', publishedAt: new Date() }));
    expect(constraintNameOf(draft)).toBe('articles_published_at_check');
  });

  it('a duplicate slug is a 23505 naming articles_slug_unique, read through the drizzle wrapper', async () => {
    await getDb()
      .insert(articles)
      .values(article({ slug: 'same' }));
    const err = await insertError(article({ slug: 'same' }));
    // The SQLSTATE lives on `cause`, never on the caught error itself.
    expect((err as { code?: unknown }).code).toBeUndefined();
    expect(pgErrorCode(err)).toBe('23505');
    expect(constraintNameOf(err)).toBe('articles_slug_unique');

    // …and the central error handler answers it as 409 (was Mongo E11000 → 409).
    let status = 0;
    let body: unknown;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json(payload: unknown) {
        body = payload;
        return this;
      },
    } as unknown as Response;
    createErrorHandler(false)(err, {} as Request, res, (() => undefined) as NextFunction);
    expect(status).toBe(409);
    expect(body).toEqual({
      error: 'Duplicate key',
      details: { constraint: 'articles_slug_unique' },
    });
  });
});

describe('search vector', () => {
  it('stems each row with its own language, like the Mongo language_override', async () => {
    const es = newRecordId();
    const en = newRecordId();
    await getDb()
      .insert(articles)
      .values([
        article({ id: es, language: 'es', title: 'Los gatos corriendo' }),
        article({ id: en, language: 'en', title: 'The cats running' }),
      ]);
    const rows = await getDb().execute<{ id: string; v: string }>(
      sql`select id, search_vector::text as v from articles where id in (${es}, ${en})`,
    );
    const byId = new Map(rows.map((r) => [r.id, r.v]));
    expect(byId.get(es)).toContain("'corr'");
    expect(byId.get(en)).toContain("'run'");
    expect(byId.get(en)).not.toContain("'the'");
  });

  it('covers headline (weight A), deck (B) and body (C)', async () => {
    const id = newRecordId();
    await getDb()
      .insert(articles)
      .values(article({ id, title: 'Alpha', deck: 'Bravo', body: 'Charlie' }));
    const [row] = await getDb().execute<{ v: string }>(
      sql`select search_vector::text as v from articles where id = ${id}`,
    );
    // Positions run on across the concatenated parts; each lexeme carries its
    // part's weight letter (only the default weight, D, is printed without one).
    expect(row?.v).toBe("'alpha':1A 'bravo':2B 'charli':3C");
  });
});
