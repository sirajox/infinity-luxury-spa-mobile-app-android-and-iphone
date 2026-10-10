import Link from 'next/link';
import { ActionForm, SelectField } from '@/components/form';
import { EmptyBox, PageHeader } from '@/components/ui';
import { requireAccess } from '@/lib/auth';
import { todayLagos } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';
import { createBookingAction } from '../actions';

export const metadata = { title: 'New booking' };

/** Staff booking for a walk-in or phone customer. Each step narrows the choices; the final times come from the availability function. */
export default async function NewBooking({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { access } = await requireAccess('bookings.create');
  const sp = await searchParams;
  const supabase = await createClient();
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
    return `/bookings/new?${p}`;
  };

  // Step 1: customer
  const term = (sp.q ?? '').replace(/[%_,()*\\]/g, ' ').trim();
  const customers = term.length >= 2
    ? (await supabase.from('profiles').select('id, full_name, phone, email').or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`).is('deleted_at', null).limit(8)).data ?? []
    : [];
  const customer = sp.customer ? (await supabase.from('profiles').select('id, full_name, phone').eq('id', sp.customer).maybeSingle()).data : null;

  // Step 2+: treatment → branch → staff → date → time
  const permitted = access.branches('bookings.create');
  const [services, allBranches] = await Promise.all([
    supabase.from('services').select('id, name').eq('is_active', true).neq('price_type', 'quote').order('name'),
    supabase.from('branches').select('id, name').eq('is_active', true).eq('bookings_enabled', true).order('display_order'),
  ]);
  const branches = (allBranches.data ?? []).filter((b) => permitted === 'all' || permitted.includes(b.id));
  const staffOptions = sp.service && sp.branch
    ? ((await supabase.from('staff_services').select('staff_id, staff(id, full_name, is_active, staff_branches(branch_id))').eq('service_id', sp.service).returns<{ staff: { id: string; full_name: string; is_active: boolean; staff_branches: { branch_id: string }[] } | null }[]>()).data ?? [])
        .flatMap((r) => (r.staff && r.staff.is_active && r.staff.staff_branches.some((b) => b.branch_id === sp.branch) ? [r.staff] : []))
    : [];
  const slots = customer && sp.service && sp.branch && sp.date
    ? (await supabase.rpc('get_available_slots', { p_service: sp.service, p_branch: sp.branch, p_staff: sp.staff || null, p_date: sp.date })).data ?? []
    : [];
  const times = [...new Set(slots.map((s) => s.slot_time.slice(0, 5)))];

  return (
    <>
      <PageHeader title="New booking" description="Book an appointment on behalf of a customer. The booking is confirmed immediately; record payment on the booking page." actions={<Link href="/bookings" className="btn-outline">Cancel</Link>} />
      <div className="max-w-2xl space-y-6">
        <section className="card p-6">
          <h2 className="mb-3 text-xl">1. Customer</h2>
          {customer ? (
            <p className="text-sm"><strong>{customer.full_name}</strong> · {customer.phone ?? 'no phone'} · <Link className="text-gold-text underline" href={qs({ customer: undefined })}>change</Link></p>
          ) : (
            <>
              <form className="flex gap-2"><input name="q" defaultValue={sp.q} placeholder="Search by name, email or phone" className="input" aria-label="Search customers" /><button className="btn-outline">Search</button></form>
              <ul className="mt-3 divide-y divide-grey-200">
                {customers.map((c) => <li key={c.id} className="flex items-center justify-between py-2 text-sm"><span>{c.full_name} · {c.phone ?? c.email}</span><Link className="btn-outline btn-sm" href={qs({ customer: c.id })}>Select</Link></li>)}
                {term.length >= 2 && customers.length === 0 ? <li className="py-2 text-sm text-grey-600">No customers found. Customers must have an account to be booked; ask them to register in the app.</li> : null}
              </ul>
            </>
          )}
        </section>

        {customer ? (
          <section className="card p-6">
            <h2 className="mb-3 text-xl">2. Treatment, branch and staff</h2>
            <form className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="customer" value={customer.id} />
              <div><label className="label" htmlFor="service">Treatment</label><select id="service" name="service" defaultValue={sp.service ?? ''} className="input"><option value="">Choose…</option>{(services.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><label className="label" htmlFor="branch">Branch</label><select id="branch" name="branch" defaultValue={sp.branch ?? ''} className="input"><option value="">Choose…</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
              <div><label className="label" htmlFor="staff">Staff</label><select id="staff" name="staff" defaultValue={sp.staff ?? ''} className="input"><option value="">Any available</option>{staffOptions.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></div>
              <div><label className="label" htmlFor="date">Date</label><input id="date" name="date" type="date" min={todayLagos()} defaultValue={sp.date} className="input" /></div>
              <div className="sm:col-span-2"><button className="btn-outline">Find available times</button></div>
            </form>
          </section>
        ) : null}

        {customer && sp.service && sp.branch && sp.date ? (
          <section className="card p-6">
            <h2 className="mb-3 text-xl">3. Time</h2>
            {times.length === 0 ? <EmptyBox title="No times available">Try another date, staff member or branch.</EmptyBox> : (
              <ActionForm action={createBookingAction} submitLabel="Create booking" submitTone="gold">
                <input type="hidden" name="customer" value={customer.id} /><input type="hidden" name="service" value={sp.service} /><input type="hidden" name="branch" value={sp.branch} />
                <input type="hidden" name="staff" value={sp.staff ?? ''} /><input type="hidden" name="date" value={sp.date} />
                <SelectField label="Available times" name="time" options={times.map((t) => ({ value: t, label: t }))} />
              </ActionForm>
            )}
          </section>
        ) : null}
      </div>
    </>
  );
}
