import { Suspense, lazy, useEffect, type ReactElement, type ReactNode } from 'react'
import { BrowserRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { LanguageProvider } from './lib/i18n'
import { PREFIXED_LOCALES } from './lib/locale'
import { SiteLayout } from './components/SiteLayout'
import { ArticleSkeleton, ListSkeleton } from './components/Skeletons'
import { Home } from './pages/Home'
import { NotFound } from './pages/NotFound'

// Home and NotFound stay eager: Home is the LCP route (no lazy waterfall on the
// landing page) and NotFound is tiny and doubles as a fallback target. Every
// other route is code-split so readers never download admin/static/secondary
// JS up front. Vite emits one chunk per dynamic import below.
const ArticlePage = lazy(() => import('./pages/ArticlePage').then((m) => ({ default: m.ArticlePage })))
const AuthorPage = lazy(() => import('./pages/AuthorPage').then((m) => ({ default: m.AuthorPage })))
const Search = lazy(() => import('./pages/Search').then((m) => ({ default: m.Search })))
const Category = lazy(() => import('./pages/Category').then((m) => ({ default: m.Category })))
const AdminApp = lazy(() => import('./admin/AdminApp').then((m) => ({ default: m.AdminApp })))

const AboutUs = lazy(() => import('./pages/static/AboutUs').then((m) => ({ default: m.AboutUs })))
const Careers = lazy(() => import('./pages/static/Careers').then((m) => ({ default: m.Careers })))
const Advertise = lazy(() => import('./pages/static/Advertise').then((m) => ({ default: m.Advertise })))
const Corrections = lazy(() => import('./pages/static/Corrections').then((m) => ({ default: m.Corrections })))
const PrivacyNotice = lazy(() => import('./pages/static/PrivacyNotice').then((m) => ({ default: m.PrivacyNotice })))
const CookieNotice = lazy(() => import('./pages/static/CookieNotice').then((m) => ({ default: m.CookieNotice })))
const TermsOfUse = lazy(() => import('./pages/static/TermsOfUse').then((m) => ({ default: m.TermsOfUse })))
const Accessibility = lazy(() => import('./pages/static/Accessibility').then((m) => ({ default: m.Accessibility })))
const CustomerCenter = lazy(() => import('./pages/static/CustomerCenter').then((m) => ({ default: m.CustomerCenter })))
const ContactUs = lazy(() => import('./pages/static/ContactUs').then((m) => ({ default: m.ContactUs })))
const Subscribe = lazy(() => import('./pages/static/Subscribe').then((m) => ({ default: m.Subscribe })))
const Newsletters = lazy(() => import('./pages/static/Newsletters').then((m) => ({ default: m.Newsletters })))
const RssFeeds = lazy(() => import('./pages/static/RssFeeds').then((m) => ({ default: m.RssFeeds })))
const Podcasts = lazy(() => import('./pages/static/Podcasts').then((m) => ({ default: m.Podcasts })))
const Video = lazy(() => import('./pages/static/Video').then((m) => ({ default: m.Video })))

// Footer/static pages. Single-segment static paths out-rank the dynamic
// `:category` route in React Router, so these resolve correctly.
const STATIC_PAGES: { path: string; element: ReactElement }[] = [
  { path: 'about', element: <AboutUs /> },
  { path: 'careers', element: <Careers /> },
  { path: 'advertise', element: <Advertise /> },
  { path: 'corrections', element: <Corrections /> },
  { path: 'privacy', element: <PrivacyNotice /> },
  { path: 'cookie-notice', element: <CookieNotice /> },
  { path: 'terms', element: <TermsOfUse /> },
  { path: 'accessibility', element: <Accessibility /> },
  { path: 'customer-center', element: <CustomerCenter /> },
  { path: 'contact', element: <ContactUs /> },
  { path: 'subscribe', element: <Subscribe /> },
  { path: 'newsletters', element: <Newsletters /> },
  { path: 'rss', element: <RssFeeds /> },
  { path: 'podcasts', element: <Podcasts /> },
  { path: 'video', element: <Video /> },
]

/**
 * The public reader routes, rendered identically for every edition. They are
 * declared once here and mounted once per edition in {@link App}: at the site
 * root (the English edition, no path prefix) and under each prefixed-locale path
 * (`/es`, `/fr`). Returning the `<Route>` children keeps a single source of
 * truth so adding a page or an edition never duplicates route definitions.
 */
function publicRoutes(): ReactNode {
  return (
    <Route element={<SiteLayout />}>
      <Route index element={<Home />} />
      <Route
        path="article/:slug"
        element={
          <Suspense fallback={<ArticleSkeleton />}>
            <ArticlePage />
          </Suspense>
        }
      />
      <Route
        path="author/:slug"
        element={
          <Suspense fallback={<ListSkeleton />}>
            <AuthorPage />
          </Suspense>
        }
      />
      <Route
        path="search"
        element={
          <Suspense fallback={<ListSkeleton />}>
            <Search />
          </Suspense>
        }
      />
      {STATIC_PAGES.map((p) => (
        <Route
          key={p.path}
          path={p.path}
          element={<Suspense fallback={<ListSkeleton />}>{p.element}</Suspense>}
        />
      ))}
      <Route
        path=":category"
        element={
          <Suspense fallback={<ListSkeleton />}>
            <Category />
          </Suspense>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Route>
  )
}

/** Reset scroll to the top on every route change (SPA navigations don't by default). */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

/** Provides the active edition to the public route tree below it. */
function Edition({ lang }: { lang?: Parameters<typeof LanguageProvider>[0]['lang'] }) {
  return (
    <LanguageProvider lang={lang}>
      <Outlet />
    </LanguageProvider>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route
            path="/admin/*"
            element={
              <Suspense fallback={null}>
                <AdminApp />
              </Suspense>
            }
          />
          {/* Prefixed editions (`/es`, `/fr`) — literal paths, declared before
              the English root so they match ahead of the `:category` route.
              An unknown locale-shaped segment (e.g. `/de`) falls through to the
              English tree and 404s via the category resolver. */}
          {PREFIXED_LOCALES.map((locale) => (
            <Route key={locale} path={`/${locale}`} element={<Edition lang={locale} />}>
              {publicRoutes()}
            </Route>
          ))}
          {/* English edition at the site root (no prefix, canonical). */}
          <Route path="/" element={<Edition />}>
            {publicRoutes()}
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
