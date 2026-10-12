import { describe, expect, it } from 'bun:test';
import { readBodyCapped, RemoteBodyTooLargeError, RemoteBodyTruncatedError } from '../guardedFetch';

const BODY = new Uint8Array(100).fill(7);

describe('readBodyCapped', () => {
  it('returns the body when it matches its declared length', async () => {
    const body = await readBodyCapped(
      new Response(BODY, { headers: { 'content-length': '100' } }),
      1_000,
    );
    expect(body.byteLength).toBe(100);
  });

  it('rejects a body over the cap, declared or streamed', async () => {
    await expect(
      readBodyCapped(new Response(BODY, { headers: { 'content-length': '5000' } }), 1_000),
    ).rejects.toBeInstanceOf(RemoteBodyTooLargeError);
    await expect(readBodyCapped(new Response(BODY), 50)).rejects.toBeInstanceOf(
      RemoteBodyTooLargeError,
    );
  });

  it('rejects an uncompressed body shorter than its declared length', async () => {
    await expect(
      readBodyCapped(new Response(BODY, { headers: { 'content-length': '150' } }), 1_000),
    ).rejects.toBeInstanceOf(RemoteBodyTruncatedError);
  });

  it('does not compare a compressed body against its wire length (fetch already decoded it)', async () => {
    const decoded = new Response(BODY, {
      headers: { 'content-length': '40', 'content-encoding': 'gzip' },
    });
    expect((await readBodyCapped(decoded, 1_000)).byteLength).toBe(100);
  });
});
