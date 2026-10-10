import { useLocation, useNavigate } from 'react-router-dom';
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES, isLanguage } from '@gwj/shared-types';
import { useLang } from '../lib/i18n';
import { localizePath, stripLocale } from '../lib/locale';

/**
 * Accessible edition (language) picker. Changing the edition navigates to the
 * SAME page under the new locale prefix (e.g. `/es/article/x` → `/fr/article/x`,
 * → `/article/x` for English), preserving the query string and hash. The URL is
 * the single source of truth for the edition, so this is a plain navigation.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang } = useLang();
  const navigate = useNavigate();
  const location = useLocation();

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
          const editionRelative = stripLocale(location.pathname);
          navigate(`${localizePath(next, editionRelative)}${location.search}${location.hash}`);
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
