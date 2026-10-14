import {
  CATEGORIES,
  categorySlug,
  type Language,
  MENTION_PROFILE_URL,
  telegramChannelFor,
} from '@gwj/shared-types';
import { useLang } from '../lib/i18n';
import { LocaleLink } from '../lib/locale';
import { categoryLabel } from '../lib/dictionary';
import { MentionIcon, TelegramIcon } from './SocialIcons';
import { NewsletterSignup } from './NewsletterSignup';

/** A footer link whose visible label comes from a dictionary key. */
interface FooterLink {
  labelKey: string;
  to: string;
}

/** A footer column whose title comes from a dictionary key. */
interface FooterColumn {
  titleKey: string;
  links: FooterLink[];
}

// Routes stay identical across editions; only the visible labels are localized.
// The "Sections" column is rendered specially from CATEGORIES (localized via
// categoryLabel) so adding an edition needs no per-language link list here.
const COLUMNS: FooterColumn[] = [
  {
    titleKey: 'customerService',
    links: [
      { labelKey: 'customerCenter', to: '/customer-center' },
      { labelKey: 'contactUs', to: '/contact' },
      { labelKey: 'subscribe', to: '/subscribe' },
      { labelKey: 'newsletters', to: '/newsletters' },
    ],
  },
  {
    titleKey: 'tools',
    links: [
      { labelKey: 'search', to: '/search' },
      { labelKey: 'rssFeeds', to: '/rss' },
      { labelKey: 'podcasts', to: '/podcasts' },
      { labelKey: 'video', to: '/video' },
    ],
  },
  {
    titleKey: 'company',
    links: [
      { labelKey: 'aboutUs', to: '/about' },
      { labelKey: 'careers', to: '/careers' },
      { labelKey: 'advertise', to: '/advertise' },
      { labelKey: 'corrections', to: '/corrections' },
      { labelKey: 'reportContent', to: '/report-content' },
    ],
  },
  {
    titleKey: 'moreTitle',
    links: [
      { labelKey: 'privacy', to: '/privacy' },
      { labelKey: 'cookieNotice', to: '/cookie-notice' },
      { labelKey: 'terms', to: '/terms' },
      { labelKey: 'advertisingTerms', to: '/advertising-terms' },
      { labelKey: 'accessibility', to: '/accessibility' },
    ],
  },
];

/** The paper's profiles, shown as icons; `labelKey` names each for screen readers. */
function socialLinks(lang: Language) {
  return [
    { href: telegramChannelFor(lang).url, labelKey: 'onTelegram', Icon: TelegramIcon },
    { href: MENTION_PROFILE_URL, labelKey: 'onMention', Icon: MentionIcon },
  ] as const;
}

const FOOTER_LINK_CLASS =
  'font-body text-[0.85rem] text-ink-soft transition-colors hover:text-accent';

/** WSJ-style multi-column footer: link groups + wordmark + copyright. */
export function Footer() {
  const { lang, t } = useLang();

  return (
    <footer className="mt-16 border-t-3 border-ink bg-paper">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <NewsletterSignup className="mb-10 border-b border-rule pb-10" />
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
          <div>
            <h3 className="label mb-3 text-[0.6875rem] font-bold text-ink">{t('sectionsTitle')}</h3>
            <ul className="flex flex-col gap-2">
              {CATEGORIES.map((category) => (
                <li key={category}>
                  <LocaleLink to={`/${categorySlug(category)}`} className={FOOTER_LINK_CLASS}>
                    {categoryLabel(category, lang)}
                  </LocaleLink>
                </li>
              ))}
            </ul>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.titleKey}>
              <h3 className="label mb-3 text-[0.6875rem] font-bold text-ink">
                {t(column.titleKey)}
              </h3>
              <ul className="flex flex-col gap-2">
                {column.links.map((link) => (
                  <li key={link.labelKey}>
                    <LocaleLink to={link.to} className={FOOTER_LINK_CLASS}>
                      {t(link.labelKey)}
                    </LocaleLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-rule pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <LocaleLink
              to="/"
              className="headline text-2xl text-ink transition-colors hover:text-accent"
            >
              The Global World Journal
            </LocaleLink>
            <ul className="flex items-center gap-3">
              {socialLinks(lang).map(({ href, labelKey, Icon }) => (
                <li key={href}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t(labelKey)}
                    title={t(labelKey)}
                    className="block text-ink-soft transition-colors hover:text-accent"
                  >
                    <Icon className="h-5 w-5" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <p className="label text-[0.625rem] text-muted">
            {t('copyright', { x: String(new Date().getFullYear()) })}
          </p>
        </div>
      </div>
    </footer>
  );
}
