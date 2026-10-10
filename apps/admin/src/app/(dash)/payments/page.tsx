import Link from 'next/link';
import { formatNaira, PAYMENT_STATUSES } from '@infinity/core';
import { Badge, DataTable, EmptyBox, FilterBar, PageHeader, Pagination } from '@/components/ui';
import { requireAccess } from '@/lib/auth';
import { fmtDateTime } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';
import { PAGE_SIZE, label, pageNumber, paymentTone, rangeFor } from '@/lib/ui-helpers';

export const metadata = { title: 'Payments' };

interface Row { id: string; reference: string; provider: string; purpose: string; amount_kobo: number; status: string; created_at: string; booking_id: string | null; order_id: string | null; failure_reason: string | null; profiles: { full_name: string | null } | null }

export default async function Payments({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAccess('payments.view');
  const sp = await searchParams;
  const page = pageNumber(sp.page);
  const supabase = await createClient();
  let q = supabase.from('payments').select('id, reference, provider, purpose, amount_kobo, status, created_at, booking_id, order_id, failure_reason, profiles(full_name)', { count: 'exact' }).order('created_at', { ascending: false });
  if (sp.status && (PAYMENT_STATUSES as readonly string[]).includes(sp.status)) q = q.eq('status', sp.status as 'pending');
  if (sp.provider === 'paystack' || sp.provider === 'flutterwave' || sp.provider === 'manual') q = q.eq('provider', sp.provider);
  if (sp.from) q = q.gte('created_at', `${sp.from}T00:00:00+01:00`);
  if (sp.to) q = q.lte('created_at', `${sp.to}T23:59:59+01:00`);
  const ref = (sp.q ?? '').replace(/[^A-Za-z0-9-]/g, '');
  if (ref) q = q.ilike('reference', `%${ref}%`);
  const r = rangeFor(page);
  const { data, count } = await q.range(r.from, r.to).returns<Row[]>();
  const exportQs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== 'page') as [string, string][]).toString();

  return (
    <>
      <PageHeader title="Payments" description="Every online and in-branch payment. Online payments are only marked successful after the provider confirms them." actions={<Link className="btn-outline" href={`/api/export/payments?${exportQs}`}>Export CSV</Link>} />
      <FilterBar action="/payments" reset>
        <div><label className="label" htmlFor="q">Reference</label><input id="q" name="q" defaultValue={sp.q} placeholder="PAY-…" className="input w-44" /></div>
        <div><label className="label" htmlFor="status">Status</label><select id="status" name="status" defaultValue={sp.status ?? ''} className="input"><option value="">All</option>{PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div>
        <div><label className="label" htmlFor="provider">Provider</label><select id="provider" name="provider" defaultValue={sp.provider ?? ''} className="input"><option value="">All</option><option value="paystack">Paystack</option><option value="flutterwave">Flutterwave</option><option value="manual">Recorded at branch</option></select></div>
        <div><label className="label" htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={sp.from} className="input" /></div>
        <div><label className="label" htmlFor="to">To</label><input id="to" name="to" type="date" defaultValue={sp.to} className="input" /></div>
      </FilterBar>
      <div className="card overflow-hidden">
        <DataTable rows={data ?? []} rowKey={(p) => p.id} empty={<EmptyBox title="No payments match" />}
          columns={[
            { header: 'Reference', cell: (p) => <span className="font-medium">{p.reference}</span> },
            { header: 'Date', cell: (p) => fmtDateTime(p.created_at) },
            { header: 'Customer', cell: (p) => p.profiles?.full_name ?? '—' },
            { header: 'For', cell: (p) => p.booking_id ? <Link className="hover:underline" href={`/bookings/${p.booking_id}`}>Booking</Link> : p.order_id ? <Link className="hover:underline" href={`/orders/${p.order_id}`}>Order</Link> : label(p.purpose) },
            { header: 'Provider', cell: (p) => (p.provider === 'manual' ? 'Branch' : p.provider) },
            { header: 'Amount', cell: (p) => formatNaira(Number(p.amount_kobo)), align: 'right' },
            { header: 'Status', cell: (p) => <><Badge tone={paymentTone(p.status)}>{label(p.status)}</Badge>{p.failure_reason ? <span className="mt-1 block max-w-[16rem] truncate text-xs text-grey-600" title={p.failure_reason}>{p.failure_reason}</span> : null}</> },
          ]} />
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} base="/payments" params={sp} />
      </div>
    </>
  );
}
