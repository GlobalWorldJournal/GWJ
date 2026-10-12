import { isRouteErrorResponse, useLocation, useRouteError } from 'react-router-dom';
import { useLang, LanguageProvider } from '../lib/i18n';
import { localeFromPath } from '../lib/locale';
import { isChunkLoadError, reloadForNewRelease } from '../lib/staleRelease';
import { NotFound } from '../pages/NotFound';

/** The error view's content, in the edition of the page that failed. */
function ErrorMessage() {
  const { t } = useLang();
  return (
    <div className="py-24 text-center" role="alert">
      <h1 className="headline text-4xl text-ink">{t('errorTitle')}</h1>
      <p className="mt-3 text-muted">{t('errorDetail')}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="label mt-6 inline-block border-b-2 border-accent pb-1 text-[0.75rem] text-accent"
      >
        {t('reloadPage')}
      </button>
    </div>
  );
}

/**
 * What a route shows instead of crashing the app: a page that failed to load
 * because a deploy replaced its code is reloaded (once) onto the new release; a
 * 404 is the not-found page; anything else is a translated error with a way out.
 * Mounted inside the site layout for reader pages (header and footer stay) and
 * at the root as the last resort, where it supplies its own edition.
 */
export function RouteError() {
  const error = useRouteError();
  if (isChunkLoadError(error) && reloadForNewRelease()) return null;
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;
  return <ErrorMessage />;
}

/** The root-level fallback: outside any edition, so it reads the edition from the URL. */
export function RootRouteError() {
  const { pathname } = useLocation();
  return (
    <LanguageProvider lang={localeFromPath(pathname)}>
      <RouteError />
    </LanguageProvider>
  );
}
