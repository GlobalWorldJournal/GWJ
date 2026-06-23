import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { SiteLayout } from './components/SiteLayout'
import { Home } from './pages/Home'
import { Category } from './pages/Category'
import { ArticlePage } from './pages/ArticlePage'
import { Search } from './pages/Search'
import { NotFound } from './pages/NotFound'
import { AdminApp } from './admin/AdminApp'

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/admin/*" element={<AdminApp />} />
          <Route element={<SiteLayout />}>
            <Route index element={<Home />} />
            <Route path="article/:slug" element={<ArticlePage />} />
            <Route path="search" element={<Search />} />
            <Route path=":category" element={<Category />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
