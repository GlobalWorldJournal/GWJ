import { useSyncExternalStore } from 'react';

/** Its own key: the advertiser session never shares anything with the admin session. */
export const ADVERTISER_TOKEN_KEY = 'gwj.advertiser.token';

type Listener = () => void;

const listeners = new Set<Listener>();

function readStored(): string | null {
  try {
    return localStorage.getItem(ADVERTISER_TOKEN_KEY) || null;
  } catch {
    // Storage can be blocked (private mode): the in-memory token below still works.
    return null;
  }
}

let memoryToken: string | null = readStored();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): string | null {
  return memoryToken;
}

export function setAdvertiserToken(token: string): void {
  memoryToken = token;
  try {
    localStorage.setItem(ADVERTISER_TOKEN_KEY, token);
  } catch {
    // Keep the in-memory session when storage is unavailable.
  }
  emit();
}

export function clearAdvertiserToken(): void {
  memoryToken = null;
  try {
    localStorage.removeItem(ADVERTISER_TOKEN_KEY);
  } catch {
    // Nothing stored to clear; the in-memory token is already gone.
  }
  emit();
}

/** The advertiser's bearer token, or null when signed out. */
export function useAdvertiserToken(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
