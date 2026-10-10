import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Keep an editor from losing work: while `dirty`, leaving the page in the app
 * asks first (rendered by the returned element), and closing or reloading the
 * tab triggers the browser's own "leave site?" prompt.
 */
export function useUnsavedChangesGuard(dirty: boolean): React.ReactElement | null {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  // A DOM side effect (not data): the browser asks before unloading a dirty page.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (blocker.state !== 'blocked') return null;
  return (
    <div
      role="alertdialog"
      aria-label="Unsaved changes"
      className="mb-6 flex flex-wrap items-center justify-between gap-3 border border-accent p-3"
    >
      <p className="font-body text-sm text-ink">This article has unsaved changes.</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => blocker.reset()}
          className="label bg-ink px-3 py-1.5 text-[0.6875rem] text-paper transition-colors hover:bg-accent"
        >
          Keep editing
        </button>
        <button
          type="button"
          onClick={() => blocker.proceed()}
          className="label text-[0.6875rem] text-ink-soft transition-colors hover:text-accent"
        >
          Leave without saving
        </button>
      </div>
    </div>
  );
}
