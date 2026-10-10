import { Checkbox, FormGrid, MoneyField, MultiCheck, SelectField, TextArea, TextField } from '@/components/form';
import type { Option } from '@/lib/resources/engine';
import type { FieldDef, JoinDef, ResourceDef } from '@/lib/resources/types';

/** Renders one field of a resource definition. Server component; the leaf inputs are client components. */
export function FieldRenderer({ f, defaults, options }: { f: FieldDef; defaults: Record<string, string>; options: Option[] }) {
  const v = defaults[f.name] ?? '';
  switch (f.type) {
    case 'text':
      return <TextField label={f.label} name={f.name} defaultValue={v} required={f.required} help={f.help} />;
    case 'number': case 'percent':
      return <TextField label={f.label} name={f.name} type="number" step="any" defaultValue={v} required={f.required} help={f.help} min={f.min} max={f.max} />;
    case 'money':
      return <MoneyField label={f.label} name={f.name} defaultKobo={v === '' ? null : Math.round(Number(v) * 100)} required={f.required} help={f.help} />;
    case 'textarea': case 'markdown':
      return <TextArea label={f.label} name={f.name} defaultValue={v} rows={f.rows ?? 4} help={f.help} />;
    case 'tags':
      return <TextField label={f.label} name={f.name} defaultValue={v} help={f.help} />;
    case 'lines':
      return <TextArea label={f.label} name={f.name} defaultValue={v} rows={f.rows ?? 4} help={f.help} />;
    case 'bool':
      return <Checkbox label={f.label} name={f.name} defaultChecked={v === 'true'} help={f.help} />;
    case 'date':
      return <TextField label={f.label} name={f.name} type="date" defaultValue={v} help={f.help} />;
    case 'datetime':
      return <TextField label={`${f.label} (West Africa Time)`} name={f.name} type="datetime-local" defaultValue={v} help={f.help} />;
    case 'select':
      return <SelectField label={f.label} name={f.name} defaultValue={v} options={f.options ?? options} allowEmpty={!f.required} help={f.help} />;
    case 'uuids': case 'multi':
      return <MultiCheck label={f.label} name={f.name} options={options} selected={v ? v.split(',') : []} help={f.help} />;
    case 'image':
      return (
        <div>
          <p className="label">{f.label}</p>
          {v ? (
            <div className="mb-2 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- remote user-uploaded image of unknown size */}
              <img src={v} alt="" className="size-20 rounded-xl border border-grey-200 object-cover" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={`${f.name}__clear`} value="true" className="size-4" /> Remove image</label>
            </div>
          ) : null}
          <input type="hidden" name={f.name} value={v} />
          <input name={`${f.name}__file`} type="file" accept="image/jpeg,image/png,image/webp" className="block w-full text-sm file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-lg file:border file:border-grey-200 file:bg-white file:px-4 file:text-sm file:font-medium" />
          <p className="mt-1 text-xs text-grey-600">JPEG, PNG or WebP, up to 5 MB. Choose a file to replace the current image.</p>
        </div>
      );
  }
}

export function ResourceFields({ def, defaults, options, selections }: { def: ResourceDef; defaults: Record<string, string>; options: Record<string, Option[]>; selections: Record<string, string[]> }) {
  const wide = (f: FieldDef) => f.type === 'textarea' || f.type === 'markdown' || f.type === 'lines' || f.type === 'image' || f.type === 'uuids' || f.type === 'multi';
  const bools = def.fields.filter((f) => f.type === 'bool');
  const normal = def.fields.filter((f) => f.type !== 'bool' && !wide(f));
  const wides = def.fields.filter(wide);
  return (
    <div className="space-y-5">
      <FormGrid>{normal.map((f) => <FieldRenderer key={f.name} f={f} defaults={defaults} options={options[f.name] ?? []} />)}</FormGrid>
      {wides.map((f) => <FieldRenderer key={f.name} f={f} defaults={defaults} options={options[f.name] ?? []} />)}
      {(def.joins ?? []).map((j: JoinDef) => <MultiCheck key={j.name} label={j.label} name={j.name} options={options[j.name] ?? []} selected={selections[j.name] ?? []} />)}
      {bools.length ? <div className="space-y-1">{bools.map((f) => <FieldRenderer key={f.name} f={f} defaults={defaults} options={[]} />)}</div> : null}
    </div>
  );
}
