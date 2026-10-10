import { afterEach, describe, expect, it, vi } from 'vitest';
import { articleService } from '../articleService';
import { startScheduler } from '../scheduler';

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

    await vi.advanceTimersByTimeAsync(1_000);
    expect(publishDue).toHaveBeenCalledTimes(1);
    // The first tick is still running: the next interval skips instead of overlapping.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(publishDue).toHaveBeenCalledTimes(1);

    finish([]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(publishDue).toHaveBeenCalledTimes(2);

    stop();
    finish([]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(publishDue).toHaveBeenCalledTimes(2);
  });
});
