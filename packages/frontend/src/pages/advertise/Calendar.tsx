import { useState } from 'react';
import { useLang } from '../../lib/i18n';
import { addDays, monthStart } from './dates';
import type { AdvertiseCopy } from './copy';

const WEEK_DAYS = 7;
const MONTH_LABEL_BASE = '2026-01-04'; // a Sunday, only used to name the weekday columns

interface CalendarProps {
  copy: AdvertiseCopy;
  /** First and last day that may be picked (inclusive). */
  first: string;
  last: string;
  booked: ReadonlySet<string>;
  start: string | null;
  end: string | null;
  /** Extra days that cannot be picked right now (beyond the booked ones and the outer range). */
  isDisabled?: (day: string) => boolean;
  onPick: (day: string) => void;
}

/** A month grid; booked and out-of-range days are disabled. Weeks start on Sunday. */
export function Calendar({
  copy,
  first,
  last,
  booked,
  start,
  end,
  isDisabled,
  onPick,
}: CalendarProps) {
  const { lang } = useLang();
  const [month, setMonth] = useState(() => monthStart(start ?? first));

  const monthDate = new Date(`${month}T00:00:00Z`);
  const title = new Intl.DateTimeFormat(lang, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(monthDate);
  const weekdayNames = Array.from({ length: WEEK_DAYS }, (_unused, index) =>
    new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' }).format(
      new Date(`${addDays(MONTH_LABEL_BASE, index)}T00:00:00Z`),
    ),
  );
  const leadingBlanks = monthDate.getUTCDay();
  const daysInMonth = new Date(
    Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const days = Array.from({ length: daysInMonth }, (_unused, index) => addDays(month, index));

  const canGoBack = monthStart(month, -1) >= monthStart(first);
  const canGoForward = monthStart(month, 1) <= last;
  const dayFormat = new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' });

  return (
    <div className="w-full max-w-sm border border-rule p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label={copy.prevMonth}
          disabled={!canGoBack}
          onClick={() => setMonth(monthStart(month, -1))}
          className="label px-2 py-1 text-ink hover:text-accent disabled:opacity-30"
        >
          ‹
        </button>
        <p className="label text-[0.75rem] font-bold capitalize text-ink" aria-live="polite">
          {title}
        </p>
        <button
          type="button"
          aria-label={copy.nextMonth}
          disabled={!canGoForward}
          onClick={() => setMonth(monthStart(month, 1))}
          className="label px-2 py-1 text-ink hover:text-accent disabled:opacity-30"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-px text-center">
        {weekdayNames.map((name) => (
          <span key={name} className="label py-1 text-[0.625rem] text-muted">
            {name}
          </span>
        ))}
        {days.map((day) => {
          const isBooked = booked.has(day);
          const outOfRange = day < first || day > last;
          const inRange = start !== null && end !== null && day >= start && day <= end;
          const isEdge = day === start || day === end;
          const unavailable = isBooked || outOfRange || isDisabled?.(day) === true;
          const label = `${dayFormat.format(new Date(`${day}T00:00:00Z`))}${isBooked ? `, ${copy.legendTaken}` : ''}`;
          let tone = 'text-ink hover:bg-rule-soft';
          if (isEdge) tone = 'bg-ink text-white';
          else if (inRange) tone = 'bg-rule text-ink';
          else if (isBooked) tone = 'text-muted line-through';
          else if (outOfRange) tone = 'text-rule';
          return (
            <button
              key={day}
              type="button"
              data-date={day}
              aria-label={label}
              aria-pressed={isEdge || inRange}
              style={day === month ? { gridColumnStart: leadingBlanks + 1 } : undefined}
              disabled={unavailable}
              onClick={() => onPick(day)}
              className={`label h-9 text-[0.75rem] disabled:cursor-not-allowed ${tone}`}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
