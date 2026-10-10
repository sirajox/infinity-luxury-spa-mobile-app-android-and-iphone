import Link from 'next/link';
import { formatNaira } from '@infinity/core';
import { BarChart } from '@/components/charts';
import { DataTable, FilterBar, PageHeader, StatCard } from '@/components/ui';
import { requireAccess } from '@/lib/auth';
import { RANGES, rangeBounds } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Reports' };

export default async function Reports({ searchParams }: { searchParams: Promise<{ range?: string; branch?: string }> }) {
  const { access } = await requireAccess('reports.view');
  const sp = await searchParams;
  const supabase = await createClient();
  const { from, to, key } = rangeBounds(sp.range);
  const permitted = access.branches('reports.view');
  const { data: all } = await supabase.from('branches').select('id, name').eq('is_active', true).order('display_order');
  const branches = (all ?? []).filter((b) => permitted === 'all' || permitted.includes(b.id));
  const branch = branches.some((b) => b.id === sp.branch) ? sp.branch : undefined;
  const { data } = await supabase.rpc('revenue_by_day', { p_from: from.toISOString(), p_to: to.toISOString(), p_branch: branch ?? null });
  const rows = (data ?? []).map((d) => ({ day: d.day, revenue: Number(d.revenue_kobo), bookings: d.bookings, orders: d.orders }));
  const total = rows.reduce((n, r) => n + r.revenue, 0);
  const label = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const qs = new URLSearchParams({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }).toString();

  return (
    <>
      <PageHeader title="Reports" description="Revenue and activity over time. Exports include only the records your role can see." />
      <FilterBar action="/reports" reset>
        <div><label className="label" htmlFor="range">Period</label><select id="range" name="range" defaultValue={key} className="input">{RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select></div>
        {branches.length > 1 ? <div><label className="label" htmlFor="branch">Branch</label><select id="branch" name="branch" defaultValue={branch ?? ''} className="input"><option value="">All branches</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div> : null}
      </FilterBar>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Revenue" value={formatNaira(total)} />
        <StatCard label="Bookings created" value={rows.reduce((n, r) => n + r.bookings, 0).toLocaleString()} />
        <StatCard label="Orders placed" value={rows.reduce((n, r) => n + r.orders, 0).toLocaleString()} />
      </div>
      <section className="card mb-6 p-5"><h2 className="mb-3 text-xl">Revenue by day</h2><BarChart label="Revenue by day" data={rows.map((r) => ({ key: r.day, label: label(r.day), value: r.revenue }))} /></section>
      <section className="card mb-6 p-5"><h2 className="mb-3 text-xl">Bookings per day</h2><BarChart money={false} label="Bookings per day" height={180} data={rows.map((r) => ({ key: r.day, label: label(r.day), value: r.bookings }))} /></section>
      <section className="card mb-6 p-5">
        <h2 className="mb-3 text-xl">Export</h2>
        <div className="flex flex-wrap gap-2">
          {access.hasAny('payments.view') ? <Link className="btn-outline" href={`/api/export/payments?${qs}`}>Payments (CSV)</Link> : null}
          {access.hasAny('bookings.view') ? <Link className="btn-outline" href={`/api/export/bookings?${qs}`}>Bookings (CSV)</Link> : null}
          {access.hasAny('orders.view') ? <Link className="btn-outline" href={`/api/export/orders?${qs}`}>Orders (CSV)</Link> : null}
          {access.hasAny('inventory.view') ? <Link className="btn-outline" href="/api/export/inventory">Stock levels (CSV)</Link> : null}
        </div>
      </section>
      <section className="card overflow-hidden"><h2 className="p-5 pb-3 text-xl">Daily detail</h2>
        <DataTable rows={[...rows].reverse()} rowKey={(r) => r.day}
          columns={[{ header: 'Date', cell: (r) => label(r.day) }, { header: 'Revenue', cell: (r) => formatNaira(r.revenue), align: 'right' }, { header: 'Bookings', cell: (r) => r.bookings, align: 'right' }, { header: 'Orders', cell: (r) => r.orders, align: 'right' }]} /></section>
    </>
  );
}
