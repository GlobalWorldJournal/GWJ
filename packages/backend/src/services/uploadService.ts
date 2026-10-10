import { randomUUID } from 'node:crypto';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import type { ImageVariant, UploadResponse } from '@gwj/shared-types';
import { validateImageBuffer } from '@gwj/shared-types/image-validation';
import type { Env } from '../env';
import { UnprocessableEntityError } from '../errors';
import { logger } from '../logger';
import { WEBP_MIME, optimizeWithVariants, readImageMetadata } from './imageOptimizer';

/**
 * Cache headers for uploaded images. Each object key is unique (UUID-prefixed)
 * and never mutated in place — the backfill writes a NEW key rather than
 * overwriting — so the content is safe to cache immutably for a year.
 */
const IMAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** Strip a filename down to a safe, lowercase, path-free token. */
function safeFilename(filename: string): string {
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
  const withoutExt = filename.replace(/\.[a-z0-9]+$/i, '');
  return `${withoutExt}.${extension}`;
}

/** An image already on the CDN, as {@link UploadService.addRenditions} found it. */
export interface StoredImage {
  /** The stored bytes (to fingerprint them). */
  bytes: Buffer;
  width: number;
  height: number;
  variants: ImageVariant[];
}

/** Per-call overrides of the image-validation floor (the article-image defaults otherwise). */
export interface UploadImageOptions {
  minWidth?: number;
  minHeight?: number;
  aspectRatio?: { width: number; height: number; tolerance?: number };
}

export interface UploadService {
  uploadImage(
    buffer: Buffer,
    filename: string,
    contentType: string,
    options?: UploadImageOptions,
  ): Promise<UploadResponse>;
  /**
   * Store an already-correctly-encoded image exactly as given, under its own
   * key prefix — no resize, no re-encode to WebP. For bytes a caller has
   * already composed at the exact format/size it needs (e.g. a generated
   * social-card JPEG, which the destination platform requires verbatim),
   * where `uploadImage`'s WebP re-encode would defeat the point.
   */
  storeImage(
    buffer: Buffer,
    filename: string,
    contentType: string,
    keyPrefix: string,
  ): Promise<UploadResponse>;
  /**
   * For an image uploaded before renditions existed: read it from the bucket and
   * store its srcset renditions beside it (`<key>.w400.webp`, …). The image
   * itself is not touched. Null when `url` is not one of our CDN objects.
   */
  addRenditions(url: string): Promise<StoredImage | null>;
}

/**
 * Build an S3-backed upload service bound to the given environment. The S3 client
 * is constructed once and reused; uploads land under `articles/<uuid>-<name>` and
 * are addressed publicly through the CDN base URL.
 */
export function createUploadService(env: Env): UploadService {
  const config: S3ClientConfig = { region: env.AWS_REGION };
  // Only set static credentials when BOTH keys are provided (local dev). When
  // absent, the SDK's default provider chain resolves the ECS task role.
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    };
  }
  const client = new S3Client(config);
  const cdnBase = env.CDN_BASE_URL.replace(/\/+$/, '');

  async function put(key: string, body: Buffer, contentType: string): Promise<UploadResponse> {
    await client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: IMAGE_CACHE_CONTROL,
      }),
    );
    return { url: `${cdnBase}/${key}`, variants: [] };
  }

  /** The bucket key behind one of our CDN URLs, or null for any other URL. */
  function keyOf(url: string): string | null {
    const prefix = `${cdnBase}/`;
    return url.startsWith(prefix) ? decodeURIComponent(url.slice(prefix.length)) : null;
  }

  return {
    async addRenditions(url) {
      const key = keyOf(url);
      if (!key) return null;
      const object = await client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
      if (!object.Body) throw new Error(`empty object ${key}`);
      const bytes = Buffer.from(await object.Body.transformToByteArray());
      const meta = await readImageMetadata(bytes);
      // An animated GIF keeps its frames: no WebP renditions for it.
      if (meta.format === 'gif')
        return { bytes, width: meta.width, height: meta.height, variants: [] };
      const { variants } = await optimizeWithVariants(bytes);
      const stored = await Promise.all(
        variants.map(async (variant) => {
          const variantKey = withExtension(key, `w${variant.width}.webp`);
          return {
            width: variant.width,
            url: (await put(variantKey, variant.buffer, WEBP_MIME)).url,
          };
        }),
      );
      return { bytes, width: meta.width, height: meta.height, variants: stored };
    },

    async uploadImage(buffer, filename, contentType, options = {}) {
      // Authoritative server-side validation: never store an image that is not a
      // complete, decodable file of an allowed type at a usable size. This is the
      // single chokepoint in front of S3, so it protects every caller (admin UI,
      // MCP/agents, scripts) regardless of what the client claims the file is.
      const validation = validateImageBuffer(buffer, {
        declaredMime: contentType,
        minWidth: options.minWidth,
        minHeight: options.minHeight,
        aspectRatio: options.aspectRatio,
      });
      if (!validation.ok) {
        throw new UnprocessableEntityError(`Rejected image upload: ${validation.message}`, {
          reason: validation.reason,
        });
      }

      const safeName = safeFilename(filename);
      const prefix = `articles/${randomUUID()}-`;

      // GIFs may be animated; re-encoding to a single WebP frame would silently
      // drop the animation, so store the validated original bytes as-is (still
      // with the long-lived cache header). Validation already ran on the
      // original bytes above.
      if (validation.format === 'gif') {
        return put(`${prefix}${safeName}`, buffer, validation.mime);
      }

      // Downscale (longest edge ≤ MAX_LONGEST_EDGE) and re-encode to WebP. If
      // sharp fails to process an image we already validated as structurally
      // sound, fall back to storing the original bytes rather than 500-ing a
      // legitimate upload — the image is still served, just unoptimized.
      try {
        const { main, variants } = await optimizeWithVariants(buffer);
        const stored = await put(
          `${prefix}${withExtension(safeName, 'webp')}`,
          main.buffer,
          WEBP_MIME,
        );
        const storedVariants = await Promise.all(
          variants.map(async (variant) => {
            // Beside the main object: `<uuid>-name.w400.webp`.
            const key = `${prefix}${withExtension(safeName, `w${variant.width}.webp`)}`;
            return { width: variant.width, url: (await put(key, variant.buffer, WEBP_MIME)).url };
          }),
        );
        return {
          url: stored.url,
          width: main.width,
          height: main.height,
          variants: storedVariants,
        };
      } catch (error) {
        logger.warn('Image optimization failed; storing original validated bytes', {
          filename: safeName,
          format: validation.format,
          error: error instanceof Error ? error.message : String(error),
        });
        // Persist the format we actually verified, not the (possibly wrong)
        // client-declared content type, so the stored content-type stays truthful.
        return put(`${prefix}${safeName}`, buffer, validation.mime);
      }
    },

    async storeImage(buffer, filename, contentType, keyPrefix) {
      // Same structural chokepoint as uploadImage — even bytes this process
      // generated itself are worth proving decodable before they're stored and
      // handed to an external platform.
      const validation = validateImageBuffer(buffer, { declaredMime: contentType });
      if (!validation.ok) {
        throw new UnprocessableEntityError(`Rejected image upload: ${validation.message}`, {
          reason: validation.reason,
        });
      }
      const safeName = safeFilename(filename);
      return put(`${keyPrefix}${randomUUID()}-${safeName}`, buffer, validation.mime);
    },
  };
}
