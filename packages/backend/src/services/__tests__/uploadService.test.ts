/**
 * Unit tests for the S3 upload service's resize + WebP re-encode step.
 *
 * The AWS SDK's `S3Client` is mocked so each upload captures the exact
 * `PutObjectCommand` input (key, body bytes, content-type, cache-control)
 * without touching the network or real S3. We then decode the captured body
 * with `sharp` to assert the actual stored format/dimensions.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { validateImageBuffer } from '@gwj/shared-types/image-validation';
import { validGifBuffer, validPngBuffer } from '../../__tests__/imageFixtures';

interface CapturedPut {
  Bucket: string;
  Key: string;
  Body: Buffer;
  ContentType: string;
  CacheControl?: string;
}

const captured: CapturedPut[] = [];

// Capture every PutObjectCommand input via a mocked S3 client. The command
// class is a thin holder for its input, mirroring the real SDK.
/** Objects the mocked bucket holds, by key (for GetObject). */
const bucket = new Map<string, Buffer>();

vi.mock('@aws-sdk/client-s3', () => {
  class PutObjectCommand {
    constructor(public readonly input: CapturedPut) {}
  }
  class GetObjectCommand {
    constructor(public readonly input: { Bucket: string; Key: string }) {}
  }
  class S3Client {
    async send(command: PutObjectCommand | GetObjectCommand): Promise<unknown> {
      if (command instanceof GetObjectCommand) {
        const bytes = bucket.get(command.input.Key);
        if (!bytes) throw new Error(`NoSuchKey ${command.input.Key}`);
        return { Body: { transformToByteArray: async () => new Uint8Array(bytes) } };
      }
      captured.push(command.input);
      return {};
    }
  }
  return { S3Client, PutObjectCommand, GetObjectCommand };
});

const { createUploadService } = await import('../uploadService');

const env = {
  AWS_REGION: 'us-east-1',
  S3_BUCKET: 'test-bucket',
  CDN_BASE_URL: 'https://cdn.example.test',
} as unknown as Parameters<typeof createUploadService>[0];

/** Build a large, real JPEG so the resize step has something to downscale. */
async function largeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 12, g: 34, b: 56 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe('createUploadService image optimization', () => {
  beforeEach(() => {
    captured.length = 0;
  });

  it('downscales a >1600px JPEG to a smaller WebP capped at 1600px on the long edge', async () => {
    const service = createUploadService(env);
    const original = await largeJpeg(1920, 1280);
    // Sanity: the source must really be large enough to be downscaled.
    expect((await sharp(original).metadata()).width).toBe(1920);

    const result = await service.uploadImage(original, 'hero.jpg', 'image/jpeg');

    // The main image plus a narrower rendition at each srcset width below it.
    expect(captured).toHaveLength(4);
    const put = captured[0];
    if (!put) throw new Error('no PutObject captured');
    expect(put.ContentType).toBe('image/webp');
    expect(put.CacheControl).toBe('public, max-age=31536000, immutable');
    expect(put.Key).toMatch(/^articles\/.+\.webp$/);
    expect(result.url).toBe(`https://cdn.example.test/${put.Key}`);

    const meta = await sharp(put.Body).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(1600);
    // WebP at q80 of a flat image is dramatically smaller than the source JPEG.
    expect(put.Body.byteLength).toBeLessThan(original.byteLength);
  });

  it('stores srcset renditions beside the main image and reports them', async () => {
    const service = createUploadService(env);
    const result = await service.uploadImage(await largeJpeg(1920, 1280), 'hero.jpg', 'image/jpeg');

    expect(result.width).toBe(1600);
    expect(result.height).toBe(1067);
    expect(result.variants.map((variant) => variant.width)).toEqual([400, 800, 1200]);
    const main = captured[0];
    if (!main) throw new Error('no PutObject captured');
    for (const variant of result.variants) {
      const put = captured.find((candidate) => variant.url.endsWith(candidate.Key));
      if (!put) throw new Error(`variant ${variant.width} not stored`);
      expect(put.Key).toBe(main.Key.replace(/\.webp$/, `.w${variant.width}.webp`));
      expect(put.ContentType).toBe('image/webp');
      expect((await sharp(put.Body).metadata()).width).toBe(variant.width);
    }
  });

  it('makes only the renditions narrower than the image itself', async () => {
    const service = createUploadService(env);
    const result = await service.uploadImage(await largeJpeg(900, 600), 'mid.jpg', 'image/jpeg');
    expect(result.variants.map((variant) => variant.width)).toEqual([400, 800]);
  });

  it('downscales a large PNG to a smaller WebP', async () => {
    const service = createUploadService(env);
    const original = validPngBuffer(2000, 1500);

    await service.uploadImage(original, 'art.png', 'image/png');

    const put = captured[0];
    if (!put) throw new Error('no PutObject captured');
    expect(put.ContentType).toBe('image/webp');
    const meta = await sharp(put.Body).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(1600);
    expect(meta.height).toBe(1200);
  });

  it('does not enlarge a small image (only re-encodes to WebP near original size)', async () => {
    const service = createUploadService(env);
    const original = await largeJpeg(800, 600);

    await service.uploadImage(original, 'small.jpg', 'image/jpeg');

    const put = captured[0];
    if (!put) throw new Error('no PutObject captured');
    expect(put.ContentType).toBe('image/webp');
    const meta = await sharp(put.Body).metadata();
    expect(meta.format).toBe('webp');
    // Dimensions are preserved (never upscaled), not bumped toward 1600.
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(600);
  });

  it('stores an animated GIF as-is, without WebP conversion', async () => {
    const service = createUploadService(env);
    const original = validGifBuffer(800, 600);
    // Precondition: the fixture is a valid GIF the pipeline accepts.
    expect(validateImageBuffer(original, { declaredMime: 'image/gif' }).ok).toBe(true);

    await service.uploadImage(original, 'loop.gif', 'image/gif');

    const put = captured[0];
    if (!put) throw new Error('no PutObject captured');
    expect(put.ContentType).toBe('image/gif');
    expect(put.CacheControl).toBe('public, max-age=31536000, immutable');
    expect(put.Key).toMatch(/\.gif$/);
    // The stored bytes are byte-for-byte the original GIF (no re-encode).
    expect(Buffer.compare(put.Body, original)).toBe(0);
  });

  it('rejects a structurally invalid image before any S3 write', async () => {
    const service = createUploadService(env);
    await expect(
      service.uploadImage(Buffer.from('<html></html>'), 'page.png', 'image/png'),
    ).rejects.toThrow(/Rejected image upload/i);
    expect(captured).toHaveLength(0);
  });
});

describe('createUploadService.addRenditions (backfill of older uploads)', () => {
  beforeEach(() => {
    captured.length = 0;
    bucket.clear();
  });

  it('stores renditions beside an existing object and reports its size; the object is untouched', async () => {
    const service = createUploadService(env);
    bucket.set(
      'articles/old-hero.webp',
      await sharp(await largeJpeg(1600, 1000))
        .webp()
        .toBuffer(),
    );

    const result = await service.addRenditions('https://cdn.example.test/articles/old-hero.webp');

    expect(result?.width).toBe(1600);
    expect(result?.height).toBe(1000);
    expect(result?.variants.map((variant) => variant.url)).toEqual([
      'https://cdn.example.test/articles/old-hero.w400.webp',
      'https://cdn.example.test/articles/old-hero.w800.webp',
      'https://cdn.example.test/articles/old-hero.w1200.webp',
    ]);
    expect(captured.map((put) => put.Key)).not.toContain('articles/old-hero.webp');
  });

  it('is null for an image that is not on our CDN', async () => {
    const service = createUploadService(env);
    expect(await service.addRenditions('https://elsewhere.example/a.jpg')).toBeNull();
    expect(captured).toHaveLength(0);
  });
});
