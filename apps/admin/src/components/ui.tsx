import Link from 'next/link';
import type { ReactNode } from 'react';

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-medium leading-tight sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-grey-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

const TONES = {
  gold: 'bg-gold-soft text-gold-text',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-grey-50 text-grey-600 ring-1 ring-grey-200',
  dark: 'bg-ink text-gold',
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}

export function StatCard({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'warn' }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-grey-600">{label}</p>
      <p className={`mt-2 font-serif text-3xl font-medium ${tone === 'warn' ? 'text-danger' : ''}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-grey-600">{hint}</p> : null}
    </div>
  );
}

export function Notice({ tone = 'gold', title, children }: { tone?: 'gold' | 'danger' | 'success'; title?: string; children: ReactNode }) {
  const cls = tone === 'danger' ? 'border-danger/30 bg-danger-soft' : tone === 'success' ? 'border-success/30 bg-success-soft' : 'border-gold/30 bg-gold-soft';
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`mb-5 rounded-xl border px-4 py-3 text-sm ${cls}`}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className="text-grey-600">{children}</div>
    </div>
  );
}

export function EmptyBox({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="font-serif text-xl">{title}</p>
      {children ? <div className="max-w-md text-sm text-grey-600">{children}</div> : null}
    </div>
  );
}

/** Builds a URL that keeps the current filters and changes some of them. */
export function withParams(base: string, params: Record<string, string | undefined>, patch: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) if (v !== undefined && v !== '') sp.set(k, String(v));
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

export function Pagination({ page, pageSize, total, base, params }: { page: number; pageSize: number; total: number; base: string; params: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-grey-200 px-4 py-3 text-sm text-grey-600">
      <span>Showing {from}–{to} of {total.toLocaleString()}</span>
      <div className="flex gap-2">
        {page > 1 ? <Link className="btn-outline btn-sm" href={withParams(base, params, { page: page - 1 })}>Previous</Link> : <span className="btn-outline btn-sm pointer-events-none opacity-40">Previous</span>}
        <span className="flex items-center px-2">Page {page} of {pages}</span>
        {page < pages ? <Link className="btn-outline btn-sm" href={withParams(base, params, { page: page + 1 })}>Next</Link> : <span className="btn-outline btn-sm pointer-events-none opacity-40">Next</span>}
      </div>
    </nav>
  );
}

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: 'right';
}

export function DataTable<T>({ columns, rows, rowKey, empty }: { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; empty?: ReactNode }) {
  if (rows.length === 0) return <>{empty ?? <EmptyBox title="Nothing here yet" />}</>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse">
        <thead className="border-b border-grey-200 bg-grey-50">
          <tr>{columns.map((c) => <th key={c.header} scope="col" className={`th ${c.align === 'right' ? 'text-right' : ''}`}>{c.header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-grey-200">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-warm/60">
              {columns.map((c) => <td key={c.header} className={`td ${c.align === 'right' ? 'text-right' : ''} ${c.className ?? ''}`}>{c.cell(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** GET form so searches and filters live in the URL (shareable, back-button friendly, server-rendered). */
export function FilterBar({ children, action, reset }: { children: ReactNode; action: string; reset?: boolean }) {
  return (
    <form action={action} method="get" className="mb-4 flex flex-wrap items-end gap-3">
      {children}
      <button type="submit" className="btn-primary">Apply</button>
      {reset ? <Link href={action} className="btn-ghost">Reset</Link> : null}
    </form>
  );
}

export function Tabs({ items, current }: { items: { href: string; label: string; key: string }[]; current: string }) {
  return (
    <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-grey-200 bg-white p-1">
      {items.map((t) => (
        <Link key={t.key} role="tab" aria-selected={t.key === current} href={t.href} className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium ${t.key === current ? 'bg-ink text-white' : 'text-grey-600 hover:bg-grey-50'}`}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function Flash({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return <Notice tone={error ? 'danger' : 'success'}>{error ?? ok}</Notice>;
}
