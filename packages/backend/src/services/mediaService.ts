import { createHash } from 'node:crypto';
import type { HeroImage, UploadResponse } from '@gwj/shared-types';
import { findMediaBySha256, findMediaByUrl, recordMedia } from '../db/repositories/mediaRepository';
import type { MediaAssetRow } from '../db/schema/mediaAssets';
import type { UploadService } from './uploadService';

function toUploadResponse(row: MediaAssetRow): UploadResponse {
  return {
    url: row.url,
    ...(row.width ? { width: row.width } : {}),
    ...(row.height ? { height: row.height } : {}),
    variants: row.variants,
  };
}

export interface MediaService {
  /**
   * Store an image on the CDN (validated, optimized, with its `srcset`
   * renditions) and record it. The same bytes uploaded again return the stored
   * image instead of a copy.
   */
  upload(buffer: Buffer, filename: string, contentType: string): Promise<UploadResponse>;
}

export function createMediaService(uploads: UploadService): MediaService {
  return {
    async upload(buffer, filename, contentType) {
      const sha256 = createHash('sha256').update(buffer).digest('hex');
      const existing = await findMediaBySha256(sha256);
      if (existing) return toUploadResponse(existing);
      const stored = await uploads.uploadImage(buffer, filename, contentType);
      return toUploadResponse(
        await recordMedia({
          url: stored.url,
          sha256,
          width: stored.width ?? null,
          height: stored.height ?? null,
          variants: stored.variants,
        }),
      );
    },
  };
}

/**
 * A hero image with its size and renditions as WE recorded them: looked up by
 * URL, never taken from the caller. An image that is not one of our uploads
 * (or predates the record) carries none.
 */
export async function withImageMetadata(image: HeroImage): Promise<HeroImage> {
  const given: HeroImage = {
    url: image.url,
    alt: image.alt,
    ...(image.caption !== undefined ? { caption: image.caption } : {}),
    ...(image.credit !== undefined ? { credit: image.credit } : {}),
  };
  const media = await findMediaByUrl(image.url);
  if (!media) return given;
  return {
    ...given,
    ...(media.width ? { width: media.width } : {}),
    ...(media.height ? { height: media.height } : {}),
    ...(media.variants.length > 0 ? { variants: media.variants } : {}),
  };
}
