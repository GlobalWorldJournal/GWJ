import { afterEach, describe, expect, it, vi } from 'bun:test';
import { articleService } from '../articleService';
import { startScheduler } from '../scheduler';

/**
 * Advance the fake clock, letting the promise callbacks a tick schedules settle
 * on both sides of it (the async variant of `advanceTimersByTime`).
 */
async function advanceTimersByTimeAsync(ms: number): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  vi.advanceTimersByTime(ms);
  await new Promise((resolve) => setImmediate(resolve));
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('startScheduler', () => {
  it('looks for due drafts every interval and never runs two ticks at once', async () => {
    vi.useFakeTimers();
    let finish: (ids: string[]) => void = () => undefined;
    const publishDue = vi.spyOn(articleService, 'publishDue').mockImplementation(
      () =>
        new Promise<string[]>((resolve) => {
          finish = resolve;
        }),
    );
    const stop = startScheduler(1_000);

    await advanceTimersByTimeAsync(1_000);
    expect(publishDue).toHaveBeenCalledTimes(1);
    // The first tick is still running: the next interval skips instead of overlapping.
    await advanceTimersByTimeAsync(1_000);
    expect(publishDue).toHaveBeenCalledTimes(1);

    finish([]);
    await advanceTimersByTimeAsync(1_000);
    expect(publishDue).toHaveBeenCalledTimes(2);

    stop();
    finish([]);
    await advanceTimersByTimeAsync(5_000);
    expect(publishDue).toHaveBeenCalledTimes(2);
  });
});
