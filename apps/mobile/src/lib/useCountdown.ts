import { useEffect, useState } from 'react';

/** Seconds remaining until `iso` (never negative), ticking once per second. */
export function useCountdown(iso: string | null | undefined): number {
  const target = iso ? new Date(iso).getTime() : 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [target]);
  return target ? Math.max(0, Math.floor((target - now) / 1000)) : 0;
}

export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
