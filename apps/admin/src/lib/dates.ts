import { formatInZone } from '@infinity/core';

const TZ = 'Africa/Lagos';

export const fmtDateTime = (iso: string, tz = TZ) => formatInZone(iso, tz, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
export const fmtDate = (iso: string, tz = TZ) => formatInZone(iso, tz, { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtTime = (iso: string, tz = TZ) => formatInZone(iso, tz, { hour: 'numeric', minute: '2-digit' });

export type RangeKey = '7d' | '30d' | '90d' | 'month';
export const RANGES: { key: RangeKey; label: string }[] = [
  { key: '7d', label: 'Last 7 days' }, { key: '30d', label: 'Last 30 days' }, { key: '90d', label: 'Last 90 days' }, { key: 'month', label: 'This month' },
];

export function rangeBounds(key: string | undefined): { from: Date; to: Date; key: RangeKey } {
  const now = new Date();
  const k = (RANGES.find((r) => r.key === key)?.key ?? '30d') as RangeKey;
  if (k === 'month') return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), to: now, key: k };
  const days = k === '7d' ? 7 : k === '30d' ? 30 : 90;
  return { from: new Date(now.getTime() - days * 86_400_000), to: now, key: k };
}

export const todayLagos = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
