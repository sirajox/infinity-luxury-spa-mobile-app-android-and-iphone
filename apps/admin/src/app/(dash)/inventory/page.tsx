import { ActionForm, SelectField, TextField } from '@/components/form';
import { Badge, DataTable, EmptyBox, FilterBar, PageHeader, Pagination } from '@/components/ui';
import { requireAccess } from '@/lib/auth';
import { fmtDateTime } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';
import { PAGE_SIZE, label, pageNumber, rangeFor } from '@/lib/ui-helpers';
import { adjustStock, transferStock } from './actions';

export const metadata = { title: 'Inventory' };

interface Row {
  id: string; branch_id: string; quantity: number; reserved: number; updated_at: string;
  branches: { name: string } | null; product_variants: { name: string; sku: string; low_stock_threshold: number; products: { name: string } | null } | null;
}

export default async function Inventory({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { access } = await requireAccess('inventory.view');
  const sp = await searchParams;
  const page = pageNumber(sp.page);
  const supabase = await createClient();
  const canAdjust = access.hasAny('inventory.adjust');

  const [branchesRes, variantsRes] = await Promise.all([
    supabase.from('branches').select('id, name').eq('is_active', true).order('display_order'),
    supabase.from('product_variants').select('id, name, sku, products(name)').order('sku').returns<{ id: string; name: string; sku: string; products: { name: string } | null }[]>(),
  ]);
  const branches = branchesRes.data ?? [];
  const writable = access.branches('inventory.adjust');
  const writableBranches = branches.filter((b) => writable === 'all' || writable.includes(b.id));
  const variantOptions = (variantsRes.data ?? []).map((v) => ({ value: v.id, label: `${v.products?.name ?? 'Product'} — ${v.name} (${v.sku})` }));

  let q = supabase.from('inventory').select('id, branch_id, quantity, reserved, updated_at, branches(name), product_variants(name, sku, low_stock_threshold, products(name))', { count: 'exact' }).order('updated_at', { ascending: false });
  if (sp.branch) q = q.eq('branch_id', sp.branch);
  const r = rangeFor(page);
  const { data, count } = await q.range(r.from, r.to).returns<Row[]>();
  const rows = (data ?? []).filter((x) => sp.low !== '1' || x.quantity - x.reserved <= (x.product_variants?.low_stock_threshold ?? 0));

  const { data: txns } = await supabase.from('inventory_transactions').select('id, kind, quantity_delta, reserved_delta, reason, created_at, inventory(branches(name), product_variants(sku))').order('created_at', { ascending: false }).limit(15)
    .returns<{ id: number; kind: string; quantity_delta: number; reserved_delta: number; reason: string | null; created_at: string; inventory: { branches: { name: string } | null; product_variants: { sku: string } | null } | null }[]>();

  return (
    <>
      <PageHeader title="Inventory" description="Stock per branch. Available = on hand minus reserved by open checkouts. Every change is recorded with who, when and why." />
      <FilterBar action="/inventory" reset>
        <div><label className="label" htmlFor="branch">Branch</label><select id="branch" name="branch" defaultValue={sp.branch ?? ''} className="input"><option value="">All</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div><label className="label" htmlFor="low">Show</label><select id="low" name="low" defaultValue={sp.low ?? ''} className="input"><option value="">All stock</option><option value="1">Low stock only</option></select></div>
      </FilterBar>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <div className="card overflow-hidden">
            <DataTable rows={rows} rowKey={(x) => x.id} empty={<EmptyBox title="No stock records">Use “Adjust stock” to record opening stock for a product.</EmptyBox>}
              columns={[
                { header: 'Product', cell: (x) => <><span className="font-medium">{x.product_variants?.products?.name}</span><br /><span className="text-xs text-grey-600">{x.product_variants?.name} · {x.product_variants?.sku}</span></> },
                { header: 'Branch', cell: (x) => x.branches?.name ?? '' },
                { header: 'On hand', cell: (x) => x.quantity, align: 'right' }, { header: 'Reserved', cell: (x) => x.reserved, align: 'right' },
                { header: 'Available', cell: (x) => { const a = x.quantity - x.reserved; const low = a <= (x.product_variants?.low_stock_threshold ?? 0); return <span className={low ? 'font-semibold text-danger' : ''}>{a}{a <= 0 ? ' · out' : low ? ' · low' : ''}</span>; }, align: 'right' },
              ]} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} base="/inventory" params={sp} />
          </div>
          <section className="card overflow-hidden"><h2 className="p-5 pb-3 text-xl">Recent movements</h2>
            <DataTable rows={txns ?? []} rowKey={(t) => String(t.id)} empty={<p className="px-5 pb-5 text-sm text-grey-600">No movements yet.</p>}
              columns={[
                { header: 'When', cell: (t) => fmtDateTime(t.created_at) },
                { header: 'Item', cell: (t) => `${t.inventory?.product_variants?.sku ?? ''} · ${t.inventory?.branches?.name ?? ''}` },
                { header: 'Type', cell: (t) => <Badge>{label(t.kind)}</Badge> },
                { header: 'Change', cell: (t) => (t.quantity_delta ? `${t.quantity_delta > 0 ? '+' : ''}${t.quantity_delta}` : t.reserved_delta ? `reserve ${t.reserved_delta > 0 ? '+' : ''}${t.reserved_delta}` : '—'), align: 'right' },
                { header: 'Reason', cell: (t) => t.reason ?? '' },
              ]} /></section>
        </div>
        {canAdjust ? (
          <aside className="space-y-6">
            <section className="card p-5"><h2 className="mb-3 text-xl">Adjust stock</h2>
              <ActionForm action={adjustStock} submitLabel="Apply adjustment" submitTone="gold">
                <SelectField label="Branch" name="branch" options={writableBranches.map((b) => ({ value: b.id, label: b.name }))} />
                <SelectField label="Product" name="variant" options={variantOptions} />
                <TextField label="Change (+ add, − remove)" name="delta" type="number" step="1" required help="Use a negative number for damage or loss." />
                <TextField label="Reason" name="reason" placeholder="Stock take, damaged, new delivery…" required />
              </ActionForm></section>
            <section className="card p-5"><h2 className="mb-3 text-xl">Transfer between branches</h2>
              <ActionForm action={transferStock} submitLabel="Transfer" submitTone="outline">
                <SelectField label="From" name="from" options={writableBranches.map((b) => ({ value: b.id, label: b.name }))} />
                <SelectField label="To" name="to" options={writableBranches.map((b) => ({ value: b.id, label: b.name }))} />
                <SelectField label="Product" name="variant" options={variantOptions} />
                <TextField label="Quantity" name="qty" type="number" min={1} required />
                <TextField label="Reason" name="reason" required />
              </ActionForm></section>
          </aside>
        ) : null}
      </div>
    </>
  );
}
