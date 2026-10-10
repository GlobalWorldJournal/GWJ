/**
 * The PostgreSQL side: read every ported table back in the logical-document
 * shape, and apply a copy in ONE transaction.
 */
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '@gwj/backend/src/db/client';
import { articles } from '@gwj/backend/src/db/schema/articles';
import { users } from '@gwj/backend/src/db/schema/users';
import { actorKeys } from '@gwj/backend/src/db/schema/actorKeys';
import { followers } from '@gwj/backend/src/db/schema/followers';
import { takedownRequests } from '@gwj/backend/src/db/schema/takedownRequests';
import { canonicalJson } from './canonical';
import { naturalKey, type LogicalDocument, type SourceCollection } from './normalize';
import {
  ARTICLE_SOURCE_FIELDS,
  actorKeyRow,
  articleRow,
  followerRow,
  takedownRequestRow,
  userRow,
} from './rows';
import { PORTED_COLLECTIONS, type SourceSnapshot } from './source';

type Executor = Pick<Database, 'select' | 'insert' | 'update' | 'execute'>;

/** Read the target tables as logical documents (drizzle property names = Mongo field names). */
export async function readTarget(
  db: Executor,
): Promise<Record<SourceCollection, LogicalDocument[]>> {
  const articleRows = await db.select().from(articles).orderBy(articles.id);
  const userRows = await db.select().from(users).orderBy(users.id);
  const keyRows = await db.select().from(actorKeys).orderBy(actorKeys.username);
  const followerRows = await db.select().from(followers).orderBy(followers.id);
  const takedownRows = await db.select().from(takedownRequests).orderBy(takedownRequests.id);
  return {
    // Only the fields Mongo had: columns added since the port (derived or new)
    // are not source data to compare.
    articles: articleRows.map((row) =>
      Object.fromEntries(ARTICLE_SOURCE_FIELDS.map((field) => [field, row[field]])),
    ),
    users: userRows.map((row) => ({ ...row })),
    actorkeys: keyRows.map((row) => ({ ...row })),
    // The identity id never existed in Mongo; the natural key identifies a follower.
    followers: followerRows.map(({ id: _identity, ...row }) => row),
    takedownrequests: takedownRows.map((row) => ({ ...row })),
  };
}

export class DivergedTargetError extends Error {
  constructor(problems: string[]) {
    super(
      `Refusing to copy: the target has diverged from the source, so a copy would overwrite or orphan ` +
        `PostgreSQL writes:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
    this.name = 'DivergedTargetError';
  }
}

export interface TableCopyReport {
  inserted: number;
  updated: number;
  unchanged: number;
}

const HAS_UPDATED_AT: Record<SourceCollection, boolean> = {
  articles: true,
  users: false,
  actorkeys: true,
  followers: true,
  takedownrequests: true,
};

function updatedAtOf(doc: LogicalDocument): number {
  const v = doc.updatedAt;
  return v instanceof Date ? v.getTime() : Number.NEGATIVE_INFINITY;
}

interface Plan {
  inserts: LogicalDocument[];
  updates: LogicalDocument[];
  unchanged: number;
}

function planTable(
  collection: SourceCollection,
  source: LogicalDocument[],
  target: LogicalDocument[],
  problems: string[],
): Plan {
  const byKey = new Map<string, LogicalDocument>();
  for (const doc of source) {
    const key = naturalKey(collection, doc);
    if (byKey.has(key))
      problems.push(`${collection}: two source documents share the natural key ${key}`);
    byKey.set(key, doc);
  }
  const targetByKey = new Map(target.map((d) => [naturalKey(collection, d), d]));
  for (const key of targetByKey.keys()) {
    if (!byKey.has(key)) problems.push(`${collection} ${key} exists only in PostgreSQL`);
  }
  const plan: Plan = { inserts: [], updates: [], unchanged: 0 };
  for (const [key, doc] of byKey) {
    const existing = targetByKey.get(key);
    if (!existing) plan.inserts.push(doc);
    else if (canonicalJson(existing) === canonicalJson(doc)) plan.unchanged += 1;
    else if (HAS_UPDATED_AT[collection] && updatedAtOf(existing) > updatedAtOf(doc)) {
      problems.push(`${collection} ${key} is NEWER in PostgreSQL than in Mongo`);
    } else plan.updates.push(doc);
  }
  return plan;
}

/**
 * Converge the target on the source in one transaction, with the four tables
 * locked against concurrent writers. Idempotent: a second run inserts and updates
 * nothing. Refuses (and rolls back) rather than overwrite a row PostgreSQL wrote
 * after the switch, or keep a row Mongo does not have.
 */
export async function copyToTarget(
  db: Database,
  source: SourceSnapshot,
): Promise<Record<SourceCollection, TableCopyReport>> {
  // Validate EVERY document before the first write, reporting all bad ones at once.
  const rows = {
    articles: source.docs.articles.map(articleRow),
    users: source.docs.users.map(userRow),
    actorkeys: source.docs.actorkeys.map(actorKeyRow),
    followers: source.docs.followers.map(followerRow),
    takedownrequests: source.docs.takedownrequests.map(takedownRequestRow),
  };

  return db.transaction(async (tx) => {
    await tx.execute(sql`set local lock_timeout = '10s'`);
    await tx.execute(
      sql`lock table articles, users, actor_keys, followers, takedown_requests in share row exclusive mode`,
    );
    const target = await readTarget(tx);
    const problems: string[] = [];
    const plans = {} as Record<SourceCollection, Plan>;
    for (const c of PORTED_COLLECTIONS)
      plans[c] = planTable(c, source.docs[c], target[c], problems);
    if (problems.length > 0) throw new DivergedTargetError(problems);

    const pick = <T>(c: SourceCollection, list: LogicalDocument[], all: T[]): T[] => {
      const wanted = new Set(list.map((d) => naturalKey(c, d)));
      return source.docs[c].flatMap((d, i) => {
        const row = all[i];
        return wanted.has(naturalKey(c, d)) && row !== undefined ? [row] : [];
      });
    };

    const a = plans.articles;
    for (const row of pick('articles', a.inserts, rows.articles))
      await tx.insert(articles).values(row);
    for (const row of pick('articles', a.updates, rows.articles))
      await tx.update(articles).set(row).where(eq(articles.id, row.id));

    const u = plans.users;
    for (const row of pick('users', u.inserts, rows.users)) await tx.insert(users).values(row);
    for (const row of pick('users', u.updates, rows.users))
      await tx.update(users).set(row).where(eq(users.id, row.id));

    const k = plans.actorkeys;
    for (const row of pick('actorkeys', k.inserts, rows.actorkeys))
      await tx.insert(actorKeys).values(row);
    for (const row of pick('actorkeys', k.updates, rows.actorkeys)) {
      await tx.update(actorKeys).set(row).where(eq(actorKeys.username, row.username));
    }

    // Followers in source `_id` order, so the identity tie-break keeps Mongo's order.
    const f = plans.followers;
    for (const row of pick('followers', f.inserts, rows.followers))
      await tx.insert(followers).values(row);
    for (const row of pick('followers', f.updates, rows.followers)) {
      await tx
        .update(followers)
        .set(row)
        .where(
          and(eq(followers.actorUsername, row.actorUsername), eq(followers.actorId, row.actorId)),
        );
    }

    const t = plans.takedownrequests;
    for (const row of pick('takedownrequests', t.inserts, rows.takedownrequests))
      await tx.insert(takedownRequests).values(row);
    for (const row of pick('takedownrequests', t.updates, rows.takedownrequests)) {
      await tx.update(takedownRequests).set(row).where(eq(takedownRequests.id, row.id));
    }

    const report = {} as Record<SourceCollection, TableCopyReport>;
    for (const c of PORTED_COLLECTIONS) {
      report[c] = {
        inserted: plans[c].inserts.length,
        updated: plans[c].updates.length,
        unchanged: plans[c].unchanged,
      };
    }
    return report;
  });
}
