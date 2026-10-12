import { describe, expect, it } from 'bun:test';
import { hashPassword, verifyPassword } from '../password';

const FAST_COST = 4;

/**
 * Hashes written by bcryptjs (`bcrypt.hash(password, 4)`), the library this
 * module replaced: every hash already stored must keep verifying.
 */
const BCRYPTJS_HASHES = {
  short: {
    password: 'correct horse battery staple',
    hash: '$2a$04$OZ6ctgzcNzAFN9UwIGYS7uNKoDbC9mIygn3cdmqkoCXFs.P0tRDxO',
  },
  exactly72Bytes: {
    password: 'b'.repeat(72),
    hash: '$2a$04$hL3ggH4rn/Esnv6UqrKvW.SuJQXumfp1f1Z0FCC1.V8MwZ6V7tiq2',
  },
  // 98 UTF-8 bytes; byte 72 is the first half of an "é".
  over72Bytes: {
    password: `${'a'.repeat(71)}éé tail ignored by bcrypt`,
    hash: '$2a$04$up6RxSdSwBT8uQQlZo7c2OtYElSSh1bvkz5jjSr88alt/S.to9Sfm',
  },
};

describe('password hashing', () => {
  it('verifies hashes written by bcryptjs', async () => {
    for (const { password, hash } of Object.values(BCRYPTJS_HASHES)) {
      expect(await verifyPassword(password, hash)).toBe(true);
      expect(await verifyPassword('wrong password', hash)).toBe(false);
    }
  });

  it('reads only the first 72 bytes of a long password, as bcryptjs does', async () => {
    const { hash } = BCRYPTJS_HASHES.over72Bytes;
    expect(await verifyPassword(`${'a'.repeat(71)}é something else`, hash)).toBe(true);
    expect(await verifyPassword('a'.repeat(71), hash)).toBe(false);
  });

  it('round-trips its own hashes at the requested cost', async () => {
    const hash = await hashPassword('s3cret', FAST_COST);
    expect(hash).toMatch(/^\$2b\$04\$/);
    expect(await verifyPassword('s3cret', hash)).toBe(true);
    expect(await verifyPassword('s3cret!', hash)).toBe(false);
  });

  it('hashes at cost 12 by default', async () => {
    expect(await hashPassword('s3cret')).toMatch(/^\$2b\$12\$/);
  });
});
