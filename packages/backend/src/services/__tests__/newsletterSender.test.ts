import { describe, expect, it } from 'bun:test';
import { localTime } from '../newsletterSender';

describe('localTime', () => {
  it('reads the date and hour in the edition’s own zone', () => {
    // 2026-07-01 11:30 UTC is 07:30 in New York (EDT), 13:30 in Madrid (CEST).
    const now = new Date('2026-07-01T11:30:00Z');
    expect(localTime(now, 'America/New_York')).toEqual({ date: '2026-07-01', hour: 7 });
    expect(localTime(now, 'Europe/Madrid')).toEqual({ date: '2026-07-01', hour: 13 });
  });

  it('rolls the date with the zone and uses a 0–23 hour', () => {
    // 2026-01-01 00:30 UTC is still 2025-12-31 in New York (EST), and 01:30 in Paris.
    const now = new Date('2026-01-01T00:30:00Z');
    expect(localTime(now, 'America/New_York')).toEqual({ date: '2025-12-31', hour: 19 });
    expect(localTime(now, 'Europe/Paris')).toEqual({ date: '2026-01-01', hour: 1 });
  });
});
