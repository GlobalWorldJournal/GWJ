/**
 * Structural image validation — shared by the backend upload service, the MCP
 * client's remote-image fetch, and the audit script.
 *
 * The goal is to reject images that are corrupt, truncated, or simply not the
 * type they claim to be BEFORE they are stored to S3 or saved on an article.
 * Magic bytes alone are NOT sufficient: a PNG can carry a valid signature and a
 * valid-looking IHDR length while the IDAT chunk is truncated and the IEND chunk
 * is missing (the exact corruption that shipped broken hero images). So for each
 * format we verify the bytes are STRUCTURALLY COMPLETE:
 *
 *   - PNG : signature, IHDR with a correct CRC, every chunk fits inside the
 *           buffer with a correct CRC, the concatenated IDAT zlib stream
 *           actually decompresses, and an IEND chunk terminates the file.
 *   - JPEG: SOI marker `FFD8` at the start, a SOFn frame whose dimensions we can
 *           read, and the EOI marker `FFD9` at the very end.
 *   - WEBP: `RIFF....WEBP` with the declared RIFF chunk size present in the
 *           buffer, plus VP8/VP8L/VP8X dimensions.
 *   - GIF : `GIF87a`/`GIF89a` header, a readable logical-screen size, and the
 *           trailer byte `0x3B` at the end.
 *
 * This module is Node/Bun-only (it uses `node:zlib` to verify the PNG stream).
 * It is intentionally NOT re-exported from the package barrel so browser bundles
 * never pull `node:zlib` into their dependency graph; consumers import it from
 * the `@gwj/shared-types/image-validation` subpath.
 */
import { inflateSync } from 'node:zlib';

/** Image formats GWJ accepts for hero/body images. */
export const SUPPORTED_IMAGE_FORMATS = ['png', 'jpeg', 'webp', 'gif'] as const;
export type ImageFormat = (typeof SUPPORTED_IMAGE_FORMATS)[number];

/** Map a detected format to its canonical MIME type. */
export const IMAGE_FORMAT_MIME: Record<ImageFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

/**
 * Minimum WIDTH in pixels for a usable hero image. Narrower images are almost
 * always tracking pixels, icons, or scaled-down thumbnails that look broken at
 * article scale.
 */
export const MIN_IMAGE_WIDTH = 600;

/**
 * Minimum HEIGHT in pixels. Lower than the width floor so a standard 16:9
 * landscape hero (e.g. 800x450 wire photo) is accepted, while degenerate
 * slivers and tiny thumbnails are still rejected.
 */
export const MIN_IMAGE_HEIGHT = 400;

/**
 * Back-compat alias: the single "minimum dimension" knob now maps to the width
 * floor (the dimension the product rule is stated in terms of).
 * @deprecated Prefer {@link MIN_IMAGE_WIDTH} / {@link MIN_IMAGE_HEIGHT}.
 */
export const MIN_IMAGE_DIMENSION = MIN_IMAGE_WIDTH;

/** Maximum image size in bytes accepted across the pipeline (10 MB). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Why an image was rejected. */
export type ImageRejectionReason =
  | 'empty'
  | 'too-large'
  | 'unknown-format'
  | 'mime-mismatch'
  | 'truncated'
  | 'corrupt'
  | 'undecodable-dimensions'
  | 'too-small'
  | 'wrong-aspect-ratio';

/** Result of validating an image buffer. */
export type ImageValidationResult =
  | {
      ok: true;
      format: ImageFormat;
      mime: string;
      width: number;
      height: number;
      byteLength: number;
    }
  | { ok: false; reason: ImageRejectionReason; message: string };

interface DecodedImage {
  format: ImageFormat;
  width: number;
  height: number;
}

/** Options for {@link validateImageBuffer}. */
export interface ValidateImageOptions {
  /**
   * If provided, the detected format's MIME must match this declared MIME. Used
   * to ensure the client/multer-reported content type is truthful (e.g. a `.png`
   * upload must actually be a PNG). When omitted, only structural validity and
   * dimensions are checked.
   */
  declaredMime?: string;
  /** Override the minimum width in pixels. Defaults to {@link MIN_IMAGE_WIDTH}. */
  minWidth?: number;
  /** Override the minimum height in pixels. Defaults to {@link MIN_IMAGE_HEIGHT}. */
  minHeight?: number;
  /** Override the maximum byte size. Defaults to {@link MAX_IMAGE_BYTES}. */
  maxBytes?: number;
  /**
   * If provided, the image's width:height ratio must be within `tolerance` of
   * `width:height` (a fraction of the target ratio; defaults to
   * {@link DEFAULT_ASPECT_RATIO_TOLERANCE}). Unlike the width/height floor, this
   * catches an upload that's merely the right SIZE but the wrong SHAPE — e.g. a
   * square logo dropped into a 728×90 leaderboard slot, which a `cover`/`contain`
   * fit would otherwise crop heavily or letterbox rather than reject outright.
   */
  aspectRatio?: { width: number; height: number; tolerance?: number };
}

/**
 * Default tolerance for {@link ValidateImageOptions.aspectRatio}: how far the
 * uploaded image's ratio may drift from the target before it's rejected, as a
 * fraction of the target ratio. Generous enough that a slightly-off crop still
 * passes, tight enough to catch a genuinely mismatched shape (e.g. a square
 * image offered for an 8:1 banner slot).
 */
const DEFAULT_ASPECT_RATIO_TOLERANCE = 0.15;

/** Normalize a declared MIME (e.g. `image/jpg`, `image/x-png`) to a canonical form. */
function normalizeDeclaredMime(mime: string): string {
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  switch (base) {
    case 'image/jpg':
      return 'image/jpeg';
    case 'image/x-png':
      return 'image/png';
    default:
      return base;
  }
}

/**
 * Validate that `bytes` is a complete, decodable image of a supported format and
 * meets the size/dimension constraints. Returns a discriminated result rather
 * than throwing, so callers can map it to their own error shape (HTTP 422, an
 * MCP error, an audit verdict).
 */
export function validateImageBuffer(
  bytes: Uint8Array,
  options: ValidateImageOptions = {},
): ImageValidationResult {
  const minWidth = options.minWidth ?? MIN_IMAGE_WIDTH;
  const minHeight = options.minHeight ?? MIN_IMAGE_HEIGHT;
  const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES;

  if (bytes.byteLength === 0) {
    return { ok: false, reason: 'empty', message: 'Image is empty (0 bytes)' };
  }
  if (bytes.byteLength > maxBytes) {
    return {
      ok: false,
      reason: 'too-large',
      message: `Image is ${bytes.byteLength} bytes, exceeding the ${maxBytes}-byte limit`,
    };
  }

  const format = detectFormat(bytes);
  if (!format) {
    return {
      ok: false,
      reason: 'unknown-format',
      message: 'Bytes are not a recognized PNG, JPEG, WEBP, or GIF image',
    };
  }

  const mime = IMAGE_FORMAT_MIME[format];
  if (options.declaredMime !== undefined) {
    const declared = normalizeDeclaredMime(options.declaredMime);
    if (declared !== mime) {
      return {
        ok: false,
        reason: 'mime-mismatch',
        message: `Declared content type "${options.declaredMime}" does not match the actual image format (${mime})`,
      };
    }
  }

  let decoded: DecodedImage | ImageValidationResult;
  switch (format) {
    case 'png':
      decoded = decodePng(bytes);
      break;
    case 'jpeg':
      decoded = decodeJpeg(bytes);
      break;
    case 'webp':
      decoded = decodeWebp(bytes);
      break;
    case 'gif':
      decoded = decodeGif(bytes);
      break;
  }
  if ('ok' in decoded) return decoded;

  if (decoded.width <= 0 || decoded.height <= 0) {
    return {
      ok: false,
      reason: 'undecodable-dimensions',
      message: 'Image dimensions could not be read',
    };
  }
  if (decoded.width < minWidth || decoded.height < minHeight) {
    return {
      ok: false,
      reason: 'too-small',
      message: `Image is ${decoded.width}x${decoded.height}px; minimum is ${minWidth}x${minHeight}px (width x height)`,
    };
  }

  if (options.aspectRatio) {
    const { width: targetWidth, height: targetHeight } = options.aspectRatio;
    const tolerance = options.aspectRatio.tolerance ?? DEFAULT_ASPECT_RATIO_TOLERANCE;
    const targetRatio = targetWidth / targetHeight;
    const actualRatio = decoded.width / decoded.height;
    if (Math.abs(actualRatio - targetRatio) / targetRatio > tolerance) {
      return {
        ok: false,
        reason: 'wrong-aspect-ratio',
        message: `Image is ${decoded.width}x${decoded.height}px (ratio ${actualRatio.toFixed(2)}:1); this slot needs about ${targetRatio.toFixed(2)}:1 (e.g. ${targetWidth}x${targetHeight}px)`,
      };
    }
  }

  return {
    ok: true,
    format,
    mime,
    width: decoded.width,
    height: decoded.height,
    byteLength: bytes.byteLength,
  };
}

/** Detect the image format purely from magic bytes (no structural guarantee). */
function detectFormat(bytes: Uint8Array): ImageFormat | null {
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return 'webp';
  }
  if (
    bytes.byteLength >= 6 &&
    bytes[0] === 0x47 && // G
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x38 && // 8
    (bytes[4] === 0x37 || bytes[4] === 0x39) && // 7 | 9
    bytes[5] === 0x61 // a
  ) {
    return 'gif';
  }
  return null;
}

const PNG_SIGNATURE_LENGTH = 8;
const PNG_CHUNK_HEADER_LENGTH = 8; // 4-byte length + 4-byte type
const PNG_CHUNK_CRC_LENGTH = 4;

/**
 * Fully walk the PNG chunk structure: every chunk must fit inside the buffer
 * with a correct CRC, IHDR must come first, the IDAT zlib stream must actually
 * decompress, and an IEND chunk must terminate the file. This is what catches a
 * truncated PNG whose IDAT length runs past the end of the buffer (the shipped
 * bug) as well as bit-rot that corrupts a chunk's CRC.
 */
function decodePng(bytes: Uint8Array): DecodedImage | ImageValidationResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = PNG_SIGNATURE_LENGTH;
  let width = 0;
  let height = 0;
  let sawIhdr = false;
  let sawIend = false;
  const idatParts: Uint8Array[] = [];

  while (offset + PNG_CHUNK_HEADER_LENGTH <= bytes.byteLength) {
    const length = view.getUint32(offset);
    const typeStart = offset + 4;
    const dataStart = offset + PNG_CHUNK_HEADER_LENGTH;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + PNG_CHUNK_CRC_LENGTH;

    // The chunk's data + CRC must lie entirely within the buffer. A truncated
    // PNG declares a chunk length that runs past the end of the file.
    if (crcEnd > bytes.byteLength) {
      return {
        ok: false,
        reason: 'truncated',
        message: `PNG chunk at offset ${offset} declares ${length} bytes but the file ends early (truncated)`,
      };
    }

    const type = String.fromCharCode(
      bytes[typeStart] ?? 0,
      bytes[typeStart + 1] ?? 0,
      bytes[typeStart + 2] ?? 0,
      bytes[typeStart + 3] ?? 0,
    );

    const declaredCrc = view.getUint32(dataEnd);
    const actualCrc = crc32(bytes.subarray(typeStart, dataEnd));
    if (declaredCrc !== actualCrc) {
      return {
        ok: false,
        reason: 'corrupt',
        message: `PNG chunk "${type}" at offset ${offset} has a bad CRC (declared ${declaredCrc}, computed ${actualCrc})`,
      };
    }

    if (type === 'IHDR') {
      if (length < 13) {
        return { ok: false, reason: 'corrupt', message: 'PNG IHDR chunk is too short' };
      }
      width = view.getUint32(dataStart);
      height = view.getUint32(dataStart + 4);
      sawIhdr = true;
    } else if (type === 'IDAT') {
      idatParts.push(bytes.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      sawIend = true;
      offset = crcEnd;
      break;
    }

    offset = crcEnd;
  }

  if (!sawIhdr) {
    return { ok: false, reason: 'corrupt', message: 'PNG is missing its IHDR header chunk' };
  }
  if (!sawIend) {
    return {
      ok: false,
      reason: 'truncated',
      message: 'PNG is missing its IEND terminator chunk (truncated)',
    };
  }
  if (idatParts.length === 0) {
    return { ok: false, reason: 'corrupt', message: 'PNG has no IDAT image-data chunk' };
  }

  // The concatenated IDAT chunks form a single zlib stream; if it does not
  // inflate, the pixel data is corrupt even if the chunk framing looked intact.
  const compressed =
    idatParts.length === 1 && idatParts[0] ? idatParts[0] : concatChunks(idatParts);
  try {
    inflateSync(compressed);
  } catch {
    return {
      ok: false,
      reason: 'corrupt',
      message: 'PNG IDAT zlib stream failed to decompress (corrupt image data)',
    };
  }

  return { format: 'png', width, height };
}

/** Concatenate IDAT chunk slices into one contiguous buffer. */
function concatChunks(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) total += part.byteLength;
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

// JPEG markers.
const JPEG_SOI = 0xd8;
const JPEG_EOI = 0xd9;
const JPEG_SOS = 0xda; // start of scan — entropy-coded data follows, stop scanning markers

/** Set of SOFn markers that carry the frame dimensions. */
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

/**
 * Walk JPEG segments to read the SOFn dimensions, and require the file to end
 * with the EOI marker `FFD9` — a truncated JPEG (download cut short) is missing
 * its EOI even when the SOI/SOFn at the front look fine.
 */
function decodeJpeg(bytes: Uint8Array): DecodedImage | ImageValidationResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Require a trailing EOI marker. (Some encoders pad with trailing bytes after
  // EOI; scan backwards over trailing zero padding to find it.)
  let tail = bytes.byteLength - 1;
  while (tail > 0 && bytes[tail] === 0x00) tail--;
  if (tail < 1 || bytes[tail - 1] !== 0xff || bytes[tail] !== JPEG_EOI) {
    return {
      ok: false,
      reason: 'truncated',
      message: 'JPEG is missing its EOI (FFD9) end marker (truncated)',
    };
  }

  let width = 0;
  let height = 0;
  let offset = 2; // skip SOI (FFD8)
  while (offset + 4 <= bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      return { ok: false, reason: 'corrupt', message: 'JPEG segment alignment is broken' };
    }
    const marker = bytes[offset + 1] ?? 0;
    // Standalone markers (RSTn, SOI, EOI, TEM) have no length field.
    if (marker === JPEG_SOI || marker === JPEG_EOI || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === JPEG_SOS) {
      // Entropy-coded data begins; dimensions (if present) are already read.
      break;
    }
    const segmentLength = view.getUint16(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.byteLength) {
      return {
        ok: false,
        reason: 'truncated',
        message: 'JPEG segment length runs past the end of the file (truncated)',
      };
    }
    if (JPEG_SOF_MARKERS.has(marker)) {
      // SOFn payload: [precision(1)][height(2)][width(2)]...
      height = view.getUint16(offset + 5);
      width = view.getUint16(offset + 7);
    }
    offset += 2 + segmentLength;
  }

  if (width === 0 || height === 0) {
    return {
      ok: false,
      reason: 'undecodable-dimensions',
      message: 'JPEG SOFn frame dimensions could not be read',
    };
  }
  return { format: 'jpeg', width, height };
}

/**
 * Validate the WEBP RIFF container: the declared RIFF chunk size must fit in the
 * buffer (catches truncation), and the VP8/VP8L/VP8X sub-chunk yields the
 * canvas dimensions.
 */
function decodeWebp(bytes: Uint8Array): DecodedImage | ImageValidationResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // RIFF size is the byte count AFTER the 8-byte RIFF header.
  const riffSize = view.getUint32(4, true);
  if (riffSize + 8 > bytes.byteLength) {
    return {
      ok: false,
      reason: 'truncated',
      message: 'WEBP RIFF size runs past the end of the file (truncated)',
    };
  }
  if (bytes.byteLength < 30) {
    return { ok: false, reason: 'truncated', message: 'WEBP file is too short to contain a frame' };
  }

  const format = String.fromCharCode(
    bytes[12] ?? 0,
    bytes[13] ?? 0,
    bytes[14] ?? 0,
    bytes[15] ?? 0,
  );
  let width = 0;
  let height = 0;
  if (format === 'VP8 ') {
    // Lossy: frame header at offset 20 has 14-bit width/height (minus 1).
    width = (view.getUint16(26, true) & 0x3fff) + 1;
    height = (view.getUint16(28, true) & 0x3fff) + 1;
  } else if (format === 'VP8L') {
    // Lossless: 1-byte signature (0x2f) then 14-bit width-1 and height-1.
    const bits =
      (bytes[21] ?? 0) |
      ((bytes[22] ?? 0) << 8) |
      ((bytes[23] ?? 0) << 16) |
      ((bytes[24] ?? 0) << 24);
    width = (bits & 0x3fff) + 1;
    height = ((bits >> 14) & 0x3fff) + 1;
  } else if (format === 'VP8X') {
    // Extended: canvas width/height are 24-bit (minus 1) at offset 24.
    width = ((bytes[24] ?? 0) | ((bytes[25] ?? 0) << 8) | ((bytes[26] ?? 0) << 16)) + 1;
    height = ((bytes[27] ?? 0) | ((bytes[28] ?? 0) << 8) | ((bytes[29] ?? 0) << 16)) + 1;
  } else {
    return {
      ok: false,
      reason: 'corrupt',
      message: `WEBP has an unrecognized frame chunk "${format}"`,
    };
  }
  return { format: 'webp', width, height };
}

/** Read the GIF logical-screen size and require the trailer byte `0x3B`. */
function decodeGif(bytes: Uint8Array): DecodedImage | ImageValidationResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);
  // GIF files terminate with a single trailer byte 0x3B.
  if (bytes[bytes.byteLength - 1] !== 0x3b) {
    return {
      ok: false,
      reason: 'truncated',
      message: 'GIF is missing its trailer byte (0x3B) (truncated)',
    };
  }
  return { format: 'gif', width, height };
}

// CRC-32 (ISO 3309 / PNG) with a lazily-built lookup table.
let crcTable: Uint32Array | null = null;

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

/** Compute the PNG CRC-32 of a byte range. */
function crc32(bytes: Uint8Array): number {
  const table = (crcTable ??= buildCrcTable());
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.byteLength; i++) {
    const index = (crc ^ (bytes[i] ?? 0)) & 0xff;
    crc = (crc >>> 8) ^ (table[index] ?? 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
