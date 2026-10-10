import Link from 'next/link';
import { Badge, DataTable, EmptyBox, PageHeader, Pagination, Tabs, type Tone } from '@/components/ui';
import { requireAccess } from '@/lib/auth';
import { fmtDateTime } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';
import { PAGE_SIZE, pageNumber, rangeFor } from '@/lib/ui-helpers';

export const metadata = { title: 'Support tickets' };

const STATES = ['open', 'pending', 'resolved', 'closed'] as const;
const tone = (s: string): Tone => (s === 'open' ? 'gold' : s === 'pending' ? 'neutral' : 'success');

export default async function Support({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  await requireAccess('support.manage');
  const sp = await searchParams;
  const status = (STATES as readonly string[]).includes(sp.status ?? '') ? (sp.status as (typeof STATES)[number]) : 'open';
  const page = pageNumber(sp.page);
  const supabase = await createClient();
  const r = rangeFor(page);
  const { data, count } = await supabase.from('support_tickets').select('id, subject, status, created_at, updated_at, branches(name), profiles(full_name)', { count: 'exact' }).eq('status', status).order('updated_at', { ascending: false }).range(r.from, r.to)
    .returns<{ id: string; subject: string; status: string; created_at: string; updated_at: string; branches: { name: string } | null; profiles: { full_name: string | null } | null }[]>();
  return (
    <>
      <PageHeader title="Support tickets" description="Messages from customers sent through Help & Support." />
      <Tabs current={status} items={STATES.map((s) => ({ key: s, label: s[0]!.toUpperCase() + s.slice(1), href: `/support?status=${s}` }))} />
      <div className="card overflow-hidden">
        <DataTable rows={data ?? []} rowKey={(t) => t.id} empty={<EmptyBox title={`No ${status} tickets`} />}
          columns={[
            { header: 'Subject', cell: (t) => <Link className="font-medium underline-offset-2 hover:underline" href={`/support/${t.id}`}>{t.subject}</Link> },
            { header: 'Customer', cell: (t) => t.profiles?.full_name ?? '—' }, { header: 'Branch', cell: (t) => t.branches?.name ?? '—' },
            { header: 'Updated', cell: (t) => fmtDateTime(t.updated_at) }, { header: 'Status', cell: (t) => <Badge tone={tone(t.status)}>{t.status}</Badge> },
          ]} />
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} base="/support" params={{ status }} />
      </div>
    </>
  );
}
