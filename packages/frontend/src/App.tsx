import type { ReactElement } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { SiteLayout } from './components/SiteLayout'
import { Home } from './pages/Home'
import { Category } from './pages/Category'
import { ArticlePage } from './pages/ArticlePage'
import { AuthorPage } from './pages/AuthorPage'
import { Search } from './pages/Search'
import { NotFound } from './pages/NotFound'
import { AdminApp } from './admin/AdminApp'
import { AboutUs } from './pages/static/AboutUs'
import { Careers } from './pages/static/Careers'
import { Advertise } from './pages/static/Advertise'
import { Corrections } from './pages/static/Corrections'
import { PrivacyNotice } from './pages/static/PrivacyNotice'
import { CookieNotice } from './pages/static/CookieNotice'
import { TermsOfUse } from './pages/static/TermsOfUse'
import { Accessibility } from './pages/static/Accessibility'
import { CustomerCenter } from './pages/static/CustomerCenter'
import { ContactUs } from './pages/static/ContactUs'
import { Subscribe } from './pages/static/Subscribe'
import { Newsletters } from './pages/static/Newsletters'
import { RssFeeds } from './pages/static/RssFeeds'
import { Podcasts } from './pages/static/Podcasts'
import { Video } from './pages/static/Video'

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

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/admin/*" element={<AdminApp />} />
          <Route element={<SiteLayout />}>
            <Route index element={<Home />} />
            <Route path="article/:slug" element={<ArticlePage />} />
            <Route path="author/:slug" element={<AuthorPage />} />
            <Route path="search" element={<Search />} />
            {STATIC_PAGES.map((p) => (
              <Route key={p.path} path={p.path} element={p.element} />
            ))}
            <Route path=":category" element={<Category />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
