import Link from 'next/link';
import { formatNaira } from '@infinity/core';
import { Badge, DataTable, EmptyBox, FilterBar, Flash, PageHeader, Pagination } from '@/components/ui';
import { requireAccess } from '@/lib/auth';
import { fmtDateTime } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';
import { PAGE_SIZE, bookingTone, label, pageNumber, rangeFor } from '@/lib/ui-helpers';

export const metadata = { title: 'Bookings' };

interface Row {
  id: string; reference: string; status: string; starts_at: string; service_name: string; total_kobo: number; paid_kobo: number;
  branches: { name: string; timezone: string } | null; staff: { full_name: string } | null; profiles: { full_name: string | null; phone: string | null } | null;
}
const STATUSES = ['pending', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show', 'expired'];

export default async function Bookings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { access } = await requireAccess('bookings.view');
  const sp = await searchParams;
  const page = pageNumber(sp.page);
  const supabase = await createClient();
  const { data: branches } = await supabase.from('branches').select('id, name').eq('is_active', true).order('display_order');

  let q = supabase.from('bookings')
    .select('id, reference, status, starts_at, service_name, total_kobo, paid_kobo, branches(name, timezone), staff(full_name), profiles(full_name, phone)', { count: 'exact' })
    .order('starts_at', { ascending: sp.when === 'upcoming' });
  if (sp.status && STATUSES.includes(sp.status)) q = q.eq('status', sp.status as 'pending');
  if (sp.branch) q = q.eq('branch_id', sp.branch);
  if (sp.when === 'upcoming') q = q.gte('starts_at', new Date().toISOString());
  if (sp.from) q = q.gte('starts_at', `${sp.from}T00:00:00+01:00`);
  if (sp.to) q = q.lte('starts_at', `${sp.to}T23:59:59+01:00`);
  const ref = (sp.q ?? '').replace(/[^A-Za-z0-9-]/g, '');
  if (ref) q = q.ilike('reference', `%${ref}%`);
  const { range } = { range: rangeFor(page) };
  const { data, count, error } = await q.range(range.from, range.to).returns<Row[]>();

  return (
    <>
      <PageHeader title="Bookings" description="Appointments across your branches." actions={access.hasAny('bookings.create') ? <Link href="/bookings/new" className="btn-primary">New booking</Link> : undefined} />
      <Flash ok={sp.ok} />
      <FilterBar action="/bookings" reset>
        <div><label className="label" htmlFor="q">Reference</label><input id="q" name="q" defaultValue={sp.q} placeholder="BK-…" className="input w-40" /></div>
        <div><label className="label" htmlFor="status">Status</label><select id="status" name="status" defaultValue={sp.status ?? ''} className="input"><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div>
        <div><label className="label" htmlFor="branch">Branch</label><select id="branch" name="branch" defaultValue={sp.branch ?? ''} className="input"><option value="">All</option>{(branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div><label className="label" htmlFor="when">Show</label><select id="when" name="when" defaultValue={sp.when ?? ''} className="input"><option value="">Newest first</option><option value="upcoming">Upcoming first</option></select></div>
        <div><label className="label" htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={sp.from} className="input" /></div>
        <div><label className="label" htmlFor="to">To</label><input id="to" name="to" type="date" defaultValue={sp.to} className="input" /></div>
      </FilterBar>
      <div className="card overflow-hidden">
        {error ? <EmptyBox title="Could not load bookings" /> : (
          <>
            <DataTable rows={data ?? []} rowKey={(r) => r.id} empty={<EmptyBox title="No bookings match" />}
              columns={[
                { header: 'Reference', cell: (r) => <Link className="font-medium underline-offset-2 hover:underline" href={`/bookings/${r.id}`}>{r.reference}</Link> },
                { header: 'When', cell: (r) => fmtDateTime(r.starts_at, r.branches?.timezone) },
                { header: 'Treatment', cell: (r) => r.service_name },
                { header: 'Customer', cell: (r) => r.profiles?.full_name ?? '—' },
                { header: 'Staff', cell: (r) => r.staff?.full_name ?? '—' },
                { header: 'Branch', cell: (r) => r.branches?.name ?? '' },
                { header: 'Paid', cell: (r) => `${formatNaira(Number(r.paid_kobo))} / ${formatNaira(Number(r.total_kobo))}`, align: 'right' },
                { header: 'Status', cell: (r) => <Badge tone={bookingTone(r.status)}>{label(r.status)}</Badge> },
              ]} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} base="/bookings" params={sp} />
          </>
        )}
      </div>
    </>
  );
}
