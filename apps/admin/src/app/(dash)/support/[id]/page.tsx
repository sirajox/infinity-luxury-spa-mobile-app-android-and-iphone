import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm, SelectField, TextArea } from '@/components/form';
import { PageHeader } from '@/components/ui';
import { requireAccess } from '@/lib/auth';
import { fmtDateTime } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';
import { replyToTicket, setTicketStatus } from '../actions';

export default async function Ticket({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAccess('support.manage');
  const supabase = await createClient();
  const { data: t } = await supabase.from('support_tickets').select('id, subject, status, profiles(full_name, email, phone)').eq('id', id).maybeSingle().returns<{ id: string; subject: string; status: string; profiles: { full_name: string | null; email: string | null; phone: string | null } | null } | null>();
  if (!t) notFound();
  const { data: messages } = await supabase.from('support_messages').select('id, body, is_staff, created_at').eq('ticket_id', id).order('created_at');
  return (
    <>
      <PageHeader title={t.subject} description={[t.profiles?.full_name, t.profiles?.email, t.profiles?.phone].filter(Boolean).join(' · ')} actions={<Link className="btn-outline" href="/support">All tickets</Link>} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="card p-6">
          <ol className="mb-6 space-y-4">
            {(messages ?? []).map((m) => (
              <li key={m.id} className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${m.is_staff ? 'ml-auto bg-ink text-white' : 'bg-grey-50'}`}>
                <p className="whitespace-pre-line">{m.body}</p>
                <p className={`mt-1 text-xs ${m.is_staff ? 'text-white/60' : 'text-grey-600'}`}>{m.is_staff ? 'Staff' : 'Customer'} · {fmtDateTime(m.created_at)}</p>
              </li>
            ))}
          </ol>
          <ActionForm action={replyToTicket} submitLabel="Send reply" submitTone="gold">
            <input type="hidden" name="ticket" value={t.id} />
            <TextArea label="Reply" name="body" rows={4} />
          </ActionForm>
          <p className="mt-2 text-xs text-grey-600">Replies appear in the ticket history. For urgent issues contact the customer by phone or WhatsApp.</p>
        </section>
        <aside className="card h-fit p-5"><h2 className="mb-3 text-xl">Status</h2>
          <ActionForm action={setTicketStatus} submitLabel="Update status" submitTone="outline">
            <input type="hidden" name="ticket" value={t.id} />
            <SelectField label="Ticket status" name="status" defaultValue={t.status} options={['open', 'pending', 'resolved', 'closed'].map((s) => ({ value: s, label: s }))} />
          </ActionForm></aside>
      </div>
    </>
  );
}
