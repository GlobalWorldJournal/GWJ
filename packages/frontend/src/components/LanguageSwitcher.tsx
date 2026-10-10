import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_NAMES,
  isLanguage,
  type Language,
  type PublicArticle,
} from '@gwj/shared-types';
import { useLang } from '../lib/i18n';
import { localizePath, stripLocale } from '../lib/locale';
import { getArticle } from '../lib/api';

const ARTICLE_PATH = /^\/article\/([^/]+)\/?$/;

/**
 * Where switching to `next` should go. On an article: that story's edition in
 * `next` when one is published, otherwise `next`'s front page (an article is a
 * single-language document, so there is no "same page" in another edition).
 * Anywhere else: the same page under the new locale prefix, query and hash kept.
 */
function switchTarget(
  next: Language,
  pathname: string,
  suffix: string,
  article: PublicArticle | undefined,
): string {
  const editionRelative = stripLocale(pathname);
  if (!ARTICLE_PATH.test(editionRelative)) return `${localizePath(next, editionRelative)}${suffix}`;
  const edition = article?.translations?.find(
    (t) => t.language === next && t.status === 'published',
  );
  return edition ? localizePath(next, `/article/${edition.slug}`) : localizePath(next, '/');
}

/** Accessible edition (language) picker. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const slug = ARTICLE_PATH.exec(stripLocale(location.pathname))?.[1];

  // The article page's own query (same key), read from the cache: no extra request.
  const { data: article } = useQuery({
    queryKey: ['article', slug],
    queryFn: ({ signal }) => getArticle(slug ?? '', signal),
    enabled: Boolean(slug),
  });

  return (
    <label className={`flex items-center ${className ?? ''}`}>
      <span className="sr-only">{LANGUAGE_NAMES[lang]}</span>
      <select
        value={lang}
        onChange={(event) => {
          const next = event.target.value;
          if (!isLanguage(next) || next === lang) {
            return;
          }
          navigate(
            switchTarget(next, location.pathname, `${location.search}${location.hash}`, article),
          );
        }}
        aria-label="Language"
        className="label cursor-pointer bg-transparent text-[0.75rem] tracking-[0.06em] text-ink outline-none transition-colors hover:text-accent"
      >
        {SUPPORTED_LANGUAGES.map((code) => (
          <option key={code} value={code}>
            {LANGUAGE_NAMES[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
