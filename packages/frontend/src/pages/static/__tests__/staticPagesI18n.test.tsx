import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import type { Language } from '@gwj/shared-types';
import type { ReactElement } from 'react';
import { renderPage } from '../../advertise/__tests__/testing';
import { Podcasts } from '../Podcasts';
import { ReportContent } from '../ReportContent';
import { REPORT_COPY } from '../ReportContent.copy';
import { RssFeeds } from '../RssFeeds';
import { Subscribe } from '../Subscribe';
import { Video } from '../Video';

const TRANSLATED: readonly Language[] = ['es', 'fr'];

interface PageCase {
  name: string;
  element: ReactElement;
  heading: Record<Language, string>;
}

const CASES: readonly PageCase[] = [
  {
    name: 'Podcasts',
    element: <Podcasts />,
    heading: { en: 'Podcasts', es: 'Pódcast', fr: 'Podcasts' },
  },
  {
    name: 'RssFeeds',
    element: <RssFeeds />,
    heading: { en: 'RSS Feeds', es: 'Canales RSS', fr: 'Flux RSS' },
  },
  {
    name: 'Subscribe',
    element: <Subscribe />,
    heading: { en: 'Follow Us', es: 'Síganos', fr: 'Suivez-nous' },
  },
  {
    name: 'Video',
    element: <Video />,
    heading: { en: 'Video', es: 'Video', fr: 'Vidéo' },
  },
  {
    name: 'ReportContent',
    element: <ReportContent />,
    heading: {
      en: REPORT_COPY.en.title,
      es: 'Denunciar contenido',
      fr: 'Signaler un contenu',
    },
  },
];

describe('static pages are translated', () => {
  for (const page of CASES) {
    for (const lang of TRANSLATED) {
      it(`${page.name} renders its ${lang} heading`, () => {
        renderPage(page.element, lang);
        const h1 = screen.getByRole('heading', { level: 1 });
        expect(h1.textContent).toBe(page.heading[lang]);
      });
    }
  }

  it('English headings differ from es/fr for pages with distinct titles', () => {
    for (const name of ['RssFeeds', 'Subscribe', 'ReportContent']) {
      const page = CASES.find((candidate) => candidate.name === name);
      expect(page?.heading.es).not.toBe(page?.heading.en);
      expect(page?.heading.fr).not.toBe(page?.heading.en);
    }
  });

  it('ReportContent form labels and submit button are translated', () => {
    renderPage(<ReportContent />, 'fr');
    expect(screen.getByText(REPORT_COPY.fr.nameLabel)).toBeTruthy();
    expect(screen.getByRole('button', { name: REPORT_COPY.fr.submit })).toBeTruthy();
    expect(screen.getByLabelText(REPORT_COPY.fr.claimLabels.other)).toBeTruthy();
  });
});
