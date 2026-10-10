import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BOOKING_TRANSITIONS, formatNaira, type BookingStatus } from '@infinity/core';
import { ConfirmAction } from '@/components/confirm';
import { ActionForm, SelectField, SubmitButton, TextArea, TextField } from '@/components/form';
import { Badge, Flash, PageHeader } from '@/components/ui';
import { requireAccess } from '@/lib/auth';
import { fmtDateTime } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';
import { bookingTone, label, paymentTone } from '@/lib/ui-helpers';
import { cancelBookingAction, recordPaymentAction, rescheduleAction, saveBookingNotes, setBookingStatus } from '../actions';

interface Booking {
  id: string; reference: string; status: BookingStatus; starts_at: string; ends_at: string; service_name: string; service_id: string; branch_id: string; staff_id: string;
  total_kobo: number; paid_kobo: number; due_now_kobo: number; payment_option: string; notes: string | null; cancellation_reason: string | null; created_at: string; user_id: string | null;
  branches: { name: string; timezone: string } | null; staff: { full_name: string } | null; profiles: { full_name: string | null; phone: string | null; email: string | null } | null;
}

export default async function BookingDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; rdate?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { access } = await requireAccess('bookings.view');
  const supabase = await createClient();
  const { data: b } = await supabase.from('bookings')
    .select('*, branches(name, timezone), staff(full_name), profiles(full_name, phone, email)').eq('id', id).maybeSingle().returns<Booking | null>();
  if (!b) notFound();

  const [history, payments, slots] = await Promise.all([
    supabase.from('booking_status_history').select('id, from_status, to_status, created_at').eq('booking_id', id).order('created_at'),
    supabase.from('payments').select('id, reference, provider, amount_kobo, status, paid_at, created_at, metadata').eq('booking_id', id).order('created_at', { ascending: false }),
    sp.rdate ? supabase.rpc('get_available_slots', { p_service: b.service_id, p_branch: b.branch_id, p_staff: b.staff_id, p_date: sp.rdate, p_exclude_booking: b.id }) : Promise.resolve({ data: [] as { slot_time: string }[] }),
  ]);

  const tz = b.branches?.timezone ?? 'Africa/Lagos';
  const canUpdate = access.has('bookings.update', b.branch_id);
  const canCancel = access.has('bookings.cancel', b.branch_id);
  const canMoney = access.has('payments.view', b.branch_id) && canUpdate;
  const balance = b.total_kobo - b.paid_kobo;
  const next = BOOKING_TRANSITIONS[b.status].filter((s) => !['cancelled', 'expired'].includes(s));
  const active = ['pending', 'confirmed', 'checked_in'].includes(b.status);
  const uniqueSlots = [...new Set((slots.data ?? []).map((s) => s.slot_time.slice(0, 5)))];

  return (
    <>
      <PageHeader title={b.reference} description={`${b.service_name} · ${fmtDateTime(b.starts_at, tz)}`} actions={<><Badge tone={bookingTone(b.status)}>{label(b.status)}</Badge><Link className="btn-outline" href="/bookings">All bookings</Link></>} />
      <Flash ok={sp.ok} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <section className="card p-6">
            <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
              <Item k="Customer" v={b.profiles?.full_name ?? '—'} sub={[b.profiles?.phone, b.profiles?.email].filter(Boolean).join(' · ')} />
              <Item k="Branch" v={b.branches?.name ?? ''} />
              <Item k="Staff" v={b.staff?.full_name ?? '—'} />
              <Item k="Appointment" v={`${fmtDateTime(b.starts_at, tz)} – ${fmtDateTime(b.ends_at, tz).split(',').pop()?.trim()}`} />
              <Item k="Total" v={formatNaira(Number(b.total_kobo))} sub={`${b.payment_option === 'advance' ? 'Advance payment chosen' : 'Pay in full chosen'}`} />
              <Item k="Paid" v={formatNaira(Number(b.paid_kobo))} sub={balance > 0 ? `Balance ${formatNaira(balance)}` : 'Settled'} />
              {b.cancellation_reason ? <Item k="Cancellation reason" v={b.cancellation_reason} /> : null}
            </dl>
          </section>

          {canUpdate && next.length > 0 ? (
            <section className="card p-6">
              <h2 className="mb-3 text-xl">Move to next step</h2>
              <div className="flex flex-wrap gap-2">
                {next.map((s) => (
                  <ActionForm key={s} action={setBookingStatus} hideSubmit className="inline">
                    <input type="hidden" name="id" value={b.id} /><input type="hidden" name="status" value={s} />
                    <SubmitButton label={s === 'confirmed' ? 'Confirm' : s === 'no_show' ? 'Mark no-show' : `Mark ${label(s)}`} tone={s === 'no_show' ? 'outline' : 'primary'} />
                  </ActionForm>
                ))}
              </div>
            </section>
          ) : null}

          <section className="card p-6">
            <h2 className="mb-3 text-xl">Notes</h2>
            <ActionForm action={saveBookingNotes} submitLabel="Save notes" hideSubmit={!canUpdate}>
              <input type="hidden" name="id" value={b.id} />
              <TextArea label="Internal notes (not shown to the customer)" name="notes" defaultValue={b.notes} />
            </ActionForm>
          </section>

          <section className="card overflow-hidden">
            <h2 className="p-6 pb-3 text-xl">Payments</h2>
            <ul className="divide-y divide-grey-200">
              {(payments.data ?? []).map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 text-sm">
                  <span><strong>{formatNaira(Number(p.amount_kobo))}</strong> · {p.provider === 'manual' ? 'recorded at branch' : p.provider} · <span className="text-grey-600">{p.reference}</span></span>
                  <Badge tone={paymentTone(p.status)}>{label(p.status)}</Badge>
                </li>
              ))}
              {(payments.data ?? []).length === 0 ? <li className="px-6 py-4 text-sm text-grey-600">No payments yet.</li> : null}
            </ul>
          </section>
        </div>

        <aside className="space-y-6">
          {canMoney && balance > 0 && b.status !== 'cancelled' && b.status !== 'expired' ? (
            <section className="card p-5">
              <h2 className="mb-1 text-xl">Record payment at branch</h2>
              <p className="mb-3 text-xs text-grey-600">For cash or POS payments taken in person. Balance due: {formatNaira(balance)}.</p>
              <ActionForm action={recordPaymentAction} submitLabel="Record payment" submitTone="gold">
                <input type="hidden" name="id" value={b.id} />
                <TextField label="Amount (₦)" name="amount" defaultValue={String(balance / 100)} required />
                <TextField label="Note" name="note" placeholder="Cash at desk" required />
              </ActionForm>
            </section>
          ) : null}

          {canUpdate && ['pending', 'confirmed'].includes(b.status) ? (
            <section className="card p-5">
              <h2 className="mb-3 text-xl">Reschedule</h2>
              <form method="get" className="mb-3 flex items-end gap-2">
                <div className="flex-1"><label htmlFor="rdate" className="label">New date</label><input id="rdate" name="rdate" type="date" defaultValue={sp.rdate} className="input" /></div>
                <button className="btn-outline">Find times</button>
              </form>
              {sp.rdate ? (
                uniqueSlots.length ? (
                  <ActionForm action={rescheduleAction} submitLabel="Move booking">
                    <input type="hidden" name="id" value={b.id} /><input type="hidden" name="date" value={sp.rdate} />
                    <SelectField label="Available times" name="time" options={uniqueSlots.map((t) => ({ value: t, label: t }))} />
                  </ActionForm>
                ) : <p className="text-sm text-grey-600">No free times that day for {b.staff?.full_name}.</p>
              ) : null}
            </section>
          ) : null}

          {canCancel && active ? (
            <section className="card p-5">
              <h2 className="mb-2 text-xl">Cancel booking</h2>
              <p className="mb-3 text-xs text-grey-600">Staff cancellations always queue a full refund of anything paid.</p>
              <ConfirmAction action={cancelBookingAction} buttonLabel="Cancel this booking" title="Cancel this booking?" confirmLabel="Cancel booking" hidden={{ id: b.id }}
                body="The customer is notified and the time is released. Any payment is queued for refund.">
                <TextField label="Reason" name="reason" required />
              </ConfirmAction>
            </section>
          ) : null}

          <section className="card p-5">
            <h2 className="mb-3 text-xl">History</h2>
            <ol className="space-y-2 text-sm">
              {(history.data ?? []).map((h) => (
                <li key={h.id} className="flex justify-between gap-2"><span>{h.from_status ? `${label(h.from_status)} → ` : ''}<strong>{label(h.to_status)}</strong></span><span className="text-grey-600">{fmtDateTime(h.created_at)}</span></li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}

function Item({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return <div><dt className="text-xs font-medium uppercase tracking-wide text-grey-600">{k}</dt><dd className="mt-0.5 font-medium">{v}</dd>{sub ? <dd className="text-xs text-grey-600">{sub}</dd> : null}</div>;
}
