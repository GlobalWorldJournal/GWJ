import { PutObjectCommand, S3Client, type S3ClientConfig } from '@aws-sdk/client-s3'
import { v4 as uuidv4 } from 'uuid'
import { type UploadResponse } from '@gwj/shared-types'
import { validateImageBuffer } from '@gwj/shared-types/image-validation'
import { type Env } from '../env'
import { UnprocessableEntityError } from '../errors'
import { logger } from '../logger'
import { WEBP_MIME, optimizeToWebp } from './imageOptimizer'

/**
 * Cache headers for uploaded images. Each object key is unique (UUID-prefixed)
 * and never mutated in place — the backfill writes a NEW key rather than
 * overwriting — so the content is safe to cache immutably for a year.
 */
const IMAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable'

/** Strip a filename down to a safe, lowercase, path-free token. */
function safeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename
  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned.length > 0 ? cleaned : 'image'
}

/** Replace (or add) a file extension on a safe filename. */
function withExtension(filename: string, extension: string): string {
  const withoutExt = filename.replace(/\.[a-z0-9]+$/i, '')
  return `${withoutExt}.${extension}`
}

export interface UploadService {
  uploadImage(buffer: Buffer, filename: string, contentType: string): Promise<UploadResponse>
}

/**
 * Build an S3-backed upload service bound to the given environment. The S3 client
 * is constructed once and reused; uploads land under `articles/<uuid>-<name>` and
 * are addressed publicly through the CDN base URL.
 */
export function createUploadService(env: Env): UploadService {
  const config: S3ClientConfig = { region: env.AWS_REGION }
  // Only set static credentials when BOTH keys are provided (local dev). When
  // absent, the SDK's default provider chain resolves the ECS task role.
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    }
  }
  const client = new S3Client(config)
  const cdnBase = env.CDN_BASE_URL.replace(/\/+$/, '')

  async function put(key: string, body: Buffer, contentType: string): Promise<UploadResponse> {
    await client.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: IMAGE_CACHE_CONTROL,
      }),
    )
    return { url: `${cdnBase}/${key}` }
  }

  return {
    async uploadImage(buffer, filename, contentType) {
      // Authoritative server-side validation: never store an image that is not a
      // complete, decodable file of an allowed type at a usable size. This is the
      // single chokepoint in front of S3, so it protects every caller (admin UI,
      // MCP/agents, scripts) regardless of what the client claims the file is.
      const validation = validateImageBuffer(buffer, { declaredMime: contentType })
      if (!validation.ok) {
        throw new UnprocessableEntityError(`Rejected image upload: ${validation.message}`, {
          reason: validation.reason,
        })
      }

      const safeName = safeFilename(filename)
      const prefix = `articles/${uuidv4()}-`

      // GIFs may be animated; re-encoding to a single WebP frame would silently
      // drop the animation, so store the validated original bytes as-is (still
      // with the long-lived cache header). Validation already ran on the
      // original bytes above.
      if (validation.format === 'gif') {
        return put(`${prefix}${safeName}`, buffer, validation.mime)
      }

      // Downscale (longest edge ≤ MAX_LONGEST_EDGE) and re-encode to WebP. If
      // sharp fails to process an image we already validated as structurally
      // sound, fall back to storing the original bytes rather than 500-ing a
      // legitimate upload — the image is still served, just unoptimized.
      try {
        const optimized = await optimizeToWebp(buffer)
        return put(`${prefix}${withExtension(safeName, 'webp')}`, optimized.buffer, WEBP_MIME)
      } catch (error) {
        logger.warn('Image optimization failed; storing original validated bytes', {
          filename: safeName,
          format: validation.format,
          error: error instanceof Error ? error.message : String(error),
        })
        // Persist the format we actually verified, not the (possibly wrong)
        // client-declared content type, so the stored content-type stays truthful.
        return put(`${prefix}${safeName}`, buffer, validation.mime)
      }
    },
  }
}
