import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import { isIPv4, isIPv6 } from 'node:net';

/**
 * SSRF guard for every request the backend makes to a host it does not control:
 * federation (any Mastodon instance) and image ingestion (`upload/from-url`).
 *
 * Such hosts are arbitrary PUBLIC hosts by nature, but a request must NEVER reach
 * internal infrastructure. We require https, then resolve the host and reject if
 * ANY resolved address points at a loopback, private, link-local, or unique-local
 * range — classified at the byte level so tricks like `::ffff:127.0.0.1` or
 * `0x7f.0.0.1` cannot slip through. Redirects are never auto-followed: callers use
 * `guardedGet` (`./guardedFetch`), which re-validates every hop.
 */

/** Thrown when a remote URL fails the SSRF safety checks. */
export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

/** Parse a dotted-quad IPv4 string into its four octets, or null if invalid. */
function parseIPv4(address: string): [number, number, number, number] | null {
  if (!isIPv4(address)) return null;
  const parts = address.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 0];
}

/** True when an IPv4 address is loopback, private, link-local, or unspecified. */
function isUnsafeIPv4(octets: [number, number, number, number]): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8 (includes unspecified)
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  return false;
}

/**
 * Expand an IPv6 address (possibly with `::` compression or an embedded IPv4
 * tail) into its 16 bytes. Returns null if it cannot be parsed.
 */
function expandIPv6(address: string): number[] | null {
  if (!isIPv6(address)) return null;
  const zoneless = address.split('%')[0] ?? address;

  let head = zoneless;
  let tail = '';
  if (zoneless.includes('::')) {
    const [left = '', right = ''] = zoneless.split('::');
    head = left;
    tail = right;
  }

  const toGroups = (segment: string): number[] | null => {
    if (segment === '') return [];
    const groups: number[] = [];
    for (const part of segment.split(':')) {
      if (part.includes('.')) {
        const v4 = parseIPv4(part);
        if (!v4) return null;
        groups.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
      } else {
        const value = Number.parseInt(part, 16);
        if (!Number.isInteger(value) || value < 0 || value > 0xffff) return null;
        groups.push(value);
      }
    }
    return groups;
  };

  const headGroups = toGroups(head);
  const tailGroups = toGroups(tail);
  if (!headGroups || !tailGroups) return null;

  const missing = 8 - (headGroups.length + tailGroups.length);
  const groups = zoneless.includes('::')
    ? [...headGroups, ...Array<number>(Math.max(missing, 0)).fill(0), ...tailGroups]
    : headGroups;
  if (groups.length !== 8) return null;

  const bytes: number[] = [];
  for (const group of groups) {
    bytes.push((group >> 8) & 0xff, group & 0xff);
  }
  return bytes;
}

/** True when an IPv6 address is loopback, unspecified, link-local, or unique-local. */
function isUnsafeIPv6(address: string): boolean {
  const bytes = expandIPv6(address);
  if (!bytes) return true; // unparseable → treat as unsafe

  const allZero = bytes.every((b) => b === 0);
  if (allZero) return true; // :: unspecified

  if (bytes.slice(0, 15).every((b) => b === 0) && bytes[15] === 1) return true; // ::1 loopback

  const first = bytes[0] ?? 0;
  const second = bytes[1] ?? 0;

  if ((first & 0xfe) === 0xfc) return true; // fc00::/7 unique-local
  if (first === 0xfe && (second & 0xc0) === 0x80) return true; // fe80::/10 link-local

  const isV4Mapped =
    bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  if (isV4Mapped) {
    const v4: [number, number, number, number] = [
      bytes[12] ?? 0,
      bytes[13] ?? 0,
      bytes[14] ?? 0,
      bytes[15] ?? 0,
    ];
    return isUnsafeIPv4(v4);
  }

  return false;
}

/** True when a resolved address is in a blocked range and must not be reached. */
export function isUnsafeAddress(address: string): boolean {
  const v4 = parseIPv4(address);
  if (v4) return isUnsafeIPv4(v4);
  if (isIPv6(address)) return isUnsafeIPv6(address);
  return true; // unrecognized format → fail closed
}

export interface AssertSafeRemoteUrlOptions {
  /** Injectable DNS resolver for testing; defaults to node:dns/promises lookup. */
  resolve?: (hostname: string) => Promise<LookupAddress[]>;
}

/**
 * Validate a remote URL against SSRF: require https, resolve the host, reject if
 * ANY resolved address points at internal infrastructure. Returns the parsed URL
 * on success; throws SsrfError otherwise.
 */
export async function assertSafeRemoteUrl(
  raw: string,
  options: AssertSafeRemoteUrlOptions = {},
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError('Invalid URL');
  }

  if (url.protocol !== 'https:') {
    throw new SsrfError(`Only https URLs are allowed (got ${url.protocol})`);
  }

  const resolve = options.resolve ?? ((hostname: string) => lookup(hostname, { all: true }));
  let addresses: LookupAddress[];
  try {
    addresses = await resolve(url.hostname);
  } catch {
    throw new SsrfError(`Could not resolve host ${url.hostname}`);
  }

  if (addresses.length === 0) {
    throw new SsrfError(`Host ${url.hostname} did not resolve to any address`);
  }

  for (const { address } of addresses) {
    if (isUnsafeAddress(address)) {
      throw new SsrfError(`Host ${url.hostname} resolves to a blocked address (${address})`);
    }
  }

  return url;
}
