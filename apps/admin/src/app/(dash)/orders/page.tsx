import Link from 'next/link';
import { formatNaira, ORDER_STATUSES } from '@infinity/core';
import { Badge, DataTable, EmptyBox, FilterBar, Flash, PageHeader, Pagination } from '@/components/ui';
import { requireAccess } from '@/lib/auth';
import { fmtDateTime } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';
import { PAGE_SIZE, label, orderTone, pageNumber, rangeFor } from '@/lib/ui-helpers';

export const metadata = { title: 'Orders' };

interface Row { id: string; number: string; status: string; fulfilment: string; total_kobo: number; created_at: string; contact_name: string | null; branches: { name: string } | null }

export default async function Orders({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAccess('orders.view');
  const sp = await searchParams;
  const page = pageNumber(sp.page);
  const supabase = await createClient();
  const { data: branches } = await supabase.from('branches').select('id, name').eq('is_active', true).order('display_order');
  let q = supabase.from('orders').select('id, number, status, fulfilment, total_kobo, created_at, contact_name, branches(name)', { count: 'exact' }).order('created_at', { ascending: false });
  if (sp.status && (ORDER_STATUSES as readonly string[]).includes(sp.status)) q = q.eq('status', sp.status as 'placed');
  if (sp.branch) q = q.eq('branch_id', sp.branch);
  const n = (sp.q ?? '').replace(/[^A-Za-z0-9-]/g, '');
  if (n) q = q.ilike('number', `%${n}%`);
  const r = rangeFor(page);
  const { data, count } = await q.range(r.from, r.to).returns<Row[]>();

  return (
    <>
      <PageHeader title="Orders" description="Store orders. Unpaid orders hold stock briefly, then release it automatically." />
      <Flash ok={sp.ok} />
      <FilterBar action="/orders" reset>
        <div><label className="label" htmlFor="q">Order number</label><input id="q" name="q" defaultValue={sp.q} placeholder="INF-…" className="input w-40" /></div>
        <div><label className="label" htmlFor="status">Status</label><select id="status" name="status" defaultValue={sp.status ?? ''} className="input"><option value="">All</option>{ORDER_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div>
        <div><label className="label" htmlFor="branch">Branch</label><select id="branch" name="branch" defaultValue={sp.branch ?? ''} className="input"><option value="">All</option>{(branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      </FilterBar>
      <div className="card overflow-hidden">
        <DataTable rows={data ?? []} rowKey={(o) => o.id} empty={<EmptyBox title="No orders match" />}
          columns={[
            { header: 'Order', cell: (o) => <Link className="font-medium underline-offset-2 hover:underline" href={`/orders/${o.id}`}>{o.number}</Link> },
            { header: 'Placed', cell: (o) => fmtDateTime(o.created_at) },
            { header: 'Customer', cell: (o) => o.contact_name ?? '—' },
            { header: 'Branch', cell: (o) => o.branches?.name ?? '' },
            { header: 'Method', cell: (o) => label(o.fulfilment) },
            { header: 'Total', cell: (o) => formatNaira(Number(o.total_kobo)), align: 'right' },
            { header: 'Status', cell: (o) => <Badge tone={orderTone(o.status)}>{label(o.status)}</Badge> },
          ]} />
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} base="/orders" params={sp} />
      </div>
    </>
  );
}
