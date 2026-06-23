import { PutObjectCommand, S3Client, type S3ClientConfig } from '@aws-sdk/client-s3'
import { v4 as uuidv4 } from 'uuid'
import { type UploadResponse } from '@gwj/shared-types'
import { validateImageBuffer } from '@gwj/shared-types/image-validation'
import { type Env } from '../env'
import { UnprocessableEntityError } from '../errors'

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

      const key = `articles/${uuidv4()}-${safeFilename(filename)}`
      await client.send(
        new PutObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: key,
          Body: buffer,
          // Persist the format we actually verified, not the (possibly wrong)
          // client-declared content type — this keeps the stored content-type
          // truthful so browsers and the audit never see a mime mismatch.
          ContentType: validation.mime,
        }),
      )
      const base = env.CDN_BASE_URL.replace(/\/+$/, '')
      return { url: `${base}/${key}` }
    },
  }
}
