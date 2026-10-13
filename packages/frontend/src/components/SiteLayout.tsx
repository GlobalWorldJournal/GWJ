import { Outlet, useLocation } from 'react-router-dom';
import { useLang } from '../lib/i18n';
import { staticMeta } from '../lib/pageMeta';
import { usePageMeta } from '../lib/usePageMeta';
import { stripLocale } from '../lib/locale';
import { Masthead } from './Masthead';
import { SectionNav } from './SectionNav';
import { Footer } from './Footer';

/** Public reader shell: masthead + section nav + routed page + footer. */
export function SiteLayout() {
  const { lang, t } = useLang();
  const { pathname } = useLocation();
  const path = stripLocale(pathname);
  const isFrontPage = path === '/';
  // Footer pages (About, Terms, Advertise…) are static copy: one place names them all.
  usePageMeta(staticMeta(path.replace(/\/$/, ''), lang));

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="label sr-only z-50 bg-ink px-4 py-2 text-[0.75rem] text-paper focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t('skipToContent')}
      </a>
      {/* The wordmark is the page's <h1> only on a front page; elsewhere the
          story or section title is, and the wordmark is a link. */}
      <Masthead isFrontPage={isFrontPage} />
      <SectionNav />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 outline-none"
      >
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
