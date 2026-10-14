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
 *     callers detect the GIF format up-front and run {@link stripMetadata}
 *     instead of the full re-encode.
 *
 * Every source image here comes from an outlet we don't control — its EXIF can
 * carry the photographer's GPS coordinates, camera serial number and editing
 * software, none of which belongs on GWJ's own copy. The WebP re-encode path
 * already drops all of that for free: sharp's own default is `keepMetadata: 0`
 * (confirmed by reading sharp's own source, `dist/output.cjs` — `withMetadata`/
 * `keepMetadata` are opt-in calls this module never makes), so nothing here
 * needs to ask for stripping on that path. The two paths that bypass the
 * re-encode — an animated GIF (flattening would drop the animation) and a
 * sharp-processing failure on an otherwise-valid image — used to fall back to
 * the ORIGINAL bytes verbatim, carrying whatever metadata the source had
 * straight through to GWJ's own CDN. {@link stripMetadata} covers both: same
 * format, same pixels, no re-encode to WebP, just the metadata gone.
 *
 * The caller is responsible for validating the bytes (structure + dimensions +
 * type) BEFORE optimizing — this module only transforms bytes it is given.
 */
import sharp from 'sharp';
import type { ImageFormat } from '@gwj/shared-types/image-validation';

/** Longest edge (px) an optimized image may have. Matches the audit's display sizes. */
export const MAX_LONGEST_EDGE = 1600;

/** WebP encode quality (0–100). 80 is the standard quality/size sweet spot. */
export const WEBP_QUALITY = 80;

/** Canonical MIME type for the WebP output this module produces. */
export const WEBP_MIME = 'image/webp';

/** Decoded properties of an image buffer, as read by sharp. */
export interface ImageMetadata {
  /** sharp's format string (e.g. `'webp'`, `'jpeg'`, `'png'`, `'gif'`). */
  format: string;
  /** Width in pixels (0 if sharp could not determine it). */
  width: number;
  /** Height in pixels (0 if sharp could not determine it). */
  height: number;
  /** Longest edge in pixels — `max(width, height)`. */
  longestEdge: number;
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
  const meta = await sharp(input).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  return {
    format: meta.format ?? '',
    width,
    height,
    longestEdge: Math.max(width, height),
  };
}

/**
 * Narrower renditions made beside the main image, for `srcset`: a phone or a
 * card thumbnail downloads one of these instead of the full-size image. Only
 * widths below the main image's are made (never an enlargement).
 */
export const VARIANT_WIDTHS = [400, 800, 1200] as const;

/** Outcome of optimizing an image buffer. */
export interface OptimizedImage {
  /** The optimized WebP bytes. */
  buffer: Buffer;
  /** Output width in pixels (after any downscale). */
  width: number;
  /** Output height in pixels. */
  height: number;
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
  });
  const { data, info } = await pipeline
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

/** The main WebP rendition of an image and its narrower {@link VARIANT_WIDTHS}. */
export interface OptimizedImageSet {
  main: OptimizedImage;
  variants: OptimizedImage[];
}

/**
 * {@link optimizeToWebp}, plus a WebP rendition at each {@link VARIANT_WIDTHS}
 * width narrower than the main image — each made from the source, not from the
 * already-compressed main image. Same input rules and failures as
 * {@link optimizeToWebp}.
 */
export async function optimizeWithVariants(input: Buffer): Promise<OptimizedImageSet> {
  const main = await optimizeToWebp(input);
  const variants = await Promise.all(
    VARIANT_WIDTHS.filter((width) => width < main.width).map(async (width) => {
      const { data, info } = await sharp(input, { failOn: 'error' })
        .rotate()
        .resize({ width })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer({ resolveWithObject: true });
      return { buffer: data, width: info.width, height: info.height };
    }),
  );
  return { main, variants };
}

/**
 * Re-encode `input` in its OWN format, same pixels, no resize, no WebP
 * conversion — every metadata field still drops, since sharp's `keepMetadata:
 * 0` default applies here exactly as it does in {@link optimizeToWebp}. For
 * the two cases that can't take the WebP path: an animated GIF (`animated:
 * true` keeps every frame — the WebP path would otherwise flatten it to one),
 * and a plain re-encode as the caller's last attempt before giving up and
 * storing the original bytes untouched — a narrower operation than resize +
 * format conversion, so it can succeed where {@link optimizeToWebp} failed.
 */
export async function stripMetadata(input: Buffer, format: ImageFormat): Promise<Buffer> {
  if (format === 'gif') {
    return sharp(input, { animated: true, failOn: 'error' }).gif().toBuffer();
  }
  const pipeline = sharp(input, { failOn: 'error' }).rotate();
  switch (format) {
    case 'jpeg':
      return pipeline.jpeg().toBuffer();
    case 'png':
      return pipeline.png().toBuffer();
    case 'webp':
      return pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
  }
}
