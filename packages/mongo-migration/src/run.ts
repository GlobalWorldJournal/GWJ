import { MongoClient } from 'mongodb';
import { createDatabase } from '@gwj/backend/src/db/client';
import { MIGRATIONS_FOLDER } from '@gwj/backend/src/db/migrationsFolder';
import {
  assertMigrationTarget,
  assertPreDeployMigrationsApplied,
} from '@gwj/backend/src/db/migrator';
import { readSource, PORTED_COLLECTIONS } from './source';
import { copyToTarget, readTarget, type TableCopyReport } from './target';
import { verifyTables, type TableVerification } from './verify';
import type { SourceCollection } from './normalize';

export type MigrationMode = 'copy' | 'verify';

export interface MigrationOptions {
  mode: MigrationMode;
  mongoUri: string;
  sourceDatabase: string;
  databaseUrl: string;
  targetDatabase: string;
  /** Accept a source with zero ported documents (never in production). */
  allowEmpty: boolean;
  report: (event: Record<string, unknown>) => void;
}

export interface MigrationResult {
  pass: boolean;
  copy: Record<SourceCollection, TableCopyReport> | null;
  verification: TableVerification[];
  reasons: string[];
}

const CLOSE_TIMEOUT_SECONDS = 5;

export async function runMigration(options: MigrationOptions): Promise<MigrationResult> {
  const mongo = new MongoClient(options.mongoUri, {
    appName: 'gwj-mongo-migration',
    serverSelectionTimeoutMS: 15000,
  });
  const { db, client } = createDatabase(options.databaseUrl, 2);
  try {
    // Identity first, before anything can fail on data.
    await assertMigrationTarget(client, options.targetDatabase);
    const [who] = await client<{ db: string; usr: string; addr: string | null }[]>`
      select current_database() as db, current_user as usr, inet_server_addr()::text as addr`;
    options.report({ event: 'target', database: who?.db, user: who?.usr, server: who?.addr });
    await assertPreDeployMigrationsApplied(client, MIGRATIONS_FOLDER);

    await mongo.connect();
    const source = await readSource(mongo, options.sourceDatabase);
    options.report({
      event: 'source',
      database: source.database,
      host: source.hostDatabases,
      collections: source.collections,
    });
    for (const c of PORTED_COLLECTIONS)
      options.report({ event: 'source-count', collection: c, documents: source.docs[c].length });
    options.report({
      event: 'categories',
      documents: source.categories.count,
      ported: false,
      problems: source.categories.problems,
    });

    const reasons: string[] = [];
    if (source.categories.problems.length > 0) {
      reasons.push(
        `categories differ from the CATEGORIES tuple: ${source.categories.problems.join('; ')}`,
      );
    }
    const total = PORTED_COLLECTIONS.reduce((n, c) => n + source.docs[c].length, 0);
    if (total === 0 && !options.allowEmpty) {
      // Zero is what a correct copy of nothing and a misdirected read both print.
      reasons.push(
        'source holds 0 documents across every ported collection (wrong --source-database or URI?)',
      );
    }

    let copy: MigrationResult['copy'] = null;
    if (options.mode === 'copy' && reasons.length === 0) {
      copy = await copyToTarget(db, source);
      for (const c of PORTED_COLLECTIONS) options.report({ event: 'copied', table: c, ...copy[c] });
    }

    const verification = verifyTables(source.docs, await readTarget(db));
    for (const v of verification) options.report({ event: 'verify', ...v });
    for (const v of verification)
      if (!v.match) reasons.push(`${v.table}: source and target differ`);

    return { pass: reasons.length === 0, copy, verification, reasons };
  } finally {
    await mongo.close();
    await client.end({ timeout: CLOSE_TIMEOUT_SECONDS });
  }
}
