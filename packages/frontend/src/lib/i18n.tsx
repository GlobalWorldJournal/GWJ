import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { DEFAULT_LANGUAGE, type Language } from '@gwj/shared-types';
import { translate } from './dictionary';

interface LanguageContextValue {
  lang: Language;
  /** Translate a chrome key, falling back en → key, with `{x}` interpolation. */
  t: (key: string, vars?: Record<string, string>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/**
 * Provides the current edition (language) and translation helpers. The active
 * edition is determined by the URL path — English at the root, `/es` and `/fr`
 * under their prefixes — and passed in by the routing layer (`LocaleLayout` for
 * prefixed editions, the default for the English root). The URL is the single
 * source of truth, so the edition is shareable, cacheable, and SEO-friendly with
 * no localStorage-driven redirects.
 */
export function LanguageProvider({
  lang = DEFAULT_LANGUAGE,
  children,
}: {
  lang?: Language;
  children: ReactNode;
}) {
  // Keep <html lang> in sync with the active edition (legitimate DOM side effect).
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback(
    (key: string, vars?: Record<string, string>): string => translate(lang, key, vars),
    [lang],
  );

  const value = useMemo<LanguageContextValue>(() => ({ lang, t }), [lang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLang must be used within a <LanguageProvider>');
  }
  return context;
}
