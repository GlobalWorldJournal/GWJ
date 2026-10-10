import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './useAuth'
import { Login } from './Login'
import { Dashboard } from './Dashboard'
import { Editor } from './Editor'
import { Takedowns } from './Takedowns'
import { NotFound } from '../pages/NotFound'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />
  }
  return <>{children}</>
}

/** Admin CMS subtree mounted at /admin/*. */
export function AdminApp() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-paper">
        <Routes>
          <Route path="login" element={<Login />} />
          <Route
            index
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />
          <Route
            path="articles/new"
            element={
              <RequireAuth>
                <Editor />
              </RequireAuth>
            }
          />
          <Route
            path="articles/:id"
            element={
              <RequireAuth>
                <Editor />
              </RequireAuth>
            }
          />
          <Route
            path="takedown-requests"
            element={
              <RequireAuth>
                <Takedowns />
              </RequireAuth>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </AuthProvider>
  )
}
