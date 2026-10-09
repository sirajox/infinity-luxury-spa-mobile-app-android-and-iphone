import { DEFAULT_TIMEZONE, formatInZone, formatNaira, type Kobo } from '@infinity/core';

export { formatNaira };

export function formatPrice(priceType: 'fixed' | 'from' | 'quote', priceKobo: Kobo | null): string {
  if (priceType === 'quote' || priceKobo === null) return 'Consultation';
  return priceType === 'from' ? `From ${formatNaira(priceKobo)}` : formatNaira(priceKobo);
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** Appointment times are always shown in the branch's own timezone. */
export function formatAppointment(iso: string, timeZone: string = DEFAULT_TIMEZONE): { date: string; time: string; short: string } {
  return {
    date: formatInZone(iso, timeZone, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    time: formatInZone(iso, timeZone, { hour: 'numeric', minute: '2-digit', hour12: true }),
    short: formatInZone(iso, timeZone, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }),
  };
}

export function formatShortDate(iso: string, timeZone: string = DEFAULT_TIMEZONE): string {
  return formatInZone(iso, timeZone, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatDayHeading(date: string): string {
  // `date` is a calendar day (YYYY-MM-DD); format it without any timezone shifting.
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat('en-NG', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatClock(hhmmss: string): string {
  const [h, m] = hhmmss.split(':').map(Number) as [number, number];
  const period = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${m.toString().padStart(2, '0')} ${period}`;
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return 'Yesterday';
  return new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short' }).format(new Date(iso));
}

/** `YYYY-MM-DD` for today in a branch's timezone. */
export function todayIn(timeZone: string = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

export function toDateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Escape a user-typed search term for use inside a PostgREST `ilike` filter. */
export function ilikeTerm(term: string): string {
  return term.replace(/[%_,()*\\]/g, ' ').replace(/\s+/g, ' ').trim();
}
