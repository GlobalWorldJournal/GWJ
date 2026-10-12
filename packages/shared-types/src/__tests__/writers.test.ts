import { describe, expect, it } from 'bun:test';
import {
  authorSlug,
  fediUsername,
  findWriterByFediUsername,
  findWriterByName,
  writerAvatarPath,
  WRITERS,
} from '../writers';

describe('fediUsername', () => {
  it('produces a bare lowercase [a-z0-9] handle for the required cases', () => {
    expect(fediUsername('Eleanor Vance')).toBe('eleanorvance');
    expect(fediUsername('Ji-ho Park')).toBe('jihopark');
    expect(fediUsername('J. P. Sutherland')).toBe('jpsutherland');
    expect(fediUsername('Lucía Ferrer')).toBe('luciaferrer');
    expect(fediUsername('Margaret Holloway')).toBe('margaretholloway');
  });

  it('strips every non-alphanumeric (spaces, hyphens, dots, accents)', () => {
    expect(fediUsername('Sofia Marchetti')).toBe('sofiamarchetti');
    expect(fediUsername('Yuki Tanaka')).toBe('yukitanaka');
    expect(fediUsername('Amara Diallo')).toBe('amaradiallo');
    expect(fediUsername(fediUsername('Eleanor Vance'))).toBe('eleanorvance'); // idempotent on a clean token
  });

  it('every roster writer yields a unique, non-empty fedi username', () => {
    const seen = new Set<string>();
    for (const writer of WRITERS) {
      const username = fediUsername(writer.name);
      expect(username).toMatch(/^[a-z0-9]+$/);
      expect(seen.has(username)).toBe(false);
      seen.add(username);
    }
    expect(seen.size).toBe(WRITERS.length);
  });
});

describe('writerAvatarPath', () => {
  it('is a CDN-relative path keyed by the fedi username', () => {
    expect(writerAvatarPath('Eleanor Vance')).toBe('writers/eleanorvance.png');
    expect(writerAvatarPath('J. P. Sutherland')).toBe('writers/jpsutherland.png');
  });
});

describe('writer lookups', () => {
  it('finds a writer by exact display name and by fedi username', () => {
    expect(findWriterByName('Eleanor Vance')?.name).toBe('Eleanor Vance');
    expect(findWriterByFediUsername('eleanorvance')?.name).toBe('Eleanor Vance');
    expect(findWriterByName('Not A Writer')).toBeUndefined();
    expect(findWriterByFediUsername('nobody')).toBeUndefined();
  });

  it('authorSlug stays the hyphenated WEB slug (distinct from fediUsername)', () => {
    expect(authorSlug('Eleanor Vance')).toBe('eleanor-vance');
    expect(fediUsername('Eleanor Vance')).toBe('eleanorvance');
  });
});
