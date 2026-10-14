import { describe, expect, it } from 'bun:test';
import { newRecordId } from '../../db/ids';
import { signNewsletterToken, verifyNewsletterToken } from '../newsletterToken';

const SECRET = 'test-secret';

describe('newsletter tokens', () => {
  const id = newRecordId();

  it('round-trips the subscriber id for its purpose', () => {
    const token = signNewsletterToken(SECRET, 'confirm', id);
    expect(verifyNewsletterToken(SECRET, 'confirm', token)).toBe(id);
  });

  it('does not let a confirmation link unsubscribe, or the reverse', () => {
    expect(
      verifyNewsletterToken(SECRET, 'unsubscribe', signNewsletterToken(SECRET, 'confirm', id)),
    ).toBeNull();
    expect(
      verifyNewsletterToken(SECRET, 'confirm', signNewsletterToken(SECRET, 'unsubscribe', id)),
    ).toBeNull();
  });

  it('rejects another secret, a tampered id and malformed input', () => {
    const token = signNewsletterToken(SECRET, 'unsubscribe', id);
    expect(verifyNewsletterToken('other-secret', 'unsubscribe', token)).toBeNull();
    const mac = token.split('.')[1] ?? '';
    expect(verifyNewsletterToken(SECRET, 'unsubscribe', `${newRecordId()}.${mac}`)).toBeNull();
    for (const bad of ['', 'x', `${id}.`, `${id}.abc`, `${id}.${mac}.extra`, `nothex.${mac}`]) {
      expect(verifyNewsletterToken(SECRET, 'unsubscribe', bad)).toBeNull();
    }
  });
});
