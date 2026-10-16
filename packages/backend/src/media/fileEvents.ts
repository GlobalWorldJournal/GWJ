/**
 * Oxy's file events (ADR 0041 D9) for the files GWJ owns or uses: a takedown
 * (`file.blocked`), a deletion, trash, a restore, a visibility change. Each is
 * recorded once (`oxy_file_events`, deduped on the event id — delivery is at
 * least once) as the audit of why an image left or returned to GWJ's pages,
 * and the file's newest state is kept in `oxy_file_states`, which is what
 * hides it from readers (`presentation.ts`).
 *
 * The endpoint is registered once per environment (docs/OXY-FILES.md): Oxy
 * sends an unsigned challenge, the endpoint echoes it, and Oxy returns the
 * signing secret, which goes into `OXY_FILES_WEBHOOK_SECRET`. Until then any
 * other request answers 503 and Oxy retries it with backoff.
 */
import express, { type Request, type RequestHandler, type Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { oxyFileEvents } from '../db/schema/oxyFileEvents';
import {
  OXY_FILE_STATUSES,
  OXY_FILE_VISIBILITIES,
  oxyFileStates,
  type OxyFileStatus,
  type OxyFileVisibility,
} from '../db/schema/oxyFileStates';
import { errorFields, logger } from '../logger';
import { invalidateHiddenFiles } from './availability';
import { InvalidFileEventError, type OxyFileEvent, type OxyFiles } from './oxyFiles';

/** The path Oxy is registered to POST file events to. */
export const FILE_EVENTS_PATH = '/api/oxy/file-events';
const MAX_EVENT_BYTES = '256kb';

export type FileEventOutcome = 'applied' | 'superseded' | 'duplicate';

function isStatus(value: string): value is OxyFileStatus {
  return (OXY_FILE_STATUSES as readonly string[]).includes(value);
}

function isVisibility(value: string): value is OxyFileVisibility {
  return (OXY_FILE_VISIBILITIES as readonly string[]).includes(value);
}

/**
 * Record one verified event and apply it to the file's state, in one
 * transaction. A repeat delivery changes nothing; an event older than the state
 * already applied (deliveries are unordered) is recorded as `superseded`.
 */
export async function recordFileEvent(event: OxyFileEvent): Promise<FileEventOutcome> {
  const status = event.file.status;
  const visibility = event.file.visibility;
  if (!isStatus(status) || !isVisibility(visibility)) {
    throw new InvalidFileEventError(`Unknown file state ${status}/${visibility}`);
  }
  const occurredAt = new Date(event.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new InvalidFileEventError('The event carries no valid occurredAt');
  }
  const outcome = await getDb().transaction(async (tx): Promise<FileEventOutcome> => {
    const recorded = await tx
      .insert(oxyFileEvents)
      .values({
        eventId: event.id,
        type: event.type,
        fileId: event.file.id,
        fileStatus: status,
        fileVisibility: visibility,
        references: event.references,
        outcome: 'applied',
        occurredAt,
      })
      .onConflictDoNothing()
      .returning({ eventId: oxyFileEvents.eventId });
    if (recorded.length === 0) return 'duplicate';
    const applied = await tx
      .insert(oxyFileStates)
      .values({ fileId: event.file.id, status, visibility, occurredAt, eventId: event.id })
      .onConflictDoUpdate({
        target: oxyFileStates.fileId,
        set: {
          status: sql`excluded.status`,
          visibility: sql`excluded.visibility`,
          occurredAt: sql`excluded.occurred_at`,
          eventId: sql`excluded.event_id`,
          updatedAt: sql`now()`,
        },
        setWhere: sql`${oxyFileStates.occurredAt} <= excluded.occurred_at`,
      })
      .returning({ fileId: oxyFileStates.fileId });
    if (applied.length > 0) return 'applied';
    await tx
      .update(oxyFileEvents)
      .set({ outcome: 'superseded' })
      .where(eq(oxyFileEvents.eventId, event.id));
    return 'superseded';
  });
  invalidateHiddenFiles();
  return outcome;
}

/**
 * The receiver. Mounted BEFORE the global JSON parser: the signature covers
 * the exact bytes, so it takes the raw body.
 */
export function fileEventsHandler(oxy: OxyFiles): RequestHandler[] {
  return [
    express.raw({ type: 'application/json', limit: MAX_EVENT_BYTES }),
    async (req: Request, res: Response) => {
      const body: unknown = req.body;
      if (!Buffer.isBuffer(body)) {
        res.status(400).json({ error: 'Expected a JSON body' });
        return;
      }
      let event: ReturnType<OxyFiles['verifyEvent']>;
      try {
        event = oxy.verifyEvent(body, req.headers);
      } catch (err) {
        if (err instanceof InvalidFileEventError && !oxy.eventsConfigured) {
          res.status(503).json({ error: 'File events are not configured yet' });
          return;
        }
        if (err instanceof InvalidFileEventError) {
          logger.warn('file event refused', { error: err.message });
          res.status(400).json({ error: 'Invalid file event' });
          return;
        }
        throw err;
      }
      if (event.type === 'webhook.challenge') {
        res.json({ challenge: event.challenge });
        return;
      }
      try {
        const outcome = await recordFileEvent(event);
        logger.info('file event received', {
          eventId: event.id,
          type: event.type,
          fileId: event.file.id,
          status: event.file.status,
          visibility: event.file.visibility,
          references: event.references.length,
          outcome,
        });
        res.status(204).end();
      } catch (err) {
        if (err instanceof InvalidFileEventError) {
          logger.warn('file event refused', { eventId: event.id, error: err.message });
          res.status(400).json({ error: 'Invalid file event' });
          return;
        }
        logger.error('file event could not be recorded', {
          eventId: event.id,
          ...errorFields(err),
        });
        res.status(500).json({ error: 'Could not record the event' });
      }
    },
  ];
}
