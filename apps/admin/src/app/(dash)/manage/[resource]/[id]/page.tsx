import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ConfirmAction } from '@/components/confirm';
import { ActionForm } from '@/components/form';
import { ResourceFields } from '@/components/resource-form';
import { Flash, Notice, PageHeader } from '@/components/ui';
import { requireAccess } from '@/lib/auth';
import { resourceBySlug } from '@/lib/resources/defs';
import { getJoinSelections, getRow, loadAllOptions, pkOf, rowDefaults } from '@/lib/resources/engine';
import { createClient } from '@/lib/supabase/server';
import { BranchExtras } from '../extras/branch';
import { PackageExtras } from '../extras/package';
import { StaffExtras } from '../extras/staff';
import { ProductExtras } from '../extras/product';
import { deleteResource, saveResource } from '../actions';

export default async function ResourceEdit({ params, searchParams }: { params: Promise<{ resource: string; id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const { resource, id: rawId } = await params;
  const def = resourceBySlug(resource);
  if (!def) notFound();
  const id = decodeURIComponent(rawId);
  const isNew = id === 'new';
  const { access } = await requireAccess(def.view);
  const canWrite = access.hasAny(def.write);
  if (isNew && (!def.allowCreate || !canWrite)) notFound();

  const supabase = await createClient();
  const [row, options, selections] = await Promise.all([
    isNew ? Promise.resolve(null) : getRow(supabase, def, id),
    loadAllOptions(supabase, def),
    isNew ? Promise.resolve({}) : getJoinSelections(supabase, def, id),
  ]);
  if (!isNew && !row) notFound();
  const defaults = rowDefaults(def, row);
  if (isNew) for (const f of def.fields) if (f.type === 'bool' && f.name === 'is_active') defaults[f.name] = 'true';
  const sp = await searchParams;
  const title = isNew ? `New ${def.singular}` : String(row?.[def.fields[0]?.name ?? pkOf(def)] ?? def.singular);

  return (
    <>
      <PageHeader
        title={title} description={isNew ? undefined : def.description}
        actions={<Link href={`/manage/${def.slug}`} className="btn-outline">Back to {def.title.toLowerCase()}</Link>}
      />
      <Flash ok={sp.ok} />
      {!canWrite ? <Notice tone="gold">You can view this record but your role cannot change it.</Notice> : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="card p-6">
          <ActionForm action={saveResource} submitLabel={isNew ? `Create ${def.singular}` : 'Save changes'} hideSubmit={!canWrite}>
            <input type="hidden" name="_resource" value={def.slug} />
            <input type="hidden" name="_id" value={isNew ? '' : id} />
            <fieldset disabled={!canWrite} className="min-w-0 space-y-5 border-0 p-0">
              <ResourceFields def={def} defaults={defaults} options={options} selections={selections} />
            </fieldset>
          </ActionForm>
          {!isNew && canWrite && def.deletable ? (
            <div className="mt-8 border-t border-grey-200 pt-5">
              <ConfirmAction action={deleteResource} buttonLabel={`Delete ${def.singular}`} title={`Delete this ${def.singular}?`} hidden={{ _resource: def.slug, _id: id }}
                body="This cannot be undone. If it is linked to bookings, orders or other records the database will refuse, and you can deactivate it instead." />
            </div>
          ) : null}
        </section>
        {!isNew ? (
          <aside className="space-y-6">
            {def.slug === 'branches' ? <BranchExtras id={id} canWrite={canWrite} /> : null}
            {def.slug === 'staff' ? <StaffExtras id={id} canWrite={canWrite} /> : null}
            {def.slug === 'packages' ? <PackageExtras id={id} canWrite={canWrite} /> : null}
            {def.slug === 'products' ? <ProductExtras id={id} canWrite={canWrite} /> : null}
          </aside>
        ) : null}
      </div>
    </>
  );
}
