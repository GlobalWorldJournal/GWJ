import { argv } from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env';
import { connectDb, disconnectDb } from './db/client';
import { buildApp } from './app';
import { startScheduler } from './services/scheduler';
import { errorFields, logger } from './logger';

export { createApp, buildApp } from './app';

/**
 * Never let an error escape silently: a rejected promise nobody awaited is logged
 * with its stack; an uncaught exception leaves the process in an unknown state,
 * so it is logged and the process exits for ECS to replace the task.
 */
function installProcessErrorHandlers(): void {
  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('unhandled promise rejection', errorFields(reason));
  });
  process.on('uncaughtException', (err: Error) => {
    logger.error('uncaught exception', errorFields(err));
    process.exit(1);
  });
}

async function bootstrap(): Promise<void> {
  installProcessErrorHandlers();
  const env = loadEnv();
  // Refuses to start on a schema missing a pre-deploy migration (see connectDb).
  await connectDb(env.DATABASE_URL);
  // Channel publishing (Mastodon + Telegram) is wired by buildApp and fans out on
  // the next published article.
  const { app, activityPub, stopChannels } = buildApp(env);
  logger.info('activitypub ready', {
    domain: activityPub.registry.domain,
    actors: activityPub.registry.all.length,
  });

  const stopScheduler = startScheduler();

  const server = app.listen(env.PORT, () => {
    logger.info('gwj backend listening', { port: env.PORT });
  });

  const shutdown = (signal: string): void => {
    logger.info('shutting down', { signal });
    stopScheduler();
    stopChannels();
    server.close(() => {
      void disconnectDb().finally(() => process.exit(0));
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Only auto-start when executed directly, not when imported (e.g. by tests).
const entry = argv[1] ? fileURLToPath(import.meta.url) === argv[1] : false;
if (entry) {
  bootstrap().catch((err: unknown) => {
    logger.error('failed to start backend', errorFields(err));
    process.exit(1);
  });
}
