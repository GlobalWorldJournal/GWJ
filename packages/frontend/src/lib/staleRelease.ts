/**
 * Recovery from a stale release. After a deploy, a tab still running the
 * previous release asks for code-split chunks whose hashed names no longer
 * exist, and the navigation fails. Loading the page again picks up the new
 * release. Guarded so a chunk that is genuinely broken cannot loop reloads.
 */

const RELOADED_AT_KEY = 'gwj:stale-release-reload';
/** A second failure this soon after a recovery reload is not a stale release. */
const RELOAD_GUARD_MS = 30_000;

/** The messages browsers give a failed dynamic import (Chrome, Firefox, Safari). */
const CHUNK_LOAD_FAILURE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

export function isChunkLoadError(error: unknown): boolean {
  return error instanceof Error && CHUNK_LOAD_FAILURE.test(error.message);
}

function lastReloadAt(storage: Storage): number {
  try {
    return Number(storage.getItem(RELOADED_AT_KEY) ?? 0);
  } catch {
    // Storage blocked (private mode, policy): no guard is available, so report
    // a recent reload — refusing to reload beats risking a loop.
    return Date.now();
  }
}

/**
 * Reload once to pick up the current release. Returns false (and does nothing)
 * when a recovery reload already happened moments ago.
 */
export function reloadForNewRelease(win: Window = window): boolean {
  const now = Date.now();
  if (now - lastReloadAt(win.sessionStorage) < RELOAD_GUARD_MS) return false;
  try {
    win.sessionStorage.setItem(RELOADED_AT_KEY, String(now));
  } catch {
    // Without the guard a reload could loop: leave the page to its error view.
    return false;
  }
  win.location.reload();
  return true;
}

/**
 * Vite reports a failed preload of a lazy route's chunks with `vite:preloadError`
 * (its documented hook for this); recovering there means the import never fails.
 */
export function installStaleReleaseRecovery(win: Window = window): void {
  win.addEventListener('vite:preloadError', (event) => {
    if (reloadForNewRelease(win)) event.preventDefault();
  });
}
