import { ActionForm, Checkbox, MultiCheck, MoneyField, SelectField, TextArea, TextField } from '@/components/form';
import { PageHeader } from '@/components/ui';
import { requireAccess } from '@/lib/auth';
import { SETTING_GROUPS, type SettingField } from '@/lib/settings-def';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@infinity/core';
import { saveSettings } from './actions';

export const metadata = { title: 'Settings' };

function read(values: Map<string, Json>, f: SettingField): Json | undefined {
  const v = values.get(f.key);
  if (!f.path) return v;
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, Json>)[f.path] : undefined;
}

export default async function Settings() {
  await requireAccess('settings.manage');
  const supabase = await createClient();
  const [{ data: rows }, { data: branches }] = await Promise.all([
    supabase.from('settings').select('key, value'),
    supabase.from('branches').select('slug, name').order('display_order'),
  ]);
  const values = new Map((rows ?? []).map((r) => [r.key, r.value]));

  return (
    <>
      <PageHeader title="Settings" description="Business rules the mobile app and booking engine follow. Changes apply immediately and are recorded in the audit log." />
      <div className="grid gap-6 lg:grid-cols-2">
        {SETTING_GROUPS.map((g) => (
          <section key={g.id} className="card p-6">
            <h2 className="text-xl">{g.title}</h2>
            <p className="mb-4 text-sm text-grey-600">{g.description}</p>
            <ActionForm action={saveSettings} submitLabel={`Save ${g.title.toLowerCase()}`}>
              <input type="hidden" name="_group" value={g.id} />
              {g.fields.map((f) => {
                const v = read(values, f);
                switch (f.type) {
                  case 'int': return <TextField key={f.name} label={f.label} name={f.name} type="number" min={f.min} defaultValue={v == null ? '' : String(v)} help={f.help} />;
                  case 'percent_bps': return <TextField key={f.name} label={f.label} name={f.name} type="number" step="0.01" min={0} max={100} defaultValue={v == null ? '' : String(Number(v) / 100)} help={f.help} />;
                  case 'bool': return <Checkbox key={f.name} label={f.label} name={f.name} defaultChecked={v === true} help={f.help} />;
                  case 'kobo': return <MoneyField key={f.name} label={f.label} name={f.name} defaultKobo={typeof v === 'number' ? v : null} help={f.help} />;
                  case 'providers': return <MultiCheck key={f.name} label={f.label} name={f.name} options={[{ value: 'paystack', label: 'Paystack' }, { value: 'flutterwave', label: 'Flutterwave' }]} selected={Array.isArray(v) ? (v as string[]) : ['paystack']} />;
                  case 'branch_slug': return <SelectField key={f.name} label={f.label} name={f.name} defaultValue={typeof v === 'string' ? v : 'abuja'} options={(branches ?? []).map((b) => ({ value: b.slug, label: b.name }))} />;
                  case 'textarea': return <TextArea key={f.name} label={f.label} name={f.name} defaultValue={typeof v === 'string' ? v : ''} rows={3} help={f.help} />;
                  default: return <TextField key={f.name} label={f.label} name={f.name} defaultValue={typeof v === 'string' ? v : ''} help={f.help} />;
                }
              })}
            </ActionForm>
          </section>
        ))}
      </div>
    </>
  );
}
