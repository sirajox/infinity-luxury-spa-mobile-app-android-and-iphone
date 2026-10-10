import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatNaira } from '@infinity/core';
import { ActionForm, SelectField, TextField } from '@/components/form';
import { Badge, DataTable, PageHeader } from '@/components/ui';
import { requireAccess } from '@/lib/auth';
import { fmtDateTime } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';
import { label, orderTone, paymentTone } from '@/lib/ui-helpers';
import { updateFulfilment } from '../actions';

const NEXT: Record<string, string[]> = {
  payment_confirmed: ['processing', 'cancelled'], processing: ['ready_for_pickup', 'shipped', 'cancelled'], ready_for_pickup: ['delivered', 'cancelled'],
  shipped: ['out_for_delivery', 'delivered'], out_for_delivery: ['delivered'], delivered: [], placed: ['cancelled'], cancelled: [], refunded: [],
};

interface Order {
  id: string; number: string; status: string; fulfilment: string; subtotal_kobo: number; discount_kobo: number; delivery_fee_kobo: number; total_kobo: number; coupon_code: string | null;
  contact_name: string | null; contact_phone: string | null; shipping_address: { state?: string; city?: string; address?: string; landmark?: string } | null; branch_id: string;
  tracking_number: string | null; carrier: string | null; estimated_delivery: string | null; paid_at: string | null; created_at: string;
  branches: { name: string } | null;
  order_items: { id: string; name_snapshot: string; variant_snapshot: string; sku_snapshot: string; quantity: number; unit_price_kobo: number; line_total_kobo: number }[];
}

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access } = await requireAccess('orders.view');
  const supabase = await createClient();
  const { data: o } = await supabase.from('orders').select('*, branches(name), order_items(*)').eq('id', id).maybeSingle().returns<Order | null>();
  if (!o) notFound();
  const [history, payments] = await Promise.all([
    supabase.from('order_status_history').select('id, to_status, note, created_at').eq('order_id', id).order('created_at'),
    access.hasAny('payments.view') ? supabase.from('payments').select('id, reference, amount_kobo, status, provider, paid_at').eq('order_id', id) : Promise.resolve({ data: [] }),
  ]);
  const canUpdate = access.has('orders.update', o.branch_id);
  const options = (NEXT[o.status] ?? []).filter((s) => !(o.fulfilment === 'pickup' && s === 'shipped') && !(o.fulfilment === 'delivery' && s === 'ready_for_pickup'));

  return (
    <>
      <PageHeader title={o.number} description={`${o.branches?.name} · placed ${fmtDateTime(o.created_at)}`} actions={<><Badge tone={orderTone(o.status)}>{label(o.status)}</Badge><Link href="/orders" className="btn-outline">All orders</Link></>} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <section className="card overflow-hidden"><h2 className="p-5 pb-3 text-xl">Items</h2>
            <DataTable rows={o.order_items} rowKey={(i) => i.id}
              columns={[
                { header: 'Product', cell: (i) => <><span className="font-medium">{i.name_snapshot}</span><br /><span className="text-xs text-grey-600">{i.variant_snapshot} · {i.sku_snapshot}</span></> },
                { header: 'Qty', cell: (i) => i.quantity }, { header: 'Price', cell: (i) => formatNaira(Number(i.unit_price_kobo)), align: 'right' }, { header: 'Total', cell: (i) => formatNaira(Number(i.line_total_kobo)), align: 'right' },
              ]} />
            <dl className="space-y-1 border-t border-grey-200 p-5 text-sm">
              <Row k="Subtotal" v={formatNaira(Number(o.subtotal_kobo))} />
              {o.discount_kobo > 0 ? <Row k={`Discount${o.coupon_code ? ` (${o.coupon_code})` : ''}`} v={`-${formatNaira(Number(o.discount_kobo))}`} /> : null}
              <Row k="Delivery" v={formatNaira(Number(o.delivery_fee_kobo))} />
              <Row k="Total" v={formatNaira(Number(o.total_kobo))} strong />
            </dl>
          </section>
          <section className="card p-5"><h2 className="mb-3 text-xl">Customer & delivery</h2>
            <p className="text-sm font-medium">{o.contact_name ?? '—'} · {o.contact_phone ?? '—'}</p>
            <p className="mt-1 text-sm text-grey-600">{o.fulfilment === 'pickup' ? `Pickup at ${o.branches?.name}` : [o.shipping_address?.address, o.shipping_address?.city, o.shipping_address?.state].filter(Boolean).join(', ')}{o.shipping_address?.landmark ? ` (near ${o.shipping_address.landmark})` : ''}</p>
          </section>
          {access.hasAny('payments.view') ? (
            <section className="card overflow-hidden"><h2 className="p-5 pb-3 text-xl">Payments</h2>
              <ul className="divide-y divide-grey-200">{(payments.data ?? []).map((p) => <li key={p.id} className="flex items-center justify-between px-5 py-3 text-sm"><span><strong>{formatNaira(Number(p.amount_kobo))}</strong> · {p.provider} · {p.reference}</span><Badge tone={paymentTone(p.status)}>{label(p.status)}</Badge></li>)}
                {(payments.data ?? []).length === 0 ? <li className="px-5 py-3 text-sm text-grey-600">No payments yet.</li> : null}</ul></section>
          ) : null}
        </div>
        <aside className="space-y-6">
          {canUpdate && options.length ? (
            <section className="card p-5"><h2 className="mb-3 text-xl">Update fulfilment</h2>
              <ActionForm action={updateFulfilment} submitLabel="Update order" submitTone="gold">
                <input type="hidden" name="id" value={o.id} />
                <SelectField label="New status" name="status" options={options.map((s) => ({ value: s, label: label(s) }))} />
                <TextField label="Note to customer (optional)" name="note" />
                {o.fulfilment === 'delivery' ? <><TextField label="Tracking number" name="tracking" defaultValue={o.tracking_number} /><TextField label="Carrier" name="carrier" defaultValue={o.carrier} /><TextField label="Estimated delivery" name="eta" type="date" defaultValue={o.estimated_delivery} /></> : null}
              </ActionForm>
              <p className="mt-3 text-xs text-grey-600">Payment confirmation is automatic and cannot be set by hand. Cancelling releases reserved stock.</p>
            </section>
          ) : null}
          <section className="card p-5"><h2 className="mb-3 text-xl">Timeline</h2>
            <ol className="space-y-2 text-sm">{(history.data ?? []).map((h) => <li key={h.id}><div className="flex justify-between gap-2"><strong>{label(h.to_status)}</strong><span className="text-grey-600">{fmtDateTime(h.created_at)}</span></div>{h.note ? <p className="text-xs text-grey-600">{h.note}</p> : null}</li>)}</ol>
          </section>
        </aside>
      </div>
    </>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return <div className={`flex justify-between ${strong ? 'pt-2 text-base font-semibold' : ''}`}><dt className="text-grey-600">{k}</dt><dd>{v}</dd></div>;
}
