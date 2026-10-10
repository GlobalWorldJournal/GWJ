import { MAX_IMAGE_BYTES, validateImageBuffer } from '@gwj/shared-types/image-validation';
import { BadRequestError, UnprocessableEntityError } from '../errors';
import {
  guardedGet,
  readBodyCapped,
  RemoteBodyTooLargeError,
  RemoteBodyTruncatedError,
} from '../net/guardedFetch';
import { SsrfError, type AssertSafeRemoteUrlOptions } from '../net/ssrfGuard';

/** A slow source must not hold an admin/agent request open indefinitely. */
const REMOTE_IMAGE_TIMEOUT_MS = 20_000;
/** CDNs commonly redirect an og:image once or twice (http→https, a resizer). */
const REMOTE_IMAGE_MAX_REDIRECTS = 3;
const FALLBACK_FILENAME = 'image';

export interface RemoteImageOptions {
  /** Injectable fetch (tests); defaults to global fetch. */
  fetch?: typeof fetch;
  /** Injectable DNS resolver for the SSRF guard (tests). */
  resolveDns?: AssertSafeRemoteUrlOptions['resolve'];
}

export interface RemoteImage {
  buffer: Buffer;
  mime: string;
  filename: string;
}

function filenameFromUrl(url: string): string {
  const last = new URL(url).pathname.split('/').filter(Boolean).pop();
  return last ? decodeURIComponent(last) : FALLBACK_FILENAME;
}

function isTimeout(err: unknown): boolean {
  return err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
}

/**
 * Download an image from a host we do not control and prove it is usable. A
 * forbidden URL (internal host, non-https) is the caller's mistake → 400. A source
 * that fails, is not an image, or is truncated/corrupt/oversized → 422 with the
 * validation `reason`, so an agent can move on to another source.
 */
export async function fetchRemoteImage(
  url: string,
  filename: string | undefined,
  options: RemoteImageOptions = {},
): Promise<RemoteImage> {
  let buffer: Buffer;
  try {
    const response = await guardedGet(url, {
      accept: 'image/*',
      timeoutMs: REMOTE_IMAGE_TIMEOUT_MS,
      maxRedirects: REMOTE_IMAGE_MAX_REDIRECTS,
      fetch: options.fetch,
      resolveDns: options.resolveDns,
    });
    if (!response.ok) {
      throw new UnprocessableEntityError(
        `Source image could not be downloaded (HTTP ${response.status})`,
        {
          reason: 'fetch-failed',
          status: response.status,
        },
      );
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!/^image\//i.test(contentType)) {
      throw new UnprocessableEntityError(
        `Source URL did not return an image (content-type: ${contentType || 'none'})`,
        {
          reason: 'not-image',
        },
      );
    }
    buffer = await readBodyCapped(response, MAX_IMAGE_BYTES);
  } catch (err) {
    if (err instanceof SsrfError)
      throw new BadRequestError(`Image URL not allowed: ${err.message}`);
    if (err instanceof RemoteBodyTooLargeError) {
      throw new UnprocessableEntityError(err.message, { reason: 'too-large' });
    }
    if (err instanceof RemoteBodyTruncatedError) {
      throw new UnprocessableEntityError(err.message, { reason: 'truncated' });
    }
    if (isTimeout(err)) {
      throw new UnprocessableEntityError('Source image download timed out', { reason: 'timeout' });
    }
    throw err;
  }

  const validation = validateImageBuffer(buffer);
  if (!validation.ok) {
    throw new UnprocessableEntityError(`Source image is not usable: ${validation.message}`, {
      reason: validation.reason,
    });
  }
  return { buffer, mime: validation.mime, filename: filename ?? filenameFromUrl(url) };
}
