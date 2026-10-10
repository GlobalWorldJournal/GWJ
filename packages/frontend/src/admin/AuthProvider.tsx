import { useMemo, useState } from 'react';
import { LoginResponseSchema, type LoginResponse } from '@gwj/shared-types';
import { AuthContext, STORAGE_TOKEN_KEY, STORAGE_USER_KEY, type AuthState } from './useAuth';

const StoredUserSchema = LoginResponseSchema.shape.user;

interface StoredSession {
  token: string;
  user: LoginResponse['user'];
}

function readStoredSession(): StoredSession | null {
  try {
    const token = sessionStorage.getItem(STORAGE_TOKEN_KEY);
    const rawUser = sessionStorage.getItem(STORAGE_USER_KEY);
    if (!token || !rawUser) {
      return null;
    }
    const parsed = StoredUserSchema.safeParse(JSON.parse(rawUser));
    if (!parsed.success) {
      return null;
    }
    return { token, user: parsed.data };
  } catch {
    return null;
  }
}

/** Holds the admin JWT in React state, mirrored to sessionStorage for reloads. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(readStoredSession);

  const value = useMemo<AuthState>(
    () => ({
      token: session?.token ?? null,
      user: session?.user ?? null,
      isAuthenticated: session !== null,
      signIn: (response: LoginResponse) => {
        try {
          sessionStorage.setItem(STORAGE_TOKEN_KEY, response.token);
          sessionStorage.setItem(STORAGE_USER_KEY, JSON.stringify(response.user));
        } catch {
          // sessionStorage may be unavailable (private mode); keep the in-memory session.
          setSession({ token: response.token, user: response.user });
          return;
        }
        setSession({ token: response.token, user: response.user });
      },
      signOut: () => {
        try {
          sessionStorage.removeItem(STORAGE_TOKEN_KEY);
          sessionStorage.removeItem(STORAGE_USER_KEY);
        } catch {
          // Ignore storage errors on sign-out; we still clear in-memory state below.
        }
        setSession(null);
      },
    }),
    [session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
