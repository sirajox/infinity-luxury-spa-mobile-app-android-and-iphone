import Link from 'next/link';
import { zonedTimeToUtc } from '@infinity/core';
import { Badge, EmptyBox, PageHeader } from '@/components/ui';
import { requireAccess } from '@/lib/auth';
import { fmtTime, todayLagos } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';
import { bookingTone, label } from '@/lib/ui-helpers';

export const metadata = { title: 'Calendar' };

interface B { id: string; reference: string; service_name: string; starts_at: string; ends_at: string; status: string; staff_id: string; profiles: { full_name: string | null } | null }

const shift = (date: string, days: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

/** Day agenda per specialist for one branch. Times are shown in the branch's timezone. */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ date?: string; branch?: string }> }) {
  const { access } = await requireAccess('bookings.view');
  const sp = await searchParams;
  const supabase = await createClient();
  const permitted = access.branches('bookings.view');
  const { data: all } = await supabase.from('branches').select('id, name, timezone').eq('is_active', true).order('display_order');
  const branches = (all ?? []).filter((b) => permitted === 'all' || permitted.includes(b.id));
  const branch = branches.find((b) => b.id === sp.branch) ?? branches[0];
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? (sp.date as string) : todayLagos();
  if (!branch) return <><PageHeader title="Calendar" /><EmptyBox title="No branches available" /></>;

  const start = zonedTimeToUtc(date, '00:00', branch.timezone).toISOString();
  const end = zonedTimeToUtc(shift(date, 1), '00:00', branch.timezone).toISOString();
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  const [staffRes, bookingsRes, hoursRes, leaveRes] = await Promise.all([
    supabase.from('staff_branches').select('staff(id, full_name, is_active)').eq('branch_id', branch.id).returns<{ staff: { id: string; full_name: string; is_active: boolean } | null }[]>(),
    supabase.from('bookings').select('id, reference, service_name, starts_at, ends_at, status, staff_id, profiles(full_name)').eq('branch_id', branch.id).gte('starts_at', start).lt('starts_at', end).not('status', 'in', '(cancelled,expired)').order('starts_at').returns<B[]>(),
    supabase.from('staff_working_hours').select('staff_id, starts, ends').eq('branch_id', branch.id).eq('day_of_week', dow),
    supabase.from('staff_leave').select('staff_id').lte('starts_on', date).gte('ends_on', date),
  ]);
  const staff = (staffRes.data ?? []).flatMap((r) => (r.staff?.is_active ? [r.staff] : []));
  const onLeave = new Set((leaveRes.data ?? []).map((l) => l.staff_id));
  const hoursBy = new Map((hoursRes.data ?? []).map((h) => [h.staff_id, h]));
  const heading = new Intl.DateTimeFormat('en-NG', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00Z`));
  const link = (patch: Record<string, string>) => `/calendar?${new URLSearchParams({ date, branch: branch.id, ...patch })}`;

  return (
    <>
      <PageHeader title="Calendar" description={`${branch.name} · ${heading}`} actions={<>
        <Link className="btn-outline" href={link({ date: shift(date, -1) })}>← Previous</Link>
        <Link className="btn-outline" href={link({ date: todayLagos() })}>Today</Link>
        <Link className="btn-outline" href={link({ date: shift(date, 1) })}>Next →</Link>
      </>} />
      <form className="mb-5 flex flex-wrap items-end gap-3">
        <div><label className="label" htmlFor="branch">Branch</label><select id="branch" name="branch" defaultValue={branch.id} className="input">{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div><label className="label" htmlFor="date">Date</label><input id="date" type="date" name="date" defaultValue={date} className="input" /></div>
        <button className="btn-primary">Go</button>
      </form>
      {staff.length === 0 ? <EmptyBox title="No staff assigned to this branch">Assign staff under Staff → Works at branches.</EmptyBox> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {staff.map((s) => {
            const mine = (bookingsRes.data ?? []).filter((b) => b.staff_id === s.id);
            const h = hoursBy.get(s.id);
            return (
              <section key={s.id} className="card overflow-hidden">
                <header className="border-b border-grey-200 bg-grey-50 px-4 py-3">
                  <h2 className="font-sans text-base font-semibold">{s.full_name}</h2>
                  <p className="text-xs text-grey-600">{onLeave.has(s.id) ? 'On leave' : h ? `Working ${h.starts.slice(0, 5)}–${h.ends.slice(0, 5)}` : 'Not working today'}</p>
                </header>
                <ul className="divide-y divide-grey-200">
                  {mine.map((b) => (
                    <li key={b.id} className="px-4 py-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold tabular-nums">{fmtTime(b.starts_at, branch.timezone)}–{fmtTime(b.ends_at, branch.timezone)}</span>
                        <Badge tone={bookingTone(b.status)}>{label(b.status)}</Badge>
                      </div>
                      <Link href={`/bookings/${b.id}`} className="mt-0.5 block font-medium underline-offset-2 hover:underline">{b.service_name}</Link>
                      <p className="text-xs text-grey-600">{b.profiles?.full_name ?? 'Customer'} · {b.reference}</p>
                    </li>
                  ))}
                  {mine.length === 0 ? <li className="px-4 py-4 text-sm text-grey-600">No appointments.</li> : null}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
