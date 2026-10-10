'use client';

import { Menu, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

export interface ShellNavGroup { title: string; items: { href: string; label: string; iconName: string }[] }

/** Dashboard frame: black sidebar (drawer on small screens), skip link and a header with the staff member. */
export function Shell({ groups, user, signOut, children, icons }: {
  groups: ShellNavGroup[]; user: { email: string; role: string }; signOut: () => Promise<void>; children: ReactNode;
  icons: Record<string, ReactNode>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));

  const nav = (
    <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">{g.title}</p>
          <ul className="space-y-0.5">
            {g.items.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href} onClick={() => setOpen(false)} aria-current={active(i.href) ? 'page' : undefined}
                  className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm ${active(i.href) ? 'bg-gold/15 font-semibold text-gold' : 'text-white/75 hover:bg-white/5 hover:text-white'}`}
                >
                  <span aria-hidden className="size-[18px] shrink-0">{icons[i.iconName]}</span>
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">Skip to content</a>

      <aside className="hidden bg-ink lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <Brand />
        {nav}
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button aria-label="Close menu" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative flex h-full w-72 max-w-[85vw] flex-col bg-ink">
            <button aria-label="Close menu" onClick={() => setOpen(false)} className="absolute right-3 top-4 rounded-lg p-2 text-white/70"><X className="size-5" /></button>
            <Brand />
            {nav}
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-grey-200 bg-white/90 px-4 backdrop-blur sm:px-8">
          <button aria-label="Open menu" onClick={() => setOpen(true)} className="rounded-lg p-2 lg:hidden"><Menu className="size-5" /></button>
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">{user.email}</p>
              <p className="text-xs text-grey-600">{user.role}</p>
            </div>
            <form action={signOut}><button className="btn-outline btn-sm">Sign out</button></form>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3 px-6 py-6">
      <Image src="/logo.png" alt="" width={40} height={40} className="rounded-full" priority />
      <div className="leading-tight">
        <p className="font-serif text-lg text-white">Infinity</p>
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/50">Luxury Spa Admin</p>
      </div>
    </div>
  );
}
