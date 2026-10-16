import { argv } from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env';
import { connectDb, disconnectDb } from './db/client';
import { buildApp } from './app';
import { startScheduler } from './services/scheduler';
import { startOutboxWorker } from './channels/outbox';
import { startNewsletterSender } from './services/newsletterSender';
import { articleService } from './services/articleService';
import { startReferenceWorker } from './media/referenceWorker';
import { startReconciler } from './media/reconcile';
import { startLegacyReadFlusher } from './media/legacyReads';
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
  // buildApp registers the distribution channels (Mastodon + Telegram); this
  // process also works their outbox, like every backend task.
  const { app, activityPub, channels, stopChannels, newsletter, oxyFiles, presenter } =
    buildApp(env);
  logger.info('activitypub ready', {
    domain: activityPub.registry.domain,
    actors: activityPub.registry.all.length,
  });

  const stopScheduler = startScheduler();
  const stopOutbox = startOutboxWorker(channels, presenter);
  // Media references (Oxy Files): the outbox of reference changes, the nightly
  // reconciliation, and the legacy-read counts.
  const stopReferences = startReferenceWorker(oxyFiles);
  const stopReconciler = startReconciler(oxyFiles);
  const stopLegacyReads = startLegacyReadFlusher();
  const stopNewsletter = startNewsletterSender({
    service: newsletter.service,
    sender: newsletter.sender,
    articles: articleService,
    apiBaseUrl: env.API_BASE_URL,
    presenter,
  });

  const server = app.listen(env.PORT, () => {
    logger.info('gwj backend listening', { port: env.PORT });
  });

  const shutdown = (signal: string): void => {
    logger.info('shutting down', { signal });
    stopScheduler();
    stopOutbox();
    stopReferences();
    stopReconciler();
    stopNewsletter();
    stopChannels();
    server.close(() => {
      void stopLegacyReads()
        .then(() => disconnectDb())
        .finally(() => process.exit(0));
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
