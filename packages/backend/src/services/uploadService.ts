import { PutObjectCommand, S3Client, type S3ClientConfig } from '@aws-sdk/client-s3'
import { v4 as uuidv4 } from 'uuid'
import { type UploadResponse } from '@gwj/shared-types'
import { type Env } from '../env'

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
      const key = `articles/${uuidv4()}-${safeFilename(filename)}`
      await client.send(
        new PutObjectCommand({
          Bucket: env.S3_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        }),
      )
      const base = env.CDN_BASE_URL.replace(/\/+$/, '')
      return { url: `${base}/${key}` }
    },
  }
}
