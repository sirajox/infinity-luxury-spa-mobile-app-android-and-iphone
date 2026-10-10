import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/form';
import { Badge, EmptyBox, PageHeader, Tabs } from '@/components/ui';
import { requireAccess } from '@/lib/auth';
import { fmtDate } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';
import { moderateReview } from './actions';

export const metadata = { title: 'Reviews' };

interface Row { id: string; rating: number; body: string | null; reviewer_name: string | null; target: string; status: string; created_at: string; services: { name: string } | null; staff: { full_name: string } | null; products: { name: string } | null }
const STATES = ['pending', 'approved', 'rejected'] as const;

/** Reviews can only be written by customers with a completed booking or delivered order; staff decide what is published. */
export default async function Reviews({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAccess('reviews.moderate');
  const sp = await searchParams;
  const status = (STATES as readonly string[]).includes(sp.status ?? '') ? (sp.status as (typeof STATES)[number]) : 'pending';
  const supabase = await createClient();
  const { data } = await supabase.from('reviews').select('id, rating, body, reviewer_name, target, status, created_at, services(name), staff(full_name), products(name)').eq('status', status).order('created_at', { ascending: false }).limit(50).returns<Row[]>();

  return (
    <>
      <PageHeader title="Reviews" description="Approve genuine reviews to publish them. Ratings shown in the app are calculated only from approved reviews." />
      <Tabs current={status} items={STATES.map((s) => ({ key: s, label: s[0]!.toUpperCase() + s.slice(1), href: `/reviews?status=${s}` }))} />
      {(data ?? []).length === 0 ? <EmptyBox title={`No ${status} reviews`} /> : (
        <ul className="space-y-3">
          {(data ?? []).map((r) => (
            <li key={r.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{'★'.repeat(r.rating)}<span className="text-grey-200">{'★'.repeat(5 - r.rating)}</span> <span className="ml-2 font-normal text-grey-600">{r.reviewer_name ?? 'Customer'} · {fmtDate(r.created_at)}</span></p>
                  <p className="mt-1 text-xs text-grey-600">{r.target === 'service' ? `Treatment: ${r.services?.name}` : r.target === 'staff' ? `Staff: ${r.staff?.full_name}` : `Product: ${r.products?.name}`} <Badge tone="success">Verified purchase</Badge></p>
                </div>
                <div className="flex gap-2">
                  {status !== 'approved' ? <Action id={r.id} status="approved" label="Approve" /> : null}
                  {status !== 'rejected' ? <Action id={r.id} status="rejected" label="Reject" outline /> : null}
                </div>
              </div>
              {r.body ? <p className="mt-3 whitespace-pre-line text-sm">{r.body}</p> : <p className="mt-3 text-sm text-grey-600">No written comment.</p>}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-xs text-grey-600"><Link className="underline" href="/manage/faqs">Edit FAQs</Link></p>
    </>
  );
}

function Action({ id, status, label, outline }: { id: string; status: string; label: string; outline?: boolean }) {
  return (
    <ActionForm action={moderateReview} hideSubmit className="inline">
      <input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={status} />
      <SubmitButton label={label} tone={outline ? 'outline' : 'primary'} small />
    </ActionForm>
  );
}
