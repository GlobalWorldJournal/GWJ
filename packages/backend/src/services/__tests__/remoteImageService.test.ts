import type { LookupAddress } from 'node:dns';
import { describe, expect, it } from 'vitest';
import { fetchRemoteImage } from '../remoteImageService';
import { truncatedPngBuffer, validPngBuffer } from '../../__tests__/imageFixtures';

const PUBLIC_RESOLVER = async (): Promise<LookupAddress[]> => [
  { address: '93.184.216.34', family: 4 },
];
const LOOPBACK_RESOLVER = async (): Promise<LookupAddress[]> => [
  { address: '127.0.0.1', family: 4 },
];
/** Resolves `internal.example` to the instance-metadata address, everything else public. */
const SPLIT_RESOLVER = async (hostname: string): Promise<LookupAddress[]> =>
  hostname === 'internal.example' ? [{ address: '169.254.169.254', family: 4 }] : PUBLIC_RESOLVER();

type FetchInit = Parameters<typeof fetch>[1];
type FetchHandler = (url: string, init?: FetchInit) => Response;

/** A fetch double whose responses are scripted per call; records the URLs it saw. */
function scriptedFetch(handlers: FetchHandler[]): { fetch: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const handler = handlers[urls.length];
    const url = typeof input === 'string' ? input : input.toString();
    urls.push(url);
    if (!handler) throw new Error(`unexpected fetch #${urls.length}: ${url}`);
    return handler(url, init);
  };
  return { fetch: fetchImpl, urls };
}

function imageResponse(bytes: Uint8Array, headers: Record<string, string> = {}): Response {
  return new Response(bytes, { status: 200, headers: { 'content-type': 'image/png', ...headers } });
}

const URL_OK = 'https://cdn.example.com/photos/rig.png';

describe('fetchRemoteImage', () => {
  it('downloads and validates a public image, naming it from the URL', async () => {
    const png = validPngBuffer();
    const { fetch, urls } = scriptedFetch([
      (_url, init) => {
        expect(init?.redirect).toBe('manual');
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        return imageResponse(png, { 'content-length': String(png.byteLength) });
      },
    ]);
    const image = await fetchRemoteImage(URL_OK, undefined, { fetch, resolveDns: PUBLIC_RESOLVER });
    expect(urls).toEqual([URL_OK]);
    expect(image).toMatchObject({ mime: 'image/png', filename: 'rig.png' });
    expect(image.buffer.equals(png)).toBe(true);
  });

  it('refuses an internal host before any request (400)', async () => {
    const { fetch, urls } = scriptedFetch([]);
    await expect(
      fetchRemoteImage(URL_OK, undefined, { fetch, resolveDns: LOOPBACK_RESOLVER }),
    ).rejects.toMatchObject({ status: 400 });
    expect(urls).toEqual([]);
  });

  it('follows a redirect only after re-validating its target', async () => {
    const png = validPngBuffer();
    const ok = scriptedFetch([
      () => new Response(null, { status: 301, headers: { location: '/resized/rig.png' } }),
      () => imageResponse(png),
    ]);
    await fetchRemoteImage(URL_OK, 'hero.png', { fetch: ok.fetch, resolveDns: PUBLIC_RESOLVER });
    expect(ok.urls).toEqual([URL_OK, 'https://cdn.example.com/resized/rig.png']);

    const evil = scriptedFetch([
      () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://internal.example/latest/meta-data' },
        }),
    ]);
    await expect(
      fetchRemoteImage(URL_OK, undefined, { fetch: evil.fetch, resolveDns: SPLIT_RESOLVER }),
    ).rejects.toMatchObject({ status: 400 });
    expect(evil.urls).toEqual([URL_OK]);
  });

  it('gives up after too many redirects', async () => {
    const hop = () => new Response(null, { status: 302, headers: { location: '/again' } });
    const { fetch } = scriptedFetch([hop, hop, hop, hop]);
    await expect(
      fetchRemoteImage(URL_OK, undefined, { fetch, resolveDns: PUBLIC_RESOLVER }),
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/too many redirects/i),
    });
  });

  it('reports an unusable source as 422 with a reason the agent can act on', async () => {
    const cases: [FetchHandler, string][] = [
      [() => new Response('gone', { status: 404 }), 'fetch-failed'],
      [
        () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }),
        'not-image',
      ],
      [
        () => imageResponse(new Uint8Array(8), { 'content-length': String(11 * 1024 * 1024) }),
        'too-large',
      ],
      [() => imageResponse(new Uint8Array(11 * 1024 * 1024)), 'too-large'],
      [
        () =>
          imageResponse(truncatedPngBuffer(), {
            'content-length': String(validPngBuffer().byteLength),
          }),
        'truncated',
      ],
      [() => imageResponse(truncatedPngBuffer()), 'truncated'],
    ];
    for (const [handler, reason] of cases) {
      const { fetch } = scriptedFetch([handler]);
      await expect(
        fetchRemoteImage(URL_OK, undefined, { fetch, resolveDns: PUBLIC_RESOLVER }),
      ).rejects.toMatchObject({
        status: 422,
        details: { reason },
      });
    }
  });

  it('reports a source that never answers as a 422 timeout', async () => {
    // What fetch rejects with when its AbortSignal.timeout() fires.
    const hanging: typeof fetch = async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    };
    await expect(
      fetchRemoteImage(URL_OK, undefined, { fetch: hanging, resolveDns: PUBLIC_RESOLVER }),
    ).rejects.toMatchObject({ status: 422, details: { reason: 'timeout' } });
  });
});
