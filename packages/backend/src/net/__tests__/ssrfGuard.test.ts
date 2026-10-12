import type { LookupAddress } from 'node:dns';
import { describe, expect, it } from 'bun:test';
import { assertSafeRemoteUrl, isUnsafeAddress, SsrfError } from '../ssrfGuard';

/** Build an injectable resolver that always returns the given addresses. */
function resolverFor(...addresses: string[]): (hostname: string) => Promise<LookupAddress[]> {
  return async () =>
    addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
}

describe('isUnsafeAddress', () => {
  it.each([
    '127.0.0.1',
    '127.10.20.30',
    '10.0.0.5',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // AWS/GCP metadata endpoint
    '0.0.0.0',
    '::1',
    '::',
    'fe80::1', // link-local
    'fc00::1', // unique-local
    'fd12:3456::1', // unique-local
    '::ffff:127.0.0.1', // IPv4-mapped loopback
    '::ffff:169.254.169.254', // IPv4-mapped metadata
    '100.64.0.1', // CGNAT shared address space
    '100.127.255.255', // CGNAT upper bound
  ])('flags %s as unsafe', (address) => {
    expect(isUnsafeAddress(address)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34', // example.com
    '172.15.0.1', // just outside the 172.16/12 private block
    '172.32.0.1', // just outside the 172.16/12 private block
    '2606:4700:4700::1111', // public IPv6 (Cloudflare)
  ])('allows public address %s', (address) => {
    expect(isUnsafeAddress(address)).toBe(false);
  });

  it('fails closed on an unrecognized address format', () => {
    expect(isUnsafeAddress('not-an-ip')).toBe(true);
  });
});

describe('assertSafeRemoteUrl', () => {
  it('passes for an https url resolving to a public IP', async () => {
    const url = await assertSafeRemoteUrl('https://cdn.example.com/a.jpg', {
      resolve: resolverFor('93.184.216.34'),
    });
    expect(url.hostname).toBe('cdn.example.com');
  });

  it('rejects a loopback resolution', async () => {
    await expect(
      assertSafeRemoteUrl('https://evil.example.com/a.jpg', { resolve: resolverFor('127.0.0.1') }),
    ).rejects.toBeInstanceOf(SsrfError);
  });

  it('rejects the cloud metadata IP', async () => {
    await expect(
      assertSafeRemoteUrl('https://evil.example.com/a.jpg', {
        resolve: resolverFor('169.254.169.254'),
      }),
    ).rejects.toBeInstanceOf(SsrfError);
  });

  it('rejects a private IP', async () => {
    await expect(
      assertSafeRemoteUrl('https://evil.example.com/a.jpg', { resolve: resolverFor('10.1.2.3') }),
    ).rejects.toBeInstanceOf(SsrfError);
  });

  it('rejects an IPv6 link-local resolution', async () => {
    await expect(
      assertSafeRemoteUrl('https://evil.example.com/a.jpg', { resolve: resolverFor('fe80::1') }),
    ).rejects.toBeInstanceOf(SsrfError);
  });

  it('rejects when ANY of multiple resolved addresses is unsafe', async () => {
    await expect(
      assertSafeRemoteUrl('https://evil.example.com/a.jpg', {
        resolve: resolverFor('93.184.216.34', '127.0.0.1'),
      }),
    ).rejects.toBeInstanceOf(SsrfError);
  });

  it('rejects a non-https scheme without resolving', async () => {
    await expect(
      assertSafeRemoteUrl('http://example.com/a.jpg', {
        resolve: async () => {
          throw new Error('resolve should not be called for non-https');
        },
      }),
    ).rejects.toBeInstanceOf(SsrfError);
  });

  it('rejects a file: scheme', async () => {
    await expect(
      assertSafeRemoteUrl('file:///etc/passwd', { resolve: resolverFor('8.8.8.8') }),
    ).rejects.toBeInstanceOf(SsrfError);
  });

  it('rejects a malformed URL', async () => {
    await expect(
      assertSafeRemoteUrl('not a url', { resolve: resolverFor('8.8.8.8') }),
    ).rejects.toBeInstanceOf(SsrfError);
  });

  it('rejects a host that resolves to nothing', async () => {
    await expect(
      assertSafeRemoteUrl('https://void.example.com/a.jpg', { resolve: resolverFor() }),
    ).rejects.toBeInstanceOf(SsrfError);
  });

  it('rejects when DNS lookup throws', async () => {
    await expect(
      assertSafeRemoteUrl('https://void.example.com/a.jpg', {
        resolve: async () => {
          throw new Error('ENOTFOUND');
        },
      }),
    ).rejects.toBeInstanceOf(SsrfError);
  });
});
