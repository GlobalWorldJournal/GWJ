import { createHash } from 'node:crypto';
import type { HeroImage, UploadResponse } from '@gwj/shared-types';
import { MAX_IMAGE_BYTES, validateImageBuffer } from '@gwj/shared-types/image-validation';
import { findMediaByUrl, recordMedia } from '../db/repositories/mediaRepository';
import type { MediaAssetRow } from '../db/schema/mediaAssets';
import { UnprocessableEntityError } from '../errors';
import { logger } from '../logger';
import type { OxyFiles } from '../media/oxyFiles';
import { WEBP_MIME, optimizeToWebp, readImageMetadata, stripMetadata } from './imageOptimizer';

/** Per-call overrides of the image-validation floor (the article-image defaults otherwise). */
export interface UploadImageOptions {
  minWidth?: number;
  minHeight?: number;
  aspectRatio?: { width: number; height: number; tolerance?: number };
}

export interface StoreOptions {
  /**
   * Who is storing it, for the audit (`<username>`, `agent:<name>`,
   * `advertiser:<id>`, `system:<what>`). The file belongs to GWJ, not to them.
   */
  uploadedBy: string;
  dimensions?: UploadImageOptions;
}

/** A generated image stored verbatim (a social card). */
export interface StoredGeneratedImage {
  fileId: string;
  url: string;
}

export interface MediaService {
  /** The Oxy file a URL this service answered names (null for any other URL). */
  fileIdOf(url: string): string | null;
  /**
   * Validate an image (the single chokepoint every caller passes: admin UI,
   * MCP agents, advertisers), strip its metadata, downscale and re-encode it
   * to WebP, and store it as a GWJ-owned Oxy file. Answers its URL, size and
   * the Oxy renditions to use for `srcset`. The same bytes stored again answer
   * the same file (Oxy dedupes per owner).
   */
  upload(
    buffer: Buffer,
    filename: string,
    contentType: string,
    options: StoreOptions,
  ): Promise<UploadResponse>;
  /**
   * Copy a remote image (a source's og:image) onto GWJ: Oxy fetches it with its
   * own SSRF-safe fetcher (ADR 0041 D7, which also remembers the URL so a
   * repeat import downloads nothing), and the bytes then go through
   * {@link upload}'s pipeline. The raw import is never shown and nothing
   * references it, so Oxy collects it (D5).
   */
  importFromUrl(
    url: string,
    filename: string | undefined,
    options: StoreOptions,
  ): Promise<UploadResponse>;
  /**
   * Store bytes this process composed at the exact format a destination needs
   * (a JPEG social card) as they are: validated, not re-encoded.
   */
  storeGenerated(
    buffer: Buffer,
    filename: string,
    contentType: string,
    uploadedBy: string,
    dimensions?: UploadImageOptions,
  ): Promise<StoredGeneratedImage>;
}

/** Strip a filename down to a safe, lowercase, path-free token. */
export function safeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned : 'image';
}

/** Replace (or add) a file extension on a safe filename. */
function withExtension(filename: string, extension: string): string {
  return `${filename.replace(/\.[a-z0-9]+$/i, '')}.${extension}`;
}

function filenameFromUrl(url: string): string {
  const last = new URL(url).pathname.split('/').filter(Boolean).pop();
  return last ? decodeURIComponent(last) : 'image';
}

function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function toUploadResponse(row: MediaAssetRow): UploadResponse {
  return {
    url: row.url,
    ...(row.width ? { width: row.width } : {}),
    ...(row.height ? { height: row.height } : {}),
    variants: row.variants,
  };
}

interface ProcessedImage {
  bytes: Buffer;
  mime: string;
  extension: string;
  width: number;
  height: number;
}

const EXTENSION_BY_FORMAT = { jpeg: 'jpg', png: 'png', webp: 'webp', gif: 'gif' } as const;

/**
 * The bytes GWJ stores for a validated image. Every source here comes from an
 * outlet or a phone GWJ does not control, and its metadata (GPS, camera
 * serial) is not GWJ's to publish: the WebP re-encode drops it; a GIF keeps
 * its frames with the metadata stripped; if sharp cannot re-encode bytes the
 * validator proved sound, a same-format strip is tried, and only if that fails
 * too are the original bytes stored (logged loudly).
 */
async function processImage(
  buffer: Buffer,
  format: keyof typeof EXTENSION_BY_FORMAT,
  mime: string,
  name: string,
): Promise<ProcessedImage> {
  const stripped = async (bytes: Buffer): Promise<ProcessedImage> => {
    const meta = await readImageMetadata(bytes);
    return {
      bytes,
      mime,
      extension: EXTENSION_BY_FORMAT[format],
      width: meta.width,
      height: meta.height,
    };
  };
  if (format === 'gif') return stripped(await stripMetadata(buffer, format));
  try {
    const main = await optimizeToWebp(buffer);
    return {
      bytes: main.buffer,
      mime: WEBP_MIME,
      extension: 'webp',
      width: main.width,
      height: main.height,
    };
  } catch (error) {
    logger.warn('Image optimization failed; falling back to a metadata-only strip', {
      filename: name,
      format,
      error: error instanceof Error ? error.message : String(error),
    });
    try {
      return await stripped(await stripMetadata(buffer, format));
    } catch (strippingError) {
      logger.error('Metadata strip also failed; storing the original bytes untouched', {
        filename: name,
        format,
        error: strippingError instanceof Error ? strippingError.message : String(strippingError),
      });
      return stripped(buffer);
    }
  }
}

function rejectInvalid(validation: { ok: false; message: string; reason: string }): never {
  throw new UnprocessableEntityError(`Rejected image upload: ${validation.message}`, {
    reason: validation.reason,
  });
}

export function createMediaService(oxy: OxyFiles): MediaService {
  async function upload(
    buffer: Buffer,
    filename: string,
    contentType: string,
    options: StoreOptions,
  ): Promise<UploadResponse> {
    const validation = validateImageBuffer(buffer, {
      declaredMime: contentType,
      ...options.dimensions,
    });
    if (!validation.ok) rejectInvalid(validation);
    const name = safeFilename(filename);
    const processed = await processImage(buffer, validation.format, validation.mime, name);
    const stored = await oxy.uploadImage(
      processed.bytes,
      processed.mime,
      withExtension(name, processed.extension),
    );
    return toUploadResponse(
      await recordMedia({
        url: oxy.url(stored.fileId),
        oxyFileId: stored.fileId,
        sha256: stored.sha256,
        width: processed.width || null,
        height: processed.height || null,
        mime: processed.mime,
        variants: oxy.variantsFor(stored.fileId, processed.width, processed.mime),
        uploadedBy: options.uploadedBy,
      }),
    );
  }

  return {
    fileIdOf: (url) => oxy.fileIdOf(url),
    upload,

    async importFromUrl(url, filename, options) {
      const imported = await oxy.importImage(url);
      const bytes = Buffer.from(await oxy.readImage(imported.fileId, MAX_IMAGE_BYTES));
      if (sha256Of(bytes) !== imported.sha256) {
        throw new UnprocessableEntityError('The imported image changed while being read back', {
          reason: 'fetch-failed',
        });
      }
      return upload(bytes, filename ?? filenameFromUrl(url), imported.mime, options);
    },

    async storeGenerated(buffer, filename, contentType, uploadedBy, dimensions = {}) {
      // Even bytes this process generated are proved decodable before they are
      // stored and handed to an external platform.
      const validation = validateImageBuffer(buffer, { declaredMime: contentType, ...dimensions });
      if (!validation.ok) rejectInvalid(validation);
      const stored = await oxy.uploadImage(buffer, validation.mime, safeFilename(filename));
      const url = oxy.url(stored.fileId);
      await recordMedia({
        url,
        oxyFileId: stored.fileId,
        sha256: stored.sha256,
        width: validation.width,
        height: validation.height,
        mime: validation.mime,
        variants: [],
        uploadedBy,
      });
      return { fileId: stored.fileId, url };
    },
  };
}

/**
 * A hero image with its size, type and renditions as WE recorded them: looked
 * up by URL, never taken from the caller. An image that is not one of ours (or
 * predates the record) carries none.
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
    ...(media.mime ? { mime: media.mime } : {}),
    ...(media.variants.length > 0 ? { variants: media.variants } : {}),
  };
}
