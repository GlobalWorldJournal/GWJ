import {
  CATEGORIES,
  type Category,
  type Language,
  type PublicArticle,
  type Writer,
} from '@gwj/shared-types';
import { categoryLabel, translate, writerTitle } from './dictionary';
import { firstParagraphText } from '../worker/markdown';

/**
 * The document <title> and meta description of every reader page, in the
 * edition's language. One source for both the Cloudflare SEO worker (what
 * crawlers and link previews read) and the app itself (what the tab shows after
 * client-side navigation), so the two can never disagree.
 */

export const SITE_NAME = 'The Global World Journal';

/** A meta description built from an article body is cut to this many characters. */
const DESCRIPTION_MAX = 200;

export interface PageMeta {
  title: string;
  description: string;
}

/** `Page — The Global World Journal`. */
function titled(page: string): string {
  return `${page} — ${SITE_NAME}`;
}

export function homeMeta(lang: Language): PageMeta {
  const sections = CATEGORIES.map((category) => categoryLabel(category, lang)).join(', ');
  return {
    title: `${SITE_NAME} — ${sections}`,
    description: translate(lang, 'metaHomeDescription'),
  };
}

export function categoryMeta(category: Category, lang: Language): PageMeta {
  const name = categoryLabel(category, lang);
  return {
    title: titled(name),
    description: translate(lang, 'metaCategoryDescription', { x: name }),
  };
}

export function authorMeta(writer: Writer | undefined, lang: Language): PageMeta {
  if (!writer) {
    return {
      title: `${SITE_NAME} — ${translate(lang, 'author')}`,
      description: translate(lang, 'metaAuthorFallback'),
    };
  }
  const title = writerTitle(writer.title, lang);
  return {
    title: `${writer.name}, ${title} — ${SITE_NAME}`,
    description: translate(lang, 'metaAuthorDescription', {
      x: writer.name,
      y: title,
      z: writer.beats.map((beat) => categoryLabel(beat, lang)).join(', '),
    }),
  };
}

export function searchMeta(lang: Language): PageMeta {
  return {
    title: titled(translate(lang, 'search')),
    description: translate(lang, 'metaSearchDescription'),
  };
}

export function tagMeta(tag: string, lang: Language): PageMeta {
  return {
    title: titled(translate(lang, 'taggedTitle', { x: tag })),
    description: translate(lang, 'metaTagDescription', { x: tag }),
  };
}

export function notFoundMeta(lang: Language): PageMeta {
  return {
    title: titled(translate(lang, 'notFoundTitle')),
    description: translate(lang, 'metaNotFoundDescription'),
  };
}

/** Footer/static pages: edition-relative path → the dictionary key that names the page. */
const STATIC_PAGE_KEYS: Record<string, string> = {
  '/about': 'aboutUs',
  '/careers': 'careers',
  '/advertise': 'advertise',
  '/advertise/start': 'advertise',
  '/advertise/dashboard': 'advertise',
  '/advertise/success': 'advertise',
  '/advertising-terms': 'advertisingTerms',
  '/corrections': 'corrections',
  '/report-content': 'reportContent',
  '/privacy': 'privacy',
  '/cookie-notice': 'cookieNotice',
  '/terms': 'terms',
  '/accessibility': 'accessibility',
  '/customer-center': 'customerCenter',
  '/contact': 'contactUs',
  '/subscribe': 'subscribe',
  '/newsletters': 'newsletters',
  '/newsletter/confirm': 'newsletters',
  '/newsletter/unsubscribe': 'newsletters',
  '/rss': 'rssFeeds',
  '/podcasts': 'podcasts',
  '/video': 'video',
};

/** Whether an edition-relative path is one of the footer/static pages. */
export function isStaticPagePath(path: string): boolean {
  return path in STATIC_PAGE_KEYS;
}

/** The page's meta for a footer/static page, or null for any other path. */
export function staticMeta(path: string, lang: Language): PageMeta | null {
  const key = STATIC_PAGE_KEYS[path];
  if (!key) return null;
  const name = translate(lang, key);
  return {
    title: titled(name),
    description: translate(lang, 'metaStaticDescription', { x: name }),
  };
}

/** The meta description of a story: the editor's, else the deck, else the opening paragraph. */
export function articleDescription(article: PublicArticle): string {
  if (article.seo.metaDescription) return article.seo.metaDescription;
  if (article.deck) return article.deck;
  const lead = firstParagraphText(article.body);
  if (lead) return lead.slice(0, DESCRIPTION_MAX);
  return `${SITE_NAME} — ${article.title}`;
}

export function articleMeta(article: PublicArticle): PageMeta {
  return {
    title: article.seo.metaTitle || titled(article.title),
    description: articleDescription(article),
  };
}
