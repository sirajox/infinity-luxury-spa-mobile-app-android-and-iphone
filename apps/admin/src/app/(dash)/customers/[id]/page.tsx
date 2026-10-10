import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatNaira } from '@infinity/core';
import { Badge, DataTable, PageHeader, StatCard } from '@/components/ui';
import { requireAccess } from '@/lib/auth';
import { fmtDate, fmtDateTime } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';
import { bookingTone, label, orderTone } from '@/lib/ui-helpers';

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access } = await requireAccess('customers.view');
  const supabase = await createClient();
  const { data: c } = await supabase.from('profiles').select('id, full_name, email, phone, created_at, preferred_branch_id').eq('id', id).maybeSingle();
  if (!c) notFound();
  const [bookings, orders, memberships] = await Promise.all([
    access.hasAny('bookings.view') ? supabase.from('bookings').select('id, reference, service_name, starts_at, status, total_kobo, paid_kobo').eq('user_id', id).order('starts_at', { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
    access.hasAny('orders.view') ? supabase.from('orders').select('id, number, status, total_kobo, created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
    access.hasAny('memberships.manage') ? supabase.from('memberships').select('id, status, expires_at, plan_snapshot').eq('user_id', id).neq('status', 'pending') : Promise.resolve({ data: [] }),
  ]);
  const spend = (bookings.data ?? []).reduce((n, b) => n + Number(b.paid_kobo), 0) + (orders.data ?? []).filter((o) => !['placed', 'cancelled'].includes(o.status)).reduce((n, o) => n + Number(o.total_kobo), 0);

  return (
    <>
      <PageHeader title={c.full_name ?? 'Customer'} description={[c.email, c.phone].filter(Boolean).join(' · ')} actions={<Link href="/customers" className="btn-outline">All customers</Link>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Bookings" value={(bookings.data ?? []).length} />
        <StatCard label="Orders" value={(orders.data ?? []).length} />
        <StatCard label="Lifetime spend (shown records)" value={formatNaira(spend)} hint={`Customer since ${fmtDate(c.created_at)}`} />
      </div>
      {(memberships.data ?? []).length ? <p className="mb-4 text-sm">{(memberships.data ?? []).map((m) => <Badge key={m.id} tone={m.status === 'active' ? 'success' : 'neutral'}>{String((m.plan_snapshot as { name?: string })?.name ?? 'Membership')} · {m.status}</Badge>)}</p> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card overflow-hidden"><h2 className="p-5 pb-3 text-xl">Bookings</h2>
          <DataTable rows={bookings.data ?? []} rowKey={(b) => b.id} empty={<p className="px-5 pb-5 text-sm text-grey-600">No bookings visible to you.</p>}
            columns={[
              { header: 'Reference', cell: (b) => <Link className="font-medium hover:underline" href={`/bookings/${b.id}`}>{b.reference}</Link> },
              { header: 'Treatment', cell: (b) => b.service_name }, { header: 'When', cell: (b) => fmtDateTime(b.starts_at) },
              { header: 'Status', cell: (b) => <Badge tone={bookingTone(b.status)}>{label(b.status)}</Badge> },
            ]} /></section>
        <section className="card overflow-hidden"><h2 className="p-5 pb-3 text-xl">Orders</h2>
          <DataTable rows={orders.data ?? []} rowKey={(o) => o.id} empty={<p className="px-5 pb-5 text-sm text-grey-600">No orders visible to you.</p>}
            columns={[
              { header: 'Order', cell: (o) => <Link className="font-medium hover:underline" href={`/orders/${o.id}`}>{o.number}</Link> },
              { header: 'Total', cell: (o) => formatNaira(Number(o.total_kobo)) }, { header: 'Placed', cell: (o) => fmtDate(o.created_at) },
              { header: 'Status', cell: (o) => <Badge tone={orderTone(o.status)}>{label(o.status)}</Badge> },
            ]} /></section>
      </div>
    </>
  );
}
