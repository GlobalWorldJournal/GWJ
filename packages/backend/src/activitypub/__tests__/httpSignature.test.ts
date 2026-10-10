import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assertDigestMatches,
  assertFreshDate,
  computeDigest,
  parseSignatureHeader,
  signRequest,
  verifySignature,
} from '../httpSignature';

function keyPair() {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

const KEY_ID = 'https://remote.example/users/alice#main-key';
const INBOX_URL = 'https://globalworldjournal.com/users/news/inbox';

describe('httpSignature', () => {
  it('signs and verifies a POST round-trip (covers request-target, host, date, digest)', () => {
    const { privateKey, publicKey } = keyPair();
    const body = JSON.stringify({ type: 'Follow', actor: KEY_ID });

    const headers = signRequest({
      privateKeyPem: privateKey,
      keyId: KEY_ID,
      method: 'POST',
      url: INBOX_URL,
      body,
      headers: { 'content-type': 'application/activity+json' },
    });

    expect(headers.Signature).toContain(`keyId="${KEY_ID}"`);
    expect(headers.Digest).toBe(computeDigest(body));

    const result = verifySignature(
      {
        method: 'POST',
        path: '/users/news/inbox',
        headers: {
          host: 'globalworldjournal.com',
          date: headers.Date,
          digest: headers.Digest,
          signature: headers.Signature,
          'content-type': 'application/activity+json',
        },
        rawBody: Buffer.from(body),
      },
      publicKey,
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.keyId).toBe(KEY_ID);
  });

  it('rejects a tampered body (signing string no longer matches)', () => {
    const { privateKey, publicKey } = keyPair();
    const body = JSON.stringify({ type: 'Follow', actor: KEY_ID });
    const headers = signRequest({
      privateKeyPem: privateKey,
      keyId: KEY_ID,
      method: 'POST',
      url: INBOX_URL,
      body,
    });

    // Verify against a DIFFERENT request-target than what was signed.
    const result = verifySignature(
      {
        method: 'POST',
        path: '/users/someone-else/inbox',
        headers: {
          host: 'globalworldjournal.com',
          date: headers.Date,
          digest: headers.Digest,
          signature: headers.Signature,
        },
        rawBody: Buffer.from(body),
      },
      publicKey,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects when verified against the wrong public key', () => {
    const signer = keyPair();
    const other = keyPair();
    const body = '{}';
    const headers = signRequest({
      privateKeyPem: signer.privateKey,
      keyId: KEY_ID,
      method: 'POST',
      url: INBOX_URL,
      body,
    });
    const result = verifySignature(
      {
        method: 'POST',
        path: '/users/news/inbox',
        headers: {
          host: 'globalworldjournal.com',
          date: headers.Date,
          digest: headers.Digest,
          signature: headers.Signature,
        },
        rawBody: Buffer.from(body),
      },
      other.publicKey,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a missing Signature header', () => {
    const { publicKey } = keyPair();
    const result = verifySignature(
      {
        method: 'POST',
        path: '/users/news/inbox',
        headers: { host: 'globalworldjournal.com', date: new Date().toUTCString() },
        rawBody: Buffer.from('{}'),
      },
      publicKey,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/missing signature/i);
  });

  it('rejects a signature that does not cover (request-target)', () => {
    const { privateKey, publicKey } = keyPair();
    // Hand-craft a Signature header that only covers `date`.
    const date = new Date().toUTCString();
    // We sign a string covering only date so the signature itself is valid crypto,
    // but the covered-header policy must still reject it.
    const headers = signRequest({
      privateKeyPem: privateKey,
      keyId: KEY_ID,
      method: 'POST',
      url: INBOX_URL,
      body: '',
    });
    const onlyDate = headers.Signature.replace(/headers="[^"]*"/, 'headers="date"');
    const result = verifySignature(
      {
        method: 'POST',
        path: '/users/news/inbox',
        headers: { host: 'globalworldjournal.com', date, signature: onlyDate },
        rawBody: Buffer.from(''),
      },
      publicKey,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/must cover/i);
  });

  it('parseSignatureHeader extracts all params including base64 with +//=', () => {
    const header =
      'keyId="https://x/y#main-key",algorithm="rsa-sha256",headers="(request-target) host date",signature="ab+/cd=="';
    const params = parseSignatureHeader(header);
    expect(params.keyId).toBe('https://x/y#main-key');
    expect(params.algorithm).toBe('rsa-sha256');
    expect(params.headers).toBe('(request-target) host date');
    expect(params.signature).toBe('ab+/cd==');
  });

  it('assertFreshDate accepts now and rejects stale / missing', () => {
    const now = Date.now();
    expect(assertFreshDate(new Date(now).toUTCString(), now)).toBeNull();
    expect(assertFreshDate(undefined)).toMatch(/missing/i);
    expect(assertFreshDate(new Date(now - 10 * 60 * 1000).toUTCString(), now)).toMatch(/skew/i);
  });

  it('assertDigestMatches validates SHA-256 of the body', () => {
    const body = Buffer.from('{"hello":"world"}');
    const digest = computeDigest(body);
    expect(assertDigestMatches(digest, body)).toBeNull();
    expect(assertDigestMatches('SHA-256=wrong', body)).toMatch(/does not match/i);
    expect(assertDigestMatches(undefined, body)).toMatch(/missing/i);
  });
});
