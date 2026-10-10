import { Badge, DataTable, EmptyBox, FilterBar, PageHeader, Pagination } from '@/components/ui';
import { requireAccess } from '@/lib/auth';
import { fmtDateTime } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';
import { PAGE_SIZE, pageNumber, rangeFor } from '@/lib/ui-helpers';

export const metadata = { title: 'Audit logs' };

interface Row { id: number; occurred_at: string; actor_id: string | null; action: string; table_name: string; record_id: string | null; before_data: Record<string, unknown> | null; after_data: Record<string, unknown> | null }

/** Fields that changed between two JSON snapshots, for a compact before → after view. */
function diff(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {}), ]);
  return [...keys].filter((k) => !['updated_at', 'search_text'].includes(k) && JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]))
    .map((k) => ({ key: k, before: before?.[k], after: after?.[k] }));
}
const show = (v: unknown) => (v === undefined || v === null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export default async function Audit({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAccess('audit.view');
  const sp = await searchParams;
  const page = pageNumber(sp.page);
  const supabase = await createClient();
  const { data: tables } = await supabase.from('audit_logs').select('table_name').order('occurred_at', { ascending: false }).limit(500);
  const tableNames = [...new Set((tables ?? []).map((t) => t.table_name))].sort();
  let q = supabase.from('audit_logs').select('id, occurred_at, actor_id, action, table_name, record_id, before_data, after_data', { count: 'exact' }).order('occurred_at', { ascending: false });
  if (sp.table) q = q.eq('table_name', sp.table);
  if (sp.action) q = q.eq('action', sp.action);
  if (sp.from) q = q.gte('occurred_at', `${sp.from}T00:00:00+01:00`);
  if (sp.to) q = q.lte('occurred_at', `${sp.to}T23:59:59+01:00`);
  const r = rangeFor(page);
  const { data, count } = await q.range(r.from, r.to).returns<Row[]>();
  const actorIds = [...new Set((data ?? []).map((x) => x.actor_id).filter((x): x is string => !!x))];
  const { data: actors } = actorIds.length ? await supabase.from('profiles').select('id, full_name, email').in('id', actorIds) : { data: [] };
  const actorName = new Map((actors ?? []).map((a) => [a.id, a.full_name ?? a.email ?? a.id.slice(0, 8)]));

  return (
    <>
      <PageHeader title="Audit logs" description="A permanent record of sensitive changes: prices, settings, roles, refunds, cancellations and more. Entries cannot be edited or deleted." />
      <FilterBar action="/audit" reset>
        <div><label className="label" htmlFor="table">Area</label><select id="table" name="table" defaultValue={sp.table ?? ''} className="input"><option value="">All</option>{tableNames.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select></div>
        <div><label className="label" htmlFor="action">Action</label><select id="action" name="action" defaultValue={sp.action ?? ''} className="input"><option value="">All</option><option>INSERT</option><option>UPDATE</option><option>DELETE</option></select></div>
        <div><label className="label" htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={sp.from} className="input" /></div>
        <div><label className="label" htmlFor="to">To</label><input id="to" name="to" type="date" defaultValue={sp.to} className="input" /></div>
      </FilterBar>
      <div className="card overflow-hidden">
        <DataTable rows={data ?? []} rowKey={(x) => String(x.id)} empty={<EmptyBox title="No audit entries match" />}
          columns={[
            { header: 'When', cell: (x) => fmtDateTime(x.occurred_at) },
            { header: 'Who', cell: (x) => (x.actor_id ? actorName.get(x.actor_id) ?? x.actor_id.slice(0, 8) : 'System') },
            { header: 'Action', cell: (x) => <Badge tone={x.action === 'DELETE' ? 'danger' : x.action === 'INSERT' ? 'success' : 'gold'}>{x.action.toLowerCase()}</Badge> },
            { header: 'Area', cell: (x) => x.table_name.replace(/_/g, ' ') },
            { header: 'What changed', className: 'max-w-md', cell: (x) => {
              const d = diff(x.before_data, x.after_data);
              return (
                <details>
                  <summary className="cursor-pointer text-xs text-gold-text">{d.length} field{d.length === 1 ? '' : 's'}</summary>
                  <ul className="mt-2 space-y-1 text-xs">{d.slice(0, 20).map((c) => <li key={c.key}><strong>{c.key}</strong>: <span className="text-grey-600">{show(c.before)}</span> → {show(c.after)}</li>)}</ul>
                </details>
              );
            } },
          ]} />
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} base="/audit" params={sp} />
      </div>
    </>
  );
}
