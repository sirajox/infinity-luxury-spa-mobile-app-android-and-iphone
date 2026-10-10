import { ActionForm, SelectField, TextField } from '@/components/form';
import { ConfirmAction } from '@/components/confirm';
import { createClient } from '@/lib/supabase/server';
import { addPackageItem, removeChild } from './actions';

export async function PackageExtras({ id, canWrite }: { id: string; canWrite: boolean }) {
  const supabase = await createClient();
  const [items, services] = await Promise.all([
    supabase.from('package_items').select('id, quantity, services(name)').eq('package_id', id).returns<{ id: string; quantity: number; services: { name: string } | null }[]>(),
    supabase.from('services').select('id, name').eq('is_active', true).order('name'),
  ]);
  return (
    <section className="card p-5">
      <h2 className="mb-3 text-xl">Included treatments</h2>
      <ul className="mb-4 divide-y divide-grey-200">
        {(items.data ?? []).map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span>{i.quantity} × {i.services?.name ?? 'Treatment'}</span>
            {canWrite ? <ConfirmAction small action={removeChild} buttonLabel="Remove" title="Remove from package?" body="Existing purchases keep the contents they were bought with." hidden={{ table: 'package_items', id: i.id }} /> : null}
          </li>
        ))}
        {(items.data ?? []).length === 0 ? <li className="py-2 text-sm text-grey-600">No treatments added yet.</li> : null}
      </ul>
      {canWrite ? (
        <ActionForm action={addPackageItem} submitLabel="Add treatment" submitTone="outline">
          <input type="hidden" name="package_id" value={id} />
          <SelectField label="Treatment" name="service_id" options={(services.data ?? []).map((s) => ({ value: s.id, label: s.name }))} />
          <TextField label="Quantity" name="quantity" type="number" defaultValue={1} min={1} />
        </ActionForm>
      ) : null}
    </section>
  );
}
