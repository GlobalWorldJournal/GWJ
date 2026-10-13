import { describe, expect, it } from 'vitest';
import { findWriterBySlug } from '@gwj/shared-types';
import {
  authorMeta,
  categoryMeta,
  homeMeta,
  isStaticPagePath,
  notFoundMeta,
  searchMeta,
  staticMeta,
  tagMeta,
} from '../pageMeta';

describe('page meta', () => {
  it('keeps the English edition exactly as it shipped', () => {
    expect(homeMeta('en').title).toBe(
      'The Global World Journal — World, Business, Markets, Tech, Politics, Opinion, Arts',
    );
    expect(categoryMeta('World', 'en')).toEqual({
      title: 'World — The Global World Journal',
      description: 'The latest World news and analysis from The Global World Journal.',
    });
    expect(searchMeta('en').title).toBe('Search — The Global World Journal');
  });

  it('writes every page in the edition language', () => {
    expect(homeMeta('es').title).toContain('Mundo, Negocios, Mercados');
    expect(categoryMeta('Politics', 'fr').title).toBe('Politique — The Global World Journal');
    expect(searchMeta('es').title).toBe('Buscar — The Global World Journal');
    expect(tagMeta('Gaza', 'fr').title).toBe('Articles sur « Gaza » — The Global World Journal');
    expect(notFoundMeta('es').title).toBe('Página no encontrada — The Global World Journal');
    const writer = findWriterBySlug('eleanor-vance');
    expect(authorMeta(writer, 'es').title).toBe(
      'Eleanor Vance, Corresponsal sénior de mercados — The Global World Journal',
    );
    expect(authorMeta(writer, 'fr').description).toContain('Marchés, Affaires');
    expect(authorMeta(undefined, 'fr').title).toBe('The Global World Journal — Auteur');
  });

  it('names the footer pages in the edition language and ignores other paths', () => {
    expect(staticMeta('/terms', 'fr')?.title).toBe(
      'Conditions d’utilisation — The Global World Journal',
    );
    expect(staticMeta('/advertise/start', 'es')?.title).toBe(
      'Anúnciate — The Global World Journal',
    );
    expect(staticMeta('/world', 'en')).toBeNull();
    expect(isStaticPagePath('/about')).toBe(true);
    expect(isStaticPagePath('/')).toBe(false);
  });
});
