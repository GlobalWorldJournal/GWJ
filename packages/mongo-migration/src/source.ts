/**
 * READ-ONLY access to the source Mongo database. Only `listDatabases`,
 * `listCollections` and `find` are ever issued — never a write.
 */
import type { MongoClient } from 'mongodb';
import { CATEGORIES, categorySlug } from '@gwj/shared-types';
import { toLogical, type LogicalDocument, type SourceCollection } from './normalize';

export const PORTED_COLLECTIONS: readonly SourceCollection[] = [
  'articles',
  'users',
  'actorkeys',
  'followers',
  'takedownrequests',
];

/**
 * `categories` is deliberately NOT ported: nothing ever read it (the public
 * `/api/categories` route derives from the `CATEGORIES` tuple), it was written
 * only by the seed, and the tuple is now enforced by `articles_category_check`.
 * The copy refuses unless every stored category document equals what the tuple
 * derives, so dropping the collection loses nothing.
 */
export const DERIVED_COLLECTIONS = ['categories'] as const;

export interface CategoriesCheck {
  count: number;
  problems: string[];
}

export interface SourceSnapshot {
  database: string;
  /** Every database on the host (the whole host is enumerated, the target named). */
  hostDatabases: { name: string; sizeOnDisk: number }[];
  collections: string[];
  docs: Record<SourceCollection, LogicalDocument[]>;
  categories: CategoriesCheck;
}

function checkCategories(docs: Record<string, unknown>[]): CategoriesCheck {
  const problems: string[] = [];
  const expected = new Map<string, { slug: string; order: number }>(
    CATEGORIES.map((name, order) => [name, { slug: categorySlug(name), order }]),
  );
  for (const doc of docs) {
    const name = String(doc.name);
    const want = expected.get(name);
    const extra = Object.keys(doc).filter(
      (k) => !['_id', '__v', 'name', 'slug', 'order'].includes(k),
    );
    if (!want) problems.push(`category ${JSON.stringify(name)} is not in CATEGORIES`);
    else if (doc.slug !== want.slug || doc.order !== want.order) {
      problems.push(
        `category ${name} stored as slug=${String(doc.slug)} order=${String(doc.order)}, derived slug=${want.slug} order=${want.order}`,
      );
    }
    if (extra.length > 0) problems.push(`category ${name} carries fields ${extra.join(', ')}`);
  }
  if (docs.length > 0 && docs.length !== CATEGORIES.length) {
    problems.push(`${docs.length} category documents for ${CATEGORIES.length} CATEGORIES`);
  }
  return { count: docs.length, problems };
}

export async function readSource(client: MongoClient, database: string): Promise<SourceSnapshot> {
  const listed = await client.db('admin').admin().listDatabases();
  const hostDatabases = listed.databases.map((d) => ({
    name: d.name,
    sizeOnDisk: d.sizeOnDisk ?? 0,
  }));
  if (!hostDatabases.some((d) => d.name === database)) {
    throw new Error(
      `--source-database=${database} does not exist on this host (found: ${hostDatabases.map((d) => d.name).join(', ')})`,
    );
  }
  const db = client.db(database);
  const collections = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith('system.'))
    .sort();
  const known = new Set<string>([...PORTED_COLLECTIONS, ...DERIVED_COLLECTIONS]);
  const unknown = collections.filter((c) => !known.has(c));
  if (unknown.length > 0) {
    throw new Error(
      `Refusing: source has collection(s) this migration does not account for: ${unknown.join(', ')}`,
    );
  }

  const docs = {} as Record<SourceCollection, LogicalDocument[]>;
  for (const name of PORTED_COLLECTIONS) {
    // A collection Mongo never materialised (no document ever written) is empty.
    const raw = collections.includes(name)
      ? await db.collection(name).find({}).sort({ _id: 1 }).toArray()
      : [];
    docs[name] = raw.map((d) => toLogical(name, d));
  }
  const categoryDocs = collections.includes('categories')
    ? await db.collection('categories').find({}).toArray()
    : [];
  return { database, hostDatabases, collections, docs, categories: checkCategories(categoryDocs) };
}
