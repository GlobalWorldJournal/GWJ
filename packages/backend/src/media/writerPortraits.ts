/**
 * Roster writers' portraits: GWJ-owned Oxy files, one per writer
 * (`writer_portraits`), served to the reader site and the fediverse through
 * one stable URL, `GET /api/writers/<username>/portrait`, which redirects to
 * the file. During the soak a writer whose portrait has not been copied yet is
 * redirected to the legacy bucket (and counted).
 */
import type { Request, RequestHandler, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { findWriterByFediUsername, writerAvatarPath } from '@gwj/shared-types';
import { getDb } from '../db/client';
import { writerPortraits } from '../db/schema/writerPortraits';
import { validateImageBuffer } from '@gwj/shared-types/image-validation';
import { BadRequestError, NotFoundError, UnprocessableEntityError } from '../errors';
import type { MediaService } from '../services/mediaService';
import { hiddenFiles } from './availability';
import type { LegacyMedia } from './legacy';
import { recordLegacyReads } from './legacyReads';
import type { OxyUrls } from './oxyUrls';
import { enqueueReferenceSync } from './referenceJobs';

/** A portrait is square and at least this many pixels a side. */
export const WRITER_PORTRAIT_MIN_PX = 256;
/** Browsers and caches may keep the redirect an hour; a replaced portrait shows within it. */
const PORTRAIT_CACHE_CONTROL = 'public, max-age=3600';

/** Store a new portrait for a roster writer and reference it. */
export async function setWriterPortrait(
  media: MediaService,
  username: string,
  file: Express.Multer.File | undefined,
  uploadedBy: string,
): Promise<{ url: string }> {
  if (!findWriterByFediUsername(username)) throw new NotFoundError('No such writer');
  if (!file) throw new BadRequestError('No file uploaded (expected field "file")');
  // A PNG, stored as it is: the actors' icons are declared `image/png`, and a
  // generated monogram carries no metadata to strip.
  const dimensions = {
    minWidth: WRITER_PORTRAIT_MIN_PX,
    minHeight: WRITER_PORTRAIT_MIN_PX,
    aspectRatio: { width: 1, height: 1 },
  };
  const validation = validateImageBuffer(file.buffer, {
    declaredMime: file.mimetype,
    ...dimensions,
  });
  if (!validation.ok) {
    throw new UnprocessableEntityError(`Rejected portrait: ${validation.message}`, {
      reason: validation.reason,
    });
  }
  if (validation.format !== 'png') {
    throw new UnprocessableEntityError('A portrait must be a PNG', { reason: 'mime-mismatch' });
  }
  const stored = await media.storeGenerated(
    file.buffer,
    `${username}.png`,
    validation.mime,
    uploadedBy,
    dimensions,
  );
  const fileId = stored.fileId;
  await getDb().transaction(async (tx) => {
    await tx
      .insert(writerPortraits)
      .values({ username, oxyFileId: fileId, uploadedBy })
      .onConflictDoUpdate({
        target: writerPortraits.username,
        set: { oxyFileId: fileId, uploadedBy, updatedAt: sql`now()` },
      });
    await enqueueReferenceSync(tx, 'writer_portrait', [username]);
  });
  return { url: stored.url };
}

/** `GET /api/writers/:username/portrait`: a redirect to the portrait. */
export function writerPortraitHandler(urls: OxyUrls, legacy: LegacyMedia): RequestHandler {
  return async (req: Request, res: Response) => {
    const username = String(req.params.username ?? '');
    const writer = findWriterByFediUsername(username);
    if (!writer) throw new NotFoundError('No such writer');
    const [row] = await getDb()
      .select({ fileId: writerPortraits.oxyFileId })
      .from(writerPortraits)
      .where(eq(writerPortraits.username, username));
    res.set('Cache-Control', PORTRAIT_CACHE_CONTROL);
    if (row) {
      if ((await hiddenFiles()).has(row.fileId)) throw new NotFoundError('Portrait unavailable');
      res.redirect(302, urls.url(row.fileId));
      return;
    }
    recordLegacyReads('portrait', 1);
    res.redirect(302, legacy.urlOf(writerAvatarPath(writer.name)));
  };
}
