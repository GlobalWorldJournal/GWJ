import { argv } from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadEnv, type Env } from './env';
import { connectDb, disconnectDb, getDb } from './db/client';
import { newRecordId } from './db/ids';
import { users } from './db/schema/users';
import { logger } from './logger';
import { hashPassword } from './auth/passwords';

/** Idempotently upsert the single admin user from env. Re-hashes the password each run. */
export async function seedAdminUser(env: Env): Promise<void> {
  const passwordHash = await hashPassword(env.ADMIN_PASSWORD);
  await getDb()
    .insert(users)
    .values({
      id: newRecordId(),
      username: env.ADMIN_USERNAME,
      passwordHash,
      role: 'admin',
      createdAt: new Date(),
    })
    // An existing admin keeps its id (the JWT `sub`) and creation time.
    .onConflictDoUpdate({ target: users.username, set: { passwordHash, role: 'admin' } });
  logger.info('seeded admin user', { username: env.ADMIN_USERNAME });
}

/**
 * Seed the database. Categories are NOT seeded: they are the closed `CATEGORIES`
 * tuple in `@gwj/shared-types` (served by `GET /api/categories` and enforced by
 * the `articles_category_check` constraint), so there is no table to fill.
 */
export async function runSeed(env: Env): Promise<void> {
  await seedAdminUser(env);
}

async function main(): Promise<void> {
  const env = loadEnv();
  await connectDb(env.DATABASE_URL);
  try {
    await runSeed(env);
  } finally {
    await disconnectDb();
  }
}

const entry = argv[1] ? fileURLToPath(import.meta.url) === argv[1] : false;
if (entry) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('seed failed', { message });
    process.exit(1);
  });
}
