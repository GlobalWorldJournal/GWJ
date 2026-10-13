import { describe, expect, it } from 'vitest';
import { CATEGORIES, SUPPORTED_LANGUAGES, WRITERS } from '@gwj/shared-types';
import { DICT, hasWriterTitle, subtopics, translate, writerTitle } from '../dictionary';

describe('dictionary', () => {
  it('has every English key in every edition, filled and with the same placeholders', () => {
    const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(Object.keys(DICT[lang]).sort()).toEqual(Object.keys(DICT.en).sort());
      for (const [key, value] of Object.entries(DICT[lang])) {
        expect(value.trim(), `${lang}.${key}`).not.toBe('');
        expect(placeholders(value), `${lang}.${key}`).toEqual(placeholders(DICT.en[key as never]));
      }
    }
  });

  it('translates outside React, filling placeholders and falling back to the key', () => {
    expect(translate('fr', 'search')).toBe('Rechercher');
    expect(translate('es', 'copyright', { x: '2026' })).toContain('Todos los derechos reservados');
    expect(translate('en', 'no-such-key')).toBe('no-such-key');
  });

  it('translates every roster writer title and every section sub-topic', () => {
    for (const writer of WRITERS) {
      expect(hasWriterTitle(writer.title), writer.title).toBe(true);
      expect(writerTitle(writer.title, 'en')).toBe(writer.title);
      expect(writerTitle(writer.title, 'es')).not.toBe(writer.title);
      expect(writerTitle(writer.title, 'fr')).not.toBe(writer.title);
    }
    for (const category of CATEGORIES) {
      const english = subtopics(category, 'en');
      expect(subtopics(category, 'es')).toHaveLength(english.length);
      expect(subtopics(category, 'fr')).toHaveLength(english.length);
    }
  });
});
