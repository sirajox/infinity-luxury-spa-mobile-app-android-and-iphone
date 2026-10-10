import { formatNaira } from '@infinity/core';
import { ConfirmAction } from '@/components/confirm';
import { ActionForm, TextField } from '@/components/form';
import { Badge, DataTable, EmptyBox, PageHeader, type Tone } from '@/components/ui';
import { requireAccess } from '@/lib/auth';
import { fmtDateTime } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';
import { label } from '@/lib/ui-helpers';
import { processRefund, rejectRefund, requestRefund } from './actions';

export const metadata = { title: 'Refunds' };

interface Row { id: string; amount_kobo: number; reason: string; status: string; failure_reason: string | null; created_at: string; completed_at: string | null; payments: { reference: string; provider: string; profiles: { full_name: string | null } | null } | null }
const tone = (s: string): Tone => (s === 'completed' ? 'success' : s === 'rejected' || s === 'failed' ? 'danger' : s === 'requested' ? 'gold' : 'neutral');

export default async function Refunds() {
  const { access } = await requireAccess('payments.view');
  const supabase = await createClient();
  const { data } = await supabase.from('refunds').select('id, amount_kobo, reason, status, failure_reason, created_at, completed_at, payments(reference, provider, profiles(full_name))').order('created_at', { ascending: false }).limit(100).returns<Row[]>();
  const canAct = access.hasAny('refunds.create');
  const pending = (data ?? []).filter((r) => r.status === 'requested' || r.status === 'failed');

  return (
    <>
      <PageHeader title="Refunds" description="Cancellations and duplicate payments create refund requests automatically. Review, then send to the payment provider or decline." />
      {pending.length > 0 ? <p className="mb-4 text-sm"><Badge tone="gold">{pending.length} awaiting action</Badge></p> : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="card overflow-hidden">
          <DataTable rows={data ?? []} rowKey={(r) => r.id} empty={<EmptyBox title="No refunds yet" />}
            columns={[
              { header: 'Requested', cell: (r) => fmtDateTime(r.created_at) },
              { header: 'Customer', cell: (r) => r.payments?.profiles?.full_name ?? '—' },
              { header: 'Payment', cell: (r) => <span className="text-xs">{r.payments?.reference}<br />{r.payments?.provider}</span> },
              { header: 'Amount', cell: (r) => formatNaira(Number(r.amount_kobo)), align: 'right' },
              { header: 'Reason', cell: (r) => <>{label(r.reason)}{r.failure_reason ? <span className="block text-xs text-danger">{r.failure_reason}</span> : null}</> },
              { header: 'Status', cell: (r) => <Badge tone={tone(r.status)}>{label(r.status)}</Badge> },
              { header: '', cell: (r) => canAct && (r.status === 'requested' || r.status === 'failed') ? (
                <div className="flex gap-2">
                  <ConfirmAction small tone="primary" action={processRefund} buttonLabel="Process" title="Send this refund to the provider?" confirmLabel="Refund now" hidden={{ id: r.id }}
                    body={<>This sends {formatNaira(Number(r.amount_kobo))} back to the customer through {r.payments?.provider}. It cannot be undone.</>} />
                  <ConfirmAction small action={rejectRefund} buttonLabel="Decline" title="Decline this refund?" confirmLabel="Decline" hidden={{ id: r.id }} body="The customer will not be refunded. Record why.">
                    <TextField label="Reason" name="reason" required />
                  </ConfirmAction>
                </div>
              ) : null },
            ]} />
        </div>
        {canAct ? (
          <aside className="card h-fit p-5"><h2 className="mb-3 text-xl">Request a refund</h2>
            <ActionForm action={requestRefund} submitLabel="Request refund" submitTone="gold">
              <TextField label="Payment reference" name="reference" placeholder="PAY-…" required />
              <TextField label="Amount (₦)" name="amount" required help="Cannot exceed what was paid and not yet refunded." />
              <TextField label="Reason" name="reason" required />
            </ActionForm></aside>
        ) : null}
      </div>
    </>
  );
}
