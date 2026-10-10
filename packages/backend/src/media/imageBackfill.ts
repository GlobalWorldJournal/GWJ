import { createHash } from 'node:crypto';
import {
  findHeroImagesWithoutMetadata,
  setHeroImageMetadata,
} from '../db/repositories/articleRepository';
import { findMediaByUrl, recordMedia } from '../db/repositories/mediaRepository';
import type { MediaAssetRow } from '../db/schema/mediaAssets';
import { errorFields, logger } from '../logger';
import type { UploadService } from '../services/uploadService';

export interface BackfillReport {
  /** Hero images given their size and renditions. */
  filled: number;
  /** Articles whose hero image metadata was filled in. */
  articles: number;
  /** Hero images not on our CDN (nothing to do). */
  external: number;
  /** Images that could not be processed (logged; the run goes on). */
  failed: number;
}

/**
 * Give every hero image uploaded before renditions existed its size and srcset
 * renditions: each image is read from the bucket, its renditions are stored
 * beside it, it is recorded as a media asset, and the articles showing it get
 * the metadata — without becoming "updated" (see setHeroImageMetadata).
 * Idempotent: an image already filled in is no longer selected. With `dryRun`
 * it only reports what it would do.
 */
export async function backfillHeroImages(
  uploads: UploadService,
  options: { dryRun: boolean },
): Promise<BackfillReport> {
  const report: BackfillReport = { filled: 0, articles: 0, external: 0, failed: 0 };
  const urls = await findHeroImagesWithoutMetadata();
  logger.info('image backfill: hero images without metadata', {
    images: urls.length,
    dryRun: options.dryRun,
  });
  for (const url of urls) {
    try {
      const media = await mediaFor(uploads, url, options.dryRun);
      if (media === 'external') {
        report.external += 1;
        continue;
      }
      if (!media) continue; // dry run
      const updated = await setHeroImageMetadata(url, {
        ...(media.width ? { width: media.width } : {}),
        ...(media.height ? { height: media.height } : {}),
        variants: media.variants,
      });
      report.filled += 1;
      report.articles += updated.length;
    } catch (err) {
      report.failed += 1;
      logger.error('image backfill: image failed', { url, ...errorFields(err) });
    }
  }
  logger.info('image backfill: done', { ...report, dryRun: options.dryRun });
  return report;
}

/** The recorded media asset for `url`, registering it (renditions included) when new. */
async function mediaFor(
  uploads: UploadService,
  url: string,
  dryRun: boolean,
): Promise<MediaAssetRow | 'external' | null> {
  const known = await findMediaByUrl(url);
  if (known) return known;
  if (dryRun) {
    logger.info('image backfill: would add renditions', { url });
    return null;
  }
  const stored = await uploads.addRenditions(url);
  if (!stored) return 'external';
  // Identical bytes already recorded under another URL: the same picture, so its
  // renditions serve this one too.
  return recordMedia({
    url,
    sha256: createHash('sha256').update(stored.bytes).digest('hex'),
    width: stored.width,
    height: stored.height,
    variants: stored.variants,
  });
}
