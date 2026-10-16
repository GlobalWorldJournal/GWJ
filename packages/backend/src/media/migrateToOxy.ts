/**
 * `bun run src/media/migrateToOxy.ts --target-database=<name> --mode=preview|apply`
 *
 * The one-time copy of the legacy media bucket into Oxy Files
 * (`legacyMigration.ts`; procedure in docs/OXY-FILES.md). Run as an ECS
 * one-shot from the backend image, which has the database, the bucket (read
 * only) and GWJ's Oxy credential:
 *
 *   AWS_REGION=us-west-2 ECS_CLUSTER=oxy-cluster scripts/ecs-oneshot.sh \
 *     gwj-backend oxy-files-migration -- \
 *     bun run src/media/migrateToOxy.ts --target-database=gwj --mode=preview
 *
 * Prints ONE JSON report (counts, row ids, SHA-256s — never a key or URL) and
 * exits 1 unless the verdict is PASS (or PREVIEW). Resumable: run `apply`
 * again until it passes.
 */
import { argv } from 'node:process';
import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { sql } from 'drizzle-orm';
import { connectDb, disconnectDb, getDb } from '../db/client';
import { loadEnv, type Env } from '../env';
import { errorFields, logger } from '../logger';
import { createLegacyMedia } from './legacy';
import { runLegacyMigration, type LegacyBucket, type MigrationMode } from './legacyMigration';
import { createOxyFiles, oxyFilesConfigFrom } from './oxyFiles';

function flag(args: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function readMode(args: readonly string[]): MigrationMode {
  const mode = flag(args, 'mode');
  if (mode === 'preview' || mode === 'apply') return mode;
  throw new Error('--mode=preview|apply is required');
}

/** The legacy bucket, read only. */
export function createS3LegacyBucket(env: Env): LegacyBucket {
  const config: S3ClientConfig = { region: env.AWS_REGION };
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    };
  }
  const client = new S3Client(config);
  return {
    async *list() {
      let token: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({ Bucket: env.S3_BUCKET, ContinuationToken: token }),
        );
        for (const object of page.Contents ?? []) {
          if (!object.Key || object.Key.endsWith('/')) continue;
          yield {
            key: object.Key,
            size: object.Size ?? 0,
            ...(object.ETag ? { etag: object.ETag } : {}),
          };
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
    },
    async get(key) {
      const object = await client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
      if (!object.Body) throw new Error('empty object');
      return {
        bytes: await object.Body.transformToByteArray(),
        ...(object.ContentType ? { contentType: object.ContentType } : {}),
      };
    },
  };
}

async function main(): Promise<void> {
  const args = argv.slice(2);
  const target = flag(args, 'target-database');
  if (!target) throw new Error('--target-database=<name> is required');
  const mode = readMode(args);
  const env = loadEnv();
  await connectDb(env.DATABASE_URL);
  try {
    const [row] = await getDb().execute<{ db: string }>(sql`select current_database() as db`);
    if (row?.db !== target) {
      throw new Error(`connected to database ${row?.db ?? '?'}, not --target-database=${target}`);
    }
    const report = await runLegacyMigration(
      {
        bucket: createS3LegacyBucket(env),
        oxy: createOxyFiles(oxyFilesConfigFrom(env)),
        legacy: createLegacyMedia(env.CDN_BASE_URL),
      },
      mode,
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.verdict === 'FAIL') process.exitCode = 1;
  } finally {
    await disconnectDb();
  }
}

main().catch((err: unknown) => {
  logger.error('oxy files migration failed', errorFields(err));
  process.exitCode = 1;
});
