/**
 * One-shot: give hero images uploaded before srcset renditions existed their
 * size and renditions (see imageBackfill.ts). Run as an ECS one-shot from the
 * backend image, which has the database, the bucket and the CDN settings:
 *
 *   AWS_REGION=us-west-2 ECS_CLUSTER=oxy-cluster scripts/ecs-oneshot.sh \
 *     gwj-backend image-backfill -- bun run src/media/backfill.ts
 *
 * `DRY_RUN=1` reports what it would do without writing anything.
 */
import { connectDb, disconnectDb } from '../db/client';
import { loadEnv } from '../env';
import { logger } from '../logger';
import { createUploadService } from '../services/uploadService';
import { backfillHeroImages } from './imageBackfill';

function isDryRun(): boolean {
  return ['1', 'true', 'yes'].includes((process.env.DRY_RUN ?? '').trim().toLowerCase());
}

async function main(): Promise<void> {
  const env = loadEnv();
  await connectDb(env.DATABASE_URL);
  try {
    const report = await backfillHeroImages(createUploadService(env), { dryRun: isDryRun() });
    if (report.failed > 0) process.exitCode = 1;
  } finally {
    await disconnectDb();
  }
}

main().catch((err: unknown) => {
  logger.error('image backfill failed', {
    message: err instanceof Error ? err.message : String(err),
  });
  process.exitCode = 1;
});
