import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import type { Language } from '@gwj/shared-types';
import type { ReactElement } from 'react';
import { renderPage } from '../../advertise/__tests__/testing';
import { AboutUs } from '../AboutUs';
import { ABOUT_US_COPY } from '../AboutUs.copy';
import { Accessibility } from '../Accessibility';
import { ACCESSIBILITY_COPY } from '../Accessibility.copy';
import { Careers } from '../Careers';
import { CAREERS_COPY } from '../Careers.copy';
import { ContactUs } from '../ContactUs';
import { CONTACT_US_COPY } from '../ContactUs.copy';
import { Corrections } from '../Corrections';
import { CORRECTIONS_COPY } from '../Corrections.copy';

interface Case {
  name: string;
  page: ReactElement;
  titles: Record<Language, string>;
}

const CASES: readonly Case[] = [
  {
    name: 'AboutUs',
    page: <AboutUs />,
    titles: { en: ABOUT_US_COPY.en.title, es: ABOUT_US_COPY.es.title, fr: ABOUT_US_COPY.fr.title },
  },
  {
    name: 'Accessibility',
    page: <Accessibility />,
    titles: {
      en: ACCESSIBILITY_COPY.en.title,
      es: ACCESSIBILITY_COPY.es.title,
      fr: ACCESSIBILITY_COPY.fr.title,
    },
  },
  {
    name: 'Careers',
    page: <Careers />,
    titles: { en: CAREERS_COPY.en.title, es: CAREERS_COPY.es.title, fr: CAREERS_COPY.fr.title },
  },
  {
    name: 'ContactUs',
    page: <ContactUs />,
    titles: {
      en: CONTACT_US_COPY.en.title,
      es: CONTACT_US_COPY.es.title,
      fr: CONTACT_US_COPY.fr.title,
    },
  },
  {
    name: 'Corrections',
    page: <Corrections />,
    titles: {
      en: CORRECTIONS_COPY.en.title,
      es: CORRECTIONS_COPY.es.title,
      fr: CORRECTIONS_COPY.fr.title,
    },
  },
];

const TRANSLATED: readonly Language[] = ['es', 'fr'];

describe.each(CASES)('$name', ({ page, titles }) => {
  it.each(TRANSLATED)('renders the %s heading, different from English', (lang) => {
    renderPage(page, lang);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe(titles[lang]);
    expect(titles[lang]).not.toBe(titles.en);
  });
});
