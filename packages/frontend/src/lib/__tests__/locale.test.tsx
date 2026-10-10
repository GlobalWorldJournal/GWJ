import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { localePrefix } from '@gwj/shared-types';
import {
  localizePath,
  localeFromPath,
  stripLocale,
  isPrefixedLocale,
  PREFIXED_LOCALES,
  LocaleLink,
  useLocalizedTo,
} from '../locale';

describe('locale path helpers', () => {
  it('exposes the non-default editions as prefixed locales', () => {
    expect([...PREFIXED_LOCALES]).toEqual(['es', 'fr']);
    expect(isPrefixedLocale('es')).toBe(true);
    expect(isPrefixedLocale('fr')).toBe(true);
    expect(isPrefixedLocale('en')).toBe(false);
    expect(isPrefixedLocale('de')).toBe(false);
  });

  it('maps editions to their path prefix (English = none)', () => {
    expect(localePrefix('en')).toBe('');
    expect(localePrefix('es')).toBe('/es');
    expect(localePrefix('fr')).toBe('/fr');
  });

  it('localizes site paths under the active edition', () => {
    expect(localizePath('en', '/article/x')).toBe('/article/x');
    expect(localizePath('es', '/article/x')).toBe('/es/article/x');
    expect(localizePath('fr', '/world')).toBe('/fr/world');
    // Root maps to the edition root, not a trailing-slash variant.
    expect(localizePath('es', '/')).toBe('/es');
    expect(localizePath('en', '/')).toBe('/');
    // Query/hash are preserved verbatim as part of the path string.
    expect(localizePath('es', '/search?q=a#b')).toBe('/es/search?q=a#b');
    // Non-site targets are returned untouched.
    expect(localizePath('es', 'mailto:x@y.com')).toBe('mailto:x@y.com');
    expect(localizePath('es', 'https://example.com')).toBe('https://example.com');
  });

  it('reads the edition from a pathname', () => {
    expect(localeFromPath('/')).toBe('en');
    expect(localeFromPath('/world')).toBe('en');
    expect(localeFromPath('/es')).toBe('es');
    expect(localeFromPath('/es/article/x')).toBe('es');
    expect(localeFromPath('/fr/search')).toBe('fr');
    // An unknown locale-shaped segment is NOT an edition.
    expect(localeFromPath('/de/article/x')).toBe('en');
  });

  it('strips the edition prefix to the edition-relative path', () => {
    expect(stripLocale('/es/article/x')).toBe('/article/x');
    expect(stripLocale('/fr')).toBe('/');
    expect(stripLocale('/world')).toBe('/world');
    expect(stripLocale('/')).toBe('/');
  });
});

function ToProbe({ to }: { to: string }) {
  return <span data-testid="resolved">{useLocalizedTo(to)}</span>;
}

describe('LocaleLink / useLocalizedTo', () => {
  it('prefixes links with the active edition from the URL', () => {
    render(
      <MemoryRouter initialEntries={['/es/world']}>
        <Routes>
          <Route path="/es/world" element={<LocaleLink to="/article/x">link</LocaleLink>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'link' }).getAttribute('href')).toBe('/es/article/x');
  });

  it('leaves links unprefixed in the English (root) edition', () => {
    render(
      <MemoryRouter initialEntries={['/world']}>
        <Routes>
          <Route path="/world" element={<LocaleLink to="/article/x">link</LocaleLink>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'link' }).getAttribute('href')).toBe('/article/x');
  });

  it('useLocalizedTo resolves under the active edition', () => {
    render(
      <MemoryRouter initialEntries={['/fr/search']}>
        <Routes>
          <Route path="/fr/search" element={<ToProbe to="/contact" />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('resolved').textContent).toBe('/fr/contact');
  });
});
