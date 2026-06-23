/**
 * Image optimization: downscale oversized photos and re-encode to WebP so the
 * site ships small, modern images instead of multi-megabyte source JPEGs/PNGs.
 *
 * This is the single shared implementation used by BOTH the upload service
 * (`uploadService.ts`, applied to every future upload) and the one-off backfill
 * script (`scripts/optimize-existing-images.ts`, applied to images already
 * live). Keeping one implementation guarantees the backfilled images match what
 * the pipeline will produce going forward.
 *
 * Policy:
 *   - Longest edge is capped at {@link MAX_LONGEST_EDGE}px; smaller images are
 *     never upscaled (`withoutEnlargement`).
 *   - Output is WebP at {@link WEBP_QUALITY} quality.
 *   - Animated GIFs are NOT converted (flattening would drop the animation);
 *     callers detect the GIF format up-front and store the original bytes.
 *
 * The caller is responsible for validating the bytes (structure + dimensions +
 * type) BEFORE optimizing — this module only transforms bytes it is given.
 */
import sharp from 'sharp'

/** Longest edge (px) an optimized image may have. Matches the audit's display sizes. */
export const MAX_LONGEST_EDGE = 1600

/** WebP encode quality (0–100). 80 is the standard quality/size sweet spot. */
export const WEBP_QUALITY = 80

/** Canonical MIME type for the WebP output this module produces. */
export const WEBP_MIME = 'image/webp'

/** Decoded properties of an image buffer, as read by sharp. */
export interface ImageMetadata {
  /** sharp's format string (e.g. `'webp'`, `'jpeg'`, `'png'`, `'gif'`). */
  format: string
  /** Width in pixels (0 if sharp could not determine it). */
  width: number
  /** Height in pixels (0 if sharp could not determine it). */
  height: number
  /** Longest edge in pixels — `max(width, height)`. */
  longestEdge: number
}

/**
 * Read an image's format and dimensions using sharp — the SAME engine that
 * produces the optimized output. Callers MUST use this (not an external decoder)
 * to decide whether an image already meets the optimization target, otherwise a
 * one-pixel disagreement between decoders makes a backfill non-idempotent
 * (re-optimizing already-optimized images forever). Throws if sharp cannot
 * decode the bytes.
 */
export async function readImageMetadata(input: Buffer): Promise<ImageMetadata> {
  const meta = await sharp(input).metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  return {
    format: meta.format ?? '',
    width,
    height,
    longestEdge: Math.max(width, height),
  }
}

/** Outcome of optimizing an image buffer. */
export interface OptimizedImage {
  /** The optimized WebP bytes. */
  buffer: Buffer
  /** Output width in pixels (after any downscale). */
  width: number
  /** Output height in pixels. */
  height: number
}

/**
 * Downscale `input` so its longest edge is at most {@link MAX_LONGEST_EDGE}px
 * (never enlarging) and re-encode it as WebP at {@link WEBP_QUALITY}.
 *
 * `sharp` reads the format from the bytes, so PNG/JPEG/WebP inputs all work.
 * Throws if the bytes cannot be decoded by sharp — the caller decides how to
 * recover (the upload service falls back to storing the original validated
 * bytes; the backfill script skips the image).
 *
 * Animated GIFs must NOT be passed here: WebP re-encoding would flatten them to
 * a single frame. Use {@link isAnimatableGif}/format detection to route GIFs to
 * a pass-through path instead.
 */
export async function optimizeToWebp(input: Buffer): Promise<OptimizedImage> {
  const pipeline = sharp(input, { failOn: 'error' }).rotate().resize({
    width: MAX_LONGEST_EDGE,
    height: MAX_LONGEST_EDGE,
    fit: 'inside',
    withoutEnlargement: true,
  })
  const { data, info } = await pipeline
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true })
  return { buffer: data, width: info.width, height: info.height }
}
