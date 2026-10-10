import Link from 'next/link';
import { Badge, DataTable, EmptyBox, PageHeader, Pagination } from '@/components/ui';
import { requireAccess } from '@/lib/auth';
import { fmtDate } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';
import { PAGE_SIZE, pageNumber, rangeFor } from '@/lib/ui-helpers';

export const metadata = { title: 'Customers' };

export default async function Customers({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireAccess('customers.view');
  const sp = await searchParams;
  const page = pageNumber(sp.page);
  const supabase = await createClient();
  let q = supabase.from('profiles').select('id, full_name, email, phone, created_at, preferred_branch_id', { count: 'exact' }).is('deleted_at', null).order('created_at', { ascending: false });
  const term = (sp.q ?? '').replace(/[%_,()*\\]/g, ' ').trim();
  if (term) q = q.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  const r = rangeFor(page);
  const { data, count } = await q.range(r.from, r.to);

  return (
    <>
      <PageHeader title="Customers" description="Customers you are permitted to see (those who booked or ordered at your branches, or all customers for global roles)." />
      <form className="mb-4 flex gap-2"><input name="q" defaultValue={sp.q} placeholder="Search name, email or phone" aria-label="Search customers" className="input max-w-sm" /><button className="btn-outline">Search</button></form>
      <div className="card overflow-hidden">
        <DataTable rows={data ?? []} rowKey={(c) => c.id} empty={<EmptyBox title="No customers found" />}
          columns={[
            { header: 'Name', cell: (c) => <Link className="font-medium underline-offset-2 hover:underline" href={`/customers/${c.id}`}>{c.full_name ?? 'Unnamed'}</Link> },
            { header: 'Email', cell: (c) => c.email ?? '—' },
            { header: 'Phone', cell: (c) => c.phone ?? '—' },
            { header: 'Joined', cell: (c) => fmtDate(c.created_at) },
          ]} />
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} base="/customers" params={{ q: sp.q }} />
      </div>
      <p className="mt-3 text-xs text-grey-600"><Badge>Privacy</Badge> Customer data is personal information. Access is logged and limited to your role.</p>
    </>
  );
}
