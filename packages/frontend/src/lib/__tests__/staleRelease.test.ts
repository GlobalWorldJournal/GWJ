import { describe, expect, it, vi } from 'vitest';
import {
  installStaleReleaseRecovery,
  isChunkLoadError,
  reloadForNewRelease,
} from '../staleRelease';

/** A window with working session storage and a spied reload. */
function fakeWindow() {
  const store = new Map<string, string>();
  const listeners = new Map<string, (event: Event) => void>();
  const reload = vi.fn();
  const win = {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    },
    location: { reload },
    addEventListener: (type: string, listener: (event: Event) => void) =>
      listeners.set(type, listener),
  };
  return { win: win as unknown as Window, reload, listeners };
}

describe('stale release recovery', () => {
  it('recognises a failed dynamic import in every major browser', () => {
    for (const message of [
      'Failed to fetch dynamically imported module: https://x/assets/Search-1a2b.js',
      'error loading dynamically imported module: https://x/assets/Search-1a2b.js',
      'Importing a module script failed.',
    ]) {
      expect(isChunkLoadError(new TypeError(message))).toBe(true);
    }
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false);
  });

  it('reloads once, then refuses while a recent recovery reload is on record', () => {
    const { win, reload } = fakeWindow();
    expect(reloadForNewRelease(win)).toBe(true);
    expect(reloadForNewRelease(win)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('never reloads when session storage is unavailable (no guard, no loop)', () => {
    const { win, reload } = fakeWindow();
    win.sessionStorage.getItem = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    expect(reloadForNewRelease(win)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('handles Vite preload failures by reloading instead of failing the import', () => {
    const { win, reload, listeners } = fakeWindow();
    installStaleReleaseRecovery(win);
    const event = new Event('vite:preloadError', { cancelable: true });
    listeners.get('vite:preloadError')?.(event);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });
});
