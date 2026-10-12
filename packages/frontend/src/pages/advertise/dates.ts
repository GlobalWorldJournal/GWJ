import { AD_MAX_ADVANCE_DAYS, AD_MAX_DAYS } from '@gwj/shared-types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** A calendar day as `YYYY-MM-DD` (UTC, the zone the server books in). */
export function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  return toDay(new Date(Date.parse(`${day}T00:00:00Z`) + days * MS_PER_DAY));
}

/** Inclusive number of days from `start` to `end`. */
export function daysBetween(start: string, end: string): number {
  return (
    Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / MS_PER_DAY) + 1
  );
}

/** The first and last day a booking may start on, and the last day any booking may end on. */
export function bookingWindow(today: string): {
  first: string;
  lastStart: string;
  lastEnd: string;
} {
  const lastStart = addDays(today, AD_MAX_ADVANCE_DAYS);
  return { first: today, lastStart, lastEnd: addDays(lastStart, AD_MAX_DAYS - 1) };
}

/** Every day from `start` to `end`, inclusive. */
export function eachDay(start: string, end: string): string[] {
  const days: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

/** The first of the month containing `day`, shifted by `months`. */
export function monthStart(day: string, months = 0): string {
  const date = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return toDay(date);
}
