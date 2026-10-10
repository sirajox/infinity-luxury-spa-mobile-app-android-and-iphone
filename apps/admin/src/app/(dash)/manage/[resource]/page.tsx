import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatNaira } from '@infinity/core';
import { Badge, DataTable, EmptyBox, Flash, PageHeader, Pagination, type Column } from '@/components/ui';
import { requireAccess } from '@/lib/auth';
import { fmtDate } from '@/lib/dates';
import { resourceBySlug } from '@/lib/resources/defs';
import { listRows, pkOf, type Row } from '@/lib/resources/engine';
import type { ColumnDef } from '@/lib/resources/types';
import { createClient } from '@/lib/supabase/server';

const PAGE_SIZE = 20;

function pick(row: Row, c: ColumnDef): unknown {
  if (!c.path) return row[c.key];
  return c.path.split('.').reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Row)[k] : undefined), row);
}

function render(row: Row, c: ColumnDef) {
  const v = pick(row, c);
  if (v === null || v === undefined || v === '') return <span className="text-grey-400">—</span>;
  switch (c.format) {
    case 'bool': return v ? <Badge tone="success">Yes</Badge> : <Badge>No</Badge>;
    case 'money': return formatNaira(Number(v));
    case 'date': case 'datetime': return fmtDate(String(v));
    case 'badge': return <Badge tone="gold">{String(v).replace(/_/g, ' ')}</Badge>;
    default: return String(v);
  }
}

export async function generateMetadata({ params }: { params: Promise<{ resource: string }> }) {
  const def = resourceBySlug((await params).resource);
  return { title: def?.title ?? 'Manage' };
}

export default async function ResourceList({ params, searchParams }: { params: Promise<{ resource: string }>; searchParams: Promise<{ q?: string; page?: string; ok?: string }> }) {
  const def = resourceBySlug((await params).resource);
  if (!def) notFound();
  const { access } = await requireAccess(def.view);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();
  const { rows, total, error } = await listRows(supabase, def, { q: sp.q, page, pageSize: PAGE_SIZE });
  const canWrite = access.hasAny(def.write);
  const key = pkOf(def);

  const columns: Column<Row>[] = def.columns.map((c, i) => ({
    header: c.header,
    cell: (row) => (i === 0 ? <Link className="font-medium underline-offset-2 hover:underline" href={`/manage/${def.slug}/${encodeURIComponent(String(row[key]))}`}>{render(row, c)}</Link> : render(row, c)),
  }));

  return (
    <>
      <PageHeader title={def.title} description={def.description} actions={canWrite && def.allowCreate ? <Link className="btn-primary" href={`/manage/${def.slug}/new`}>Add {def.singular}</Link> : undefined} />
      <Flash ok={sp.ok} />
      <form action={`/manage/${def.slug}`} className="mb-4 flex gap-2">
        <input name="q" defaultValue={sp.q} placeholder={`Search ${def.title.toLowerCase()}`} aria-label="Search" className="input max-w-sm" />
        <button className="btn-outline">Search</button>
      </form>
      <div className="card overflow-hidden">
        {error ? <EmptyBox title="Could not load this list">Please refresh. If it continues, you may not have permission.</EmptyBox> : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(r) => String(r[key])} empty={<EmptyBox title={sp.q ? 'No matches' : `No ${def.title.toLowerCase()} yet`}>{canWrite && def.allowCreate && !sp.q ? `Add the first ${def.singular} to get started.` : undefined}</EmptyBox>} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} base={`/manage/${def.slug}`} params={{ q: sp.q }} />
          </>
        )}
      </div>
    </>
  );
}
