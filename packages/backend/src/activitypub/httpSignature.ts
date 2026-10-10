import {
  constants as cryptoConstants,
  createHash,
  createSign,
  createVerify,
  timingSafeEqual,
} from 'node:crypto';

/**
 * HTTP Signatures (draft-cavage-http-signatures-12) — the scheme Mastodon and the
 * wider fediverse use to authenticate server-to-server ActivityPub requests.
 *
 * We sign outbound POSTs with the actor's RSA private key and verify inbound POSTs
 * against the sending actor's public key. The signing string is built from an
 * ordered list of "headers", including the synthetic `(request-target)` and the
 * `digest` of the body, exactly as both peers must reconstruct it.
 */

/** Maximum allowed clock skew for the `Date` header on inbound requests (ms). */
export const MAX_DATE_SKEW_MS = 5 * 60 * 1000;

/** RSA-SHA256 is the only algorithm we sign/verify with (fediverse default). */
const SIGNATURE_ALGORITHM = 'rsa-sha256';
const NODE_SIGN_ALGORITHM = 'RSA-SHA256';

/** Compute the `Digest` header value (`SHA-256=<base64>`) for a request body. */
export function computeDigest(body: string | Buffer): string {
  const hash = createHash('sha256').update(body).digest('base64');
  return `SHA-256=${hash}`;
}

/** Constant-time comparison of two digest header values. */
function digestsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Build the canonical signing string from an ordered header list. Each line is
 * `name: value`, lowercase name; `(request-target)` is the pseudo-header
 * `<method> <path>`. Values are read from the provided header map (lowercased keys).
 */
function buildSigningString(headerNames: string[], headers: Record<string, string>): string {
  return headerNames.map((name) => `${name}: ${headers[name] ?? ''}`).join('\n');
}

export interface SignRequestOptions {
  privateKeyPem: string;
  /** The `keyId` advertised in the actor's `publicKey.id`. */
  keyId: string;
  method: string;
  /** Request target URL (absolute); host + path are derived from it. */
  url: string;
  /** Request body (for the Digest header). Empty string for GETs. */
  body?: string;
  /** Extra headers to include in the request and the signature (e.g. content-type). */
  headers?: Record<string, string>;
}

/**
 * A signed request's headers, ready to attach to an outbound fetch. The signature
 * headers (`Host`/`Date`/`Signature`, plus `Digest` for bodies) are always present;
 * any caller-supplied headers are merged alongside.
 */
export interface SignedHeaders extends Record<string, string> {
  Host: string;
  Date: string;
  Signature: string;
}

/**
 * Produce the headers for a signed outbound request: `Host`, `Date`, `Digest`
 * (for bodies), any caller headers, and the `Signature` header itself. The
 * covered headers are `(request-target) host date` plus `digest` when a body is
 * present — the set fediverse servers expect.
 */
export function signRequest(options: SignRequestOptions): SignedHeaders {
  const url = new URL(options.url);
  const method = options.method.toLowerCase();
  const requestTarget = `${method} ${url.pathname}${url.search}`;
  const date = new Date().toUTCString();
  const hasBody = options.body !== undefined && options.body.length > 0;

  const headerValues: Record<string, string> = {
    '(request-target)': requestTarget,
    host: url.host,
    date,
  };
  if (hasBody) headerValues.digest = computeDigest(options.body ?? '');

  // Fold in caller-supplied headers (lowercased) so they can also be covered.
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    headerValues[name.toLowerCase()] = value;
  }

  const coveredHeaders = hasBody
    ? ['(request-target)', 'host', 'date', 'digest']
    : ['(request-target)', 'host', 'date'];

  const signingString = buildSigningString(coveredHeaders, headerValues);
  const signer = createSign(NODE_SIGN_ALGORITHM);
  signer.update(signingString);
  signer.end();
  const signature = signer.sign(
    { key: options.privateKeyPem, padding: cryptoConstants.RSA_PKCS1_PADDING },
    'base64',
  );

  const signatureHeader =
    `keyId="${options.keyId}",` +
    `algorithm="${SIGNATURE_ALGORITHM}",` +
    `headers="${coveredHeaders.join(' ')}",` +
    `signature="${signature}"`;

  const outbound: SignedHeaders = {
    Host: url.host,
    Date: date,
    Signature: signatureHeader,
    ...Object.fromEntries(Object.entries(options.headers ?? {})),
  };
  if (hasBody) outbound.Digest = headerValues.digest ?? '';
  return outbound;
}

/** Parse a `Signature` header into its comma-separated `key="value"` parameters. */
export function parseSignatureHeader(header: string): Record<string, string> {
  const params: Record<string, string> = {};
  // Match key="value" pairs; values may contain commas/spaces (e.g. base64, header lists).
  const regex = /([a-zA-Z]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(header)) !== null) {
    const key = match[1];
    const value = match[2];
    if (key !== undefined && value !== undefined) params[key] = value;
  }
  return params;
}

/** Outcome of verifying an inbound signed request. */
export type VerificationResult = { ok: true; keyId: string } | { ok: false; reason: string };

export interface VerifyRequestInput {
  method: string;
  /** Request path including query string (the proxied path on this backend). */
  path: string;
  /** Inbound request headers (case-insensitive map; we lowercase keys here). */
  headers: Record<string, string | string[] | undefined>;
  /** Raw request body bytes (for Digest verification). */
  rawBody: Buffer;
  /**
   * The host the remote actor signed against — the public APEX domain, NOT the
   * proxied `Host` header (Cloudflare rewrites `Host` to this backend's origin when
   * it forwards). When the signature covers `host`, the signing string must use
   * this value, and we additionally require the inbound `host` header (the original
   * apex host the worker forwards) to match it.
   */
  expectedHost?: string;
}

/** Normalize a header map to lowercase keys with single string values. */
function lowerHeaders(headers: VerifyRequestInput['headers']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    out[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }
  return out;
}

/**
 * Verify the cryptographic signature of an inbound request against a remote
 * actor's public key. Assumes the caller has already located the public key from
 * the `keyId` (by fetching the remote actor) and validated freshness via
 * {@link assertFreshDate} / {@link assertDigestMatches}. Returns a result object
 * rather than throwing so the route can map failures to a 401.
 */
export function verifySignature(
  input: VerifyRequestInput,
  publicKeyPem: string,
): VerificationResult {
  const headers = lowerHeaders(input.headers);
  const signatureHeader = headers.signature;
  if (!signatureHeader) return { ok: false, reason: 'Missing Signature header' };

  const params = parseSignatureHeader(signatureHeader);
  const keyId = params.keyId;
  const signatureB64 = params.signature;
  const headerList = params.headers;
  if (!keyId || !signatureB64 || !headerList) {
    return { ok: false, reason: 'Malformed Signature header' };
  }
  if (params.algorithm && params.algorithm.toLowerCase() !== SIGNATURE_ALGORITHM) {
    return { ok: false, reason: `Unsupported signature algorithm "${params.algorithm}"` };
  }

  const coveredHeaders = headerList.split(' ').filter((h) => h.length > 0);
  // A signature that does not cover (request-target) and date is replayable.
  if (!coveredHeaders.includes('(request-target)') || !coveredHeaders.includes('date')) {
    return { ok: false, reason: 'Signature must cover (request-target) and date' };
  }

  const method = input.method.toLowerCase();
  const requestTarget = `${method} ${input.path}`;
  const values: Record<string, string> = { ...headers, '(request-target)': requestTarget };

  // The request reaches this backend proxied from the apex, so the proxied `Host`
  // header is this origin — NOT what the remote signed. When `host` is covered,
  // verify against the apex host the remote actually signed (and require the
  // forwarded host header to match it), defeating both proxy rewriting and a
  // mismatched-host replay.
  if (input.expectedHost && coveredHeaders.includes('host')) {
    if (headers.host !== input.expectedHost) {
      return { ok: false, reason: 'Host header does not match the expected apex domain' };
    }
    values.host = input.expectedHost;
  }

  const signingString = buildSigningString(coveredHeaders, values);
  const verifier = createVerify(NODE_SIGN_ALGORITHM);
  verifier.update(signingString);
  verifier.end();

  let verified = false;
  try {
    verified = verifier.verify(
      { key: publicKeyPem, padding: cryptoConstants.RSA_PKCS1_PADDING },
      signatureB64,
      'base64',
    );
  } catch {
    // A malformed/incompatible public key fails verification rather than crashing.
    return { ok: false, reason: 'Signature verification error' };
  }

  if (!verified) return { ok: false, reason: 'Invalid signature' };
  return { ok: true, keyId };
}

/** Validate the `Date` header is present and within the allowed skew of now. */
export function assertFreshDate(dateHeader: string | undefined, now = Date.now()): string | null {
  if (!dateHeader) return 'Missing Date header';
  const parsed = Date.parse(dateHeader);
  if (Number.isNaN(parsed)) return 'Unparseable Date header';
  if (Math.abs(now - parsed) > MAX_DATE_SKEW_MS) return 'Date header outside the allowed skew';
  return null;
}

/**
 * Validate the inbound `Digest` header matches the actual body. Required whenever
 * the signature covers `digest` (which it must for POSTs with a body).
 */
export function assertDigestMatches(
  digestHeader: string | undefined,
  rawBody: Buffer,
): string | null {
  if (!digestHeader) return 'Missing Digest header';
  // A peer may send multiple digests (comma-separated); accept if the SHA-256 matches.
  const expected = computeDigest(rawBody);
  const candidates = digestHeader.split(',').map((d) => d.trim());
  const sha256 = candidates.find((d) => d.toLowerCase().startsWith('sha-256='));
  if (!sha256) return 'No SHA-256 digest provided';
  return digestsMatch(sha256, expected) ? null : 'Digest does not match body';
}
