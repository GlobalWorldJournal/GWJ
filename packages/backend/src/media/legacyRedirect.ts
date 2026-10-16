/**
 * `GET /legacy-media/<key>`: where an object of the retired bucket went. Old
 * CDN URLs live on outside GWJ's database — in newsletters already sent, in
 * federated posts, in caches — so once the bucket is gone, its CDN hostname is
 * pointed here (docs/OXY-FILES.md) and every such URL keeps resolving: a
 * permanent redirect to the Oxy file it was copied to (a rendition to the
 * nearest Oxy rendition of its image).
 */
import type { Request, RequestHandler, Response } from 'express';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/client';
import { legacyMediaObjects } from '../db/schema/legacyMediaObjects';
import { NotFoundError } from '../errors';
import { hiddenFiles } from './availability';
import { recordLegacyReads } from './legacyReads';
import type { OxyUrls } from './oxyUrls';

export const LEGACY_MEDIA_PATH = '/legacy-media';
const REDIRECT_CACHE_CONTROL = 'public, max-age=86400';

export function legacyRedirectHandler(urls: OxyUrls): RequestHandler {
  return async (req: Request, res: Response) => {
    const segments: unknown = req.params.key;
    const key = Array.isArray(segments) ? segments.map(String).join('/') : String(segments ?? '');
    const [row] = await getDb()
      .select({
        kind: legacyMediaObjects.kind,
        fileId: legacyMediaObjects.oxyFileId,
        width: legacyMediaObjects.renditionWidth,
      })
      .from(legacyMediaObjects)
      .where(
        and(
          eq(legacyMediaObjects.key, key),
          inArray(legacyMediaObjects.status, ['copied', 'mapped']),
        ),
      );
    if (!row?.fileId) throw new NotFoundError('No such media');
    if ((await hiddenFiles()).has(row.fileId)) throw new NotFoundError('Media unavailable');
    recordLegacyReads('redirect', 1);
    const target =
      row.kind === 'rendition' && row.width
        ? urls.url(row.fileId, urls.rungFor(row.width))
        : urls.url(row.fileId);
    res.set('Cache-Control', REDIRECT_CACHE_CONTROL);
    res.redirect(301, target);
  };
}
