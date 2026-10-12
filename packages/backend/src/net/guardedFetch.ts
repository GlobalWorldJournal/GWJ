import { assertSafeRemoteUrl, SsrfError, type AssertSafeRemoteUrlOptions } from './ssrfGuard';

/** `fetch`'s call signature alone, so an injected double needs nothing else. */
export type FetchFn = (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>;

/** Thrown when a remote body exceeds its byte cap (declared or actually streamed). */
export class RemoteBodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Remote response exceeds the ${maxBytes}-byte limit`);
    this.name = 'RemoteBodyTooLargeError';
  }
}

/** Thrown when fewer bytes arrive than the server's Content-Length promised. */
export class RemoteBodyTruncatedError extends Error {
  constructor(received: number, declared: number) {
    super(`Truncated download: received ${received} bytes but Content-Length declared ${declared}`);
    this.name = 'RemoteBodyTruncatedError';
  }
}

export interface GuardedGetOptions {
  /** `Accept` header for the request. */
  accept: string;
  /** Abort the WHOLE request (all hops) after this long. */
  timeoutMs: number;
  /** Redirect hops to follow, each re-validated by the SSRF guard. */
  maxRedirects: number;
  /** Injectable fetch (tests); defaults to global fetch. */
  fetch?: FetchFn;
  /** Injectable DNS resolver for the SSRF guard (tests). */
  resolveDns?: AssertSafeRemoteUrlOptions['resolve'];
}

/**
 * GET a URL on a host we do not control. Every hop — the original URL and each
 * redirect target — passes the SSRF guard before any egress; redirects are never
 * auto-followed (a 3xx to an internal host would bypass the guard). The returned
 * response's body is still bound to the timeout, so read it before it fires.
 */
export async function guardedGet(url: string, options: GuardedGetOptions): Promise<Response> {
  const fetchImpl = options.fetch ?? fetch;
  const signal = AbortSignal.timeout(options.timeoutMs);
  let current = url;
  for (let hop = 0; ; hop += 1) {
    const safeUrl = await assertSafeRemoteUrl(current, { resolve: options.resolveDns });
    const response = await fetchImpl(safeUrl.toString(), {
      method: 'GET',
      redirect: 'manual',
      headers: { accept: options.accept },
      signal,
    });
    if (response.status < 300 || response.status >= 400) return response;
    if (hop >= options.maxRedirects) throw new SsrfError(`Too many redirects fetching ${url}`);
    const location = response.headers.get('location');
    if (!location) throw new SsrfError('Redirect without a Location header');
    current = new URL(location, safeUrl).toString();
  }
}

/**
 * Read a response body, refusing more than `maxBytes` — checked against the
 * declared Content-Length up front AND while streaming, so a server that lies
 * about (or omits) its length cannot make us buffer an unbounded body. An
 * uncompressed body shorter than its declared length is rejected as truncated.
 */
export async function readBodyCapped(response: Response, maxBytes: number): Promise<Buffer> {
  const declaredHeader = response.headers.get('content-length');
  const declared = declaredHeader === null ? null : Number(declaredHeader);
  if (declared !== null && Number.isFinite(declared) && declared > maxBytes) {
    throw new RemoteBodyTooLargeError(maxBytes);
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        throw new RemoteBodyTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  }

  // Content-Length counts the bytes on the wire; fetch transparently decodes a
  // compressed body, so the comparison only holds for an uncompressed one.
  const encoding = response.headers.get('content-encoding');
  const uncompressed = encoding === null || encoding.toLowerCase() === 'identity';
  if (uncompressed && declared !== null && Number.isFinite(declared) && received !== declared) {
    throw new RemoteBodyTruncatedError(received, declared);
  }
  return Buffer.concat(chunks);
}
