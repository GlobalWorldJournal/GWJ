import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ApiRequestError } from '../lib/api';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';
import { Login } from './Login';
import { Dashboard } from './Dashboard';
import { Editor } from './Editor';
import { Takedowns } from './Takedowns';
import { AdCampaigns } from './AdCampaigns';
import { Tokens } from './Tokens';
import { Users } from './Users';
import { Account } from './Account';
import { NotFound } from '../pages/NotFound';
import { LanguageProvider } from '../lib/i18n';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }
  return <>{children}</>;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 401;
}

/**
 * An expired or revoked admin JWT makes every call fail with 401. Rather than
 * leave the editor showing error text, end the session so RequireAuth sends the
 * user back to the login page.
 */
function SignOutOnUnauthorized() {
  const queryClient = useQueryClient();
  const { isAuthenticated, signOut } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const unsubscribeQueries = queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type === 'updated' &&
        event.action.type === 'error' &&
        isUnauthorized(event.action.error)
      )
        signOut();
    });
    const unsubscribeMutations = queryClient.getMutationCache().subscribe((event) => {
      if (
        event.type === 'updated' &&
        event.mutation.state.status === 'error' &&
        isUnauthorized(event.mutation.state.error)
      ) {
        signOut();
      }
    });
    return () => {
      unsubscribeQueries();
      unsubscribeMutations();
    };
  }, [queryClient, isAuthenticated, signOut]);

  return null;
}

/** Admin CMS subtree mounted at /admin/*. Its chrome is English (the default edition). */
export function AdminApp() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <SignOutOnUnauthorized />
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
            <Route
              path="ad-campaigns"
              element={
                <RequireAuth>
                  <AdCampaigns />
                </RequireAuth>
              }
            />
            <Route
              path="tokens"
              element={
                <RequireAuth>
                  <Tokens />
                </RequireAuth>
              }
            />
            <Route
              path="users"
              element={
                <RequireAuth>
                  <Users />
                </RequireAuth>
              }
            />
            <Route
              path="account"
              element={
                <RequireAuth>
                  <Account />
                </RequireAuth>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </AuthProvider>
    </LanguageProvider>
  );
}
