import Link from 'next/link';
import { formatNaira } from '@infinity/core';
import { BarChart, RankBars } from '@/components/charts';
import { Badge, DataTable, EmptyBox, FilterBar, PageHeader, StatCard } from '@/components/ui';
import { requireAccess } from '@/lib/auth';
import { fmtDateTime, fmtTime, RANGES, rangeBounds } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';
import { NAV } from '@/lib/nav';

export const metadata = { title: 'Dashboard' };

interface Summary {
  revenue_kobo: number; bookings_by_status: Record<string, number>; orders_by_status: Record<string, number>;
  new_customers: number | null; low_stock_items: number; active_memberships: number | null; failed_payments: number;
  upcoming_appointments: number; top_treatments: { name: string; bookings: number; value_kobo: number }[];
  top_products: { name: string; units: number; value_kobo: number }[]; branch_performance: { name: string; revenue_kobo: number }[];
}

const sum = (o: Record<string, number>, skip: string[] = []) => Object.entries(o).filter(([k]) => !skip.includes(k)).reduce((n, [, v]) => n + v, 0);

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ range?: string; branch?: string }> }) {
  const { access, user } = await requireAccess();
  const sp = await searchParams;

  if (!access.hasAny('reports.view')) {
    const links = NAV.flatMap((g) => g.items).filter((i) => i.permission && access.hasAny(i.permission) && i.href !== '/');
    return (
      <>
        <PageHeader title="Welcome" description={`Signed in as ${user.email}. Choose an area to work in.`} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((l) => <Link key={l.href} href={l.href} className="card p-5 font-medium hover:border-ink">{l.label}</Link>)}
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const { from, to, key } = rangeBounds(sp.range);
  const permitted = access.branches('reports.view');
  const { data: allBranches } = await supabase.from('branches').select('id, name').eq('is_active', true).order('display_order');
  const branches = (allBranches ?? []).filter((b) => permitted === 'all' || permitted.includes(b.id));
  const branch = branches.some((b) => b.id === sp.branch) ? sp.branch : undefined;

  const args = { p_from: from.toISOString(), p_to: to.toISOString(), p_branch: branch ?? null };
  const [summaryRes, seriesRes, recentRes, upcomingRes] = await Promise.all([
    supabase.rpc('dashboard_summary', args),
    supabase.rpc('revenue_by_day', args),
    access.hasAny('payments.view')
      ? supabase.from('payments').select('id, reference, purpose, amount_kobo, status, provider, created_at').order('created_at', { ascending: false }).limit(8)
      : Promise.resolve({ data: [] }),
    access.hasAny('bookings.view')
      ? supabase.from('bookings').select('id, reference, service_name, starts_at, status, branches(name, timezone)').in('status', ['confirmed', 'pending']).gte('starts_at', new Date().toISOString()).order('starts_at').limit(8).returns<{ id: string; reference: string; service_name: string; starts_at: string; status: string; branches: { name: string; timezone: string } | null }[]>()
      : Promise.resolve({ data: [] }),
  ]);

  const s = summaryRes.data as unknown as Summary | null;
  if (summaryRes.error || !s) {
    return <><PageHeader title="Dashboard" /><EmptyBox title="Could not load the dashboard">{summaryRes.error?.message.includes('forbidden') ? 'You do not have reporting access for this branch.' : 'Please refresh the page. If this continues, contact support.'}</EmptyBox></>;
  }
  const series = (seriesRes.data ?? []).map((d) => ({ key: d.day, label: new Date(`${d.day}T00:00:00Z`).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', timeZone: 'UTC' }), value: Number(d.revenue_kobo) }));

  return (
    <>
      <PageHeader title="Dashboard" description="Live figures from your bookings, store and payments." />
      <FilterBar action="/" reset>
        <div><label htmlFor="range" className="label">Period</label>
          <select id="range" name="range" defaultValue={key} className="input">{RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select></div>
        {branches.length > 1 ? (
          <div><label htmlFor="branch" className="label">Branch</label>
            <select id="branch" name="branch" defaultValue={branch ?? ''} className="input"><option value="">All branches</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        ) : null}
      </FilterBar>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue" value={formatNaira(Number(s.revenue_kobo))} hint="Successful payments in period" />
        <StatCard label="Bookings" value={sum(s.bookings_by_status, ['cancelled', 'expired']).toLocaleString()} hint={`${s.upcoming_appointments} confirmed in the next 7 days`} />
        <StatCard label="Orders" value={sum(s.orders_by_status, ['cancelled']).toLocaleString()} hint={`${s.orders_by_status.placed ?? 0} awaiting payment`} />
        {s.new_customers !== null ? <StatCard label="New customers" value={s.new_customers.toLocaleString()} /> : <StatCard label="Failed payments" value={s.failed_payments} tone={s.failed_payments ? 'warn' : undefined} />}
        <StatCard label="Low-stock items" value={s.low_stock_items} tone={s.low_stock_items ? 'warn' : undefined} hint="At or below threshold" />
        {s.active_memberships !== null ? <StatCard label="Active memberships" value={s.active_memberships} /> : null}
        {s.new_customers !== null ? <StatCard label="Failed payments" value={s.failed_payments} tone={s.failed_payments ? 'warn' : undefined} /> : null}
      </div>

      <section className="card mt-6 p-5">
        <h2 className="mb-3 text-xl">Revenue by day</h2>
        <BarChart data={series} label="Revenue by day" />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card p-5"><h2 className="mb-4 text-xl">Top treatments</h2>
          <RankBars money={false} unit="bookings" rows={s.top_treatments.map((t) => ({ name: t.name, value: t.bookings, sub: formatNaira(Number(t.value_kobo)) }))} /></section>
        <section className="card p-5"><h2 className="mb-4 text-xl">Top products</h2>
          <RankBars money={false} unit="sold" rows={s.top_products.map((t) => ({ name: t.name, value: Number(t.units), sub: formatNaira(Number(t.value_kobo)) }))} /></section>
        <section className="card p-5"><h2 className="mb-4 text-xl">Branch performance</h2>
          <RankBars rows={s.branch_performance.map((b) => ({ name: b.name, value: Number(b.revenue_kobo) }))} /></section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {access.hasAny('bookings.view') ? (
          <section className="card overflow-hidden"><h2 className="p-5 pb-3 text-xl">Upcoming appointments</h2>
            <DataTable rows={upcomingRes.data ?? []} rowKey={(b) => b.id} empty={<p className="px-5 pb-5 text-sm text-grey-600">No upcoming appointments.</p>}
              columns={[
                { header: 'When', cell: (b) => fmtDateTime(b.starts_at, b.branches?.timezone) },
                { header: 'Treatment', cell: (b) => <Link className="font-medium underline-offset-2 hover:underline" href={`/bookings/${b.id}`}>{b.service_name}</Link> },
                { header: 'Branch', cell: (b) => b.branches?.name ?? '' },
              ]} /></section>
        ) : null}
        {access.hasAny('payments.view') ? (
          <section className="card overflow-hidden"><h2 className="p-5 pb-3 text-xl">Recent transactions</h2>
            <DataTable rows={recentRes.data ?? []} rowKey={(p) => p.id} empty={<p className="px-5 pb-5 text-sm text-grey-600">No transactions yet.</p>}
              columns={[
                { header: 'When', cell: (p) => `${fmtDateTime(p.created_at)}` },
                { header: 'Type', cell: (p) => p.purpose.replace('_', ' ') },
                { header: 'Amount', cell: (p) => formatNaira(Number(p.amount_kobo)), align: 'right' },
                { header: 'Status', cell: (p) => <Badge tone={p.status === 'succeeded' ? 'success' : p.status === 'failed' ? 'danger' : 'neutral'}>{p.status}</Badge> },
              ]} /></section>
        ) : null}
      </div>
      <p className="mt-6 text-xs text-grey-600">Times shown in West Africa Time. Last updated {fmtTime(new Date().toISOString())}.</p>
    </>
  );
}
