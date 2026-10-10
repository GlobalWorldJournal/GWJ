import { fileURLToPath } from 'node:url';

/**
 * Absolute path of `packages/backend/drizzle/` — where `db:generate` writes and
 * the only place the migrator reads. Resolved from this file, so it holds from
 * any working directory (the ECS one-shot runs from `/app/packages/backend`).
 */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));
