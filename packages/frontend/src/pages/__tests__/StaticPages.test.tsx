import { describe, expect, it, vi } from 'vitest';
import { getDefaultNormalizer, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentType } from 'react';
import type { Language } from '@gwj/shared-types';
import { LanguageProvider } from '../../lib/i18n';
import { AboutUs } from '../static/AboutUs';
import { Accessibility } from '../static/Accessibility';
import { Advertise } from '../static/Advertise';
import { Careers } from '../static/Careers';
import { ContactUs } from '../static/ContactUs';
import { CookieNotice } from '../static/CookieNotice';
import { Corrections } from '../static/Corrections';
import { CustomerCenter } from '../static/CustomerCenter';
import { Newsletters } from '../static/Newsletters';
import { Podcasts } from '../static/Podcasts';
import { PrivacyNotice } from '../static/PrivacyNotice';
import { ReportContent } from '../static/ReportContent';
import { RssFeeds } from '../static/RssFeeds';
import { Subscribe } from '../static/Subscribe';
import { TermsOfUse } from '../static/TermsOfUse';
import { Video } from '../static/Video';
import { ABOUT_US } from '../static/content/aboutUs';
import { ACCESSIBILITY } from '../static/content/accessibility';
import { ADVERTISE } from '../static/content/advertise';
import { CAREERS } from '../static/content/careers';
import { CONTACT_US } from '../static/content/contactUs';
import { COOKIE_NOTICE } from '../static/content/cookieNotice';
import { CORRECTIONS } from '../static/content/corrections';
import { CUSTOMER_CENTER } from '../static/content/customerCenter';
import { ENGLISH_PREVAILS } from '../static/content/legal';
import { NEWSLETTERS } from '../static/content/newsletters';
import { PODCASTS } from '../static/content/podcasts';
import { PRIVACY_NOTICE } from '../static/content/privacyNotice';
import { REPORT_CONTENT } from '../static/content/reportContent';
import { RSS_FEEDS } from '../static/content/rssFeeds';
import { SUBSCRIBE } from '../static/content/subscribe';
import { TERMS_OF_USE } from '../static/content/termsOfUse';
import { VIDEO } from '../static/content/video';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api');
  return { ...actual, submitTakedownRequest: vi.fn() };
});

const EDITION_ROOT: Record<Language, string> = { en: '/', es: '/es', fr: '/fr' };

function renderPage(Page: ComponentType, lang: Language, path = '/') {
  const entry = lang === 'en' ? path : `${EDITION_ROOT[lang]}${path}`;
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[entry]}>
        <LanguageProvider lang={lang}>
          <Page />
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Match text exactly, keeping non-breaking spaces (the default normalizer folds them). */
const EXACT_SPACES = { normalizer: getDefaultNormalizer({ collapseWhitespace: false }) };

function heading() {
  return screen.getByRole('heading', { level: 1 }).textContent;
}

/** Every static page with its title in each edition. */
const PAGES: readonly [string, ComponentType, Record<Language, string>][] = [
  ['AboutUs', AboutUs, { en: 'About Us', es: 'Quiénes somos', fr: 'À propos' }],
  [
    'Accessibility',
    Accessibility,
    { en: 'Accessibility', es: 'Accesibilidad', fr: 'Accessibilité' },
  ],
  ['Advertise', Advertise, { en: 'Advertise', es: 'Anúnciate', fr: 'Publicité' }],
  ['Careers', Careers, { en: 'Careers', es: 'Empleo', fr: 'Carrières' }],
  ['ContactUs', ContactUs, { en: 'Contact Us', es: 'Contáctanos', fr: 'Nous contacter' }],
  [
    'CookieNotice',
    CookieNotice,
    { en: 'Cookie Notice', es: 'Aviso de cookies', fr: 'Politique relative aux cookies' },
  ],
  ['Corrections', Corrections, { en: 'Corrections', es: 'Correcciones', fr: 'Corrections' }],
  [
    'CustomerCenter',
    CustomerCenter,
    { en: 'Customer Center', es: 'Centro de atención', fr: 'Centre d’assistance' },
  ],
  ['Newsletters', Newsletters, { en: 'Telegram', es: 'Telegram', fr: 'Telegram' }],
  ['Podcasts', Podcasts, { en: 'Podcasts', es: 'Pódcasts', fr: 'Podcasts' }],
  [
    'PrivacyNotice',
    PrivacyNotice,
    { en: 'Privacy Notice', es: 'Aviso de privacidad', fr: 'Politique de confidentialité' },
  ],
  [
    'ReportContent',
    ReportContent,
    { en: 'Report Content', es: 'Denunciar contenido', fr: 'Signaler un contenu' },
  ],
  ['RssFeeds', RssFeeds, { en: 'RSS Feeds', es: 'Fuentes RSS', fr: 'Flux RSS' }],
  ['Subscribe', Subscribe, { en: 'Follow Us', es: 'Síguenos', fr: 'Nous suivre' }],
  [
    'TermsOfUse',
    TermsOfUse,
    { en: 'Terms of Use', es: 'Términos de uso', fr: 'Conditions d’utilisation' },
  ],
  ['Video', Video, { en: 'Video', es: 'Vídeo', fr: 'Vidéo' }],
];

describe('static pages render in the active edition', () => {
  for (const [name, Page, titles] of PAGES) {
    for (const lang of ['en', 'es', 'fr'] as const) {
      it(`${name} (${lang}) has its translated title`, () => {
        renderPage(Page, lang);
        expect(heading()).toBe(titles[lang]);
      });
    }
  }
});

describe('About Us', () => {
  it('keeps the English text unchanged', () => {
    renderPage(AboutUs, 'en');
    expect(screen.getByRole('heading', { level: 2, name: 'What we cover' })).toBeTruthy();
    expect(
      screen.getByText(/^Our newsroom is AI-assisted and human-led\. We use modern tools/),
    ).toBeTruthy();
  });

  it('renders Spanish and French prose', () => {
    renderPage(AboutUs, 'es');
    expect(screen.getByRole('heading', { level: 2, name: 'Cómo trabajamos' })).toBeTruthy();
    expect(screen.queryByText(/AI-assisted/)).toBeNull();
  });
});

describe('Privacy Notice (legal)', () => {
  it('keeps the English text, contact address and revision date, with no translation notice', () => {
    const { container } = renderPage(PrivacyNotice, 'en');
    expect(screen.getByRole('heading', { level: 2, name: 'Your rights' })).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'privacy@globalworldjournal.com' }).getAttribute('href'),
    ).toBe('mailto:privacy@globalworldjournal.com');
    expect(screen.getByText('Last updated: June 2026')).toBeTruthy();
    expect(container.textContent).not.toMatch(/prevalecerá|prévaut/);
  });

  it('closes the Spanish version with the English-prevails sentence before the revision date', () => {
    renderPage(PrivacyNotice, 'es');
    expect(screen.getByRole('heading', { level: 2, name: 'Tus derechos' })).toBeTruthy();
    const prevails = screen.getByText(/prevalecerá la versión original en inglés/);
    const updated = screen.getByText('Última actualización: junio de 2026');
    expect(prevails.nextElementSibling).toBe(updated);
  });

  it('uses French typography in the French version', () => {
    renderPage(PrivacyNotice, 'fr');
    expect(screen.getByText(/la version originale en anglais prévaut/)).toBeTruthy();
    expect(screen.getByText('Dernière mise à jour\u00a0: juin 2026', EXACT_SPACES)).toBeTruthy();
  });

  it('adds the English-prevails sentence to every translated legal page', () => {
    for (const Page of [PrivacyNotice, CookieNotice, TermsOfUse]) {
      const es = renderPage(Page, 'es');
      expect(es.container.textContent).toMatch(/prevalecerá la versión original en inglés\./);
      es.unmount();
      const fr = renderPage(Page, 'fr');
      expect(fr.container.textContent).toMatch(/la version originale en anglais prévaut\./);
      fr.unmount();
    }
  });
});

describe('internal links stay in the reader’s edition', () => {
  it('links Customer Center to the Contact page of each edition', () => {
    renderPage(CustomerCenter, 'en');
    expect(screen.getByRole('link', { name: 'Contact Us' }).getAttribute('href')).toBe('/contact');
  });

  it('keeps the /es prefix', () => {
    renderPage(CustomerCenter, 'es', '/customer-center');
    expect(screen.getByRole('link', { name: 'Contáctanos' }).getAttribute('href')).toBe(
      '/es/contact',
    );
  });

  it('keeps the /fr prefix', () => {
    renderPage(Newsletters, 'fr', '/newsletters');
    expect(screen.getByRole('link', { name: 'Nous suivre' }).getAttribute('href')).toBe(
      '/fr/subscribe',
    );
    expect(screen.getByRole('link', { name: 'Suivez-nous sur Telegram' })).toBeTruthy();
  });

  it('points each edition at its own RSS feed', () => {
    const en = renderPage(RssFeeds, 'en');
    expect(screen.getByRole('link', { name: '/feed.xml' }).getAttribute('href')).toBe('/feed.xml');
    en.unmount();
    renderPage(RssFeeds, 'es', '/rss');
    expect(screen.getByRole('link', { name: '/es/feed.xml' }).getAttribute('href')).toBe(
      '/es/feed.xml',
    );
  });
});

describe('Report Content form', () => {
  it('keeps the English labels and button', () => {
    renderPage(ReportContent, 'en');
    expect(screen.getByLabelText('Your name')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Submit Report' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Other' })).toBeTruthy();
  });

  it('translates the labels, choices and button into Spanish', () => {
    renderPage(ReportContent, 'es');
    expect(screen.getByLabelText('Tu nombre')).toBeTruthy();
    expect(screen.getByLabelText('Tu correo electrónico (para poder responderte)')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Otro motivo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enviar denuncia' })).toBeDisabled();
    expect(screen.getByPlaceholderText('https://globalworldjournal.com/es/article/…')).toBeTruthy();
  });

  it('translates the labels, choices and button into French', () => {
    const { container } = renderPage(ReportContent, 'fr');
    expect(screen.getByLabelText('Votre nom')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Envoyer le signalement' })).toBeTruthy();
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    if (form) {
      expect(
        within(form).getByText('Que souhaitez-vous signaler\u00a0?', EXACT_SPACES),
      ).toBeTruthy();
      expect(form.textContent).not.toMatch(/Submit Report|Your name/);
    }
  });
});

const ALL_CONTENT = [
  ABOUT_US,
  ACCESSIBILITY,
  ADVERTISE,
  CAREERS,
  CONTACT_US,
  COOKIE_NOTICE,
  CORRECTIONS,
  CUSTOMER_CENTER,
  NEWSLETTERS,
  PODCASTS,
  PRIVACY_NOTICE,
  REPORT_CONTENT,
  RSS_FEEDS,
  SUBSCRIBE,
  TERMS_OF_USE,
  VIDEO,
];

/** Every string reachable from a content value (titles, prose, labels, link text). */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(strings);
  return [];
}

describe('translation typography', () => {
  it('uses non-breaking spaces before French double punctuation and inside guillemets', () => {
    const french = [...ALL_CONTENT.flatMap((content) => strings(content.fr)), ENGLISH_PREVAILS.fr];
    for (const text of french) {
      expect(text, text).not.toMatch(/ [;:!?»]|« /);
      expect(text, text).not.toMatch(/[^\u00a0][;!?»]|«[^\u00a0]/);
      // A colon needs the space too, except inside a URL scheme (`https://`).
      expect(text, text).not.toMatch(/[^\u00a0]:(?!\/\/)/);
      expect(text, text).not.toMatch(/'/);
    }
  });

  it('opens every Spanish question and exclamation', () => {
    const spanish = [...ALL_CONTENT.flatMap((content) => strings(content.es)), ENGLISH_PREVAILS.es];
    for (const text of spanish) {
      expect(text.split('¿').length, text).toBe(text.split('?').length);
      expect(text.split('¡').length, text).toBe(text.split('!').length);
    }
  });
});
