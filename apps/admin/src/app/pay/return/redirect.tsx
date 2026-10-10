'use client';

import { useEffect } from 'react';

/** Opens the app automatically; the visible button remains as a fallback. */
export function ReturnRedirect({ href }: { href: string }) {
  useEffect(() => {
    const t = setTimeout(() => { window.location.href = href; }, 400);
    return () => clearTimeout(t);
  }, [href]);
  return null;
}
