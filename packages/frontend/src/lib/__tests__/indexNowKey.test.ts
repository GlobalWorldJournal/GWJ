import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INDEXNOW_KEY } from '@gwj/shared-types';

describe('IndexNow key file', () => {
  it('is served at /<key>.txt and contains exactly the key', () => {
    const file = resolve(__dirname, '../../../public', `${INDEXNOW_KEY}.txt`);
    expect(readFileSync(file, 'utf8')).toBe(INDEXNOW_KEY);
  });
});
