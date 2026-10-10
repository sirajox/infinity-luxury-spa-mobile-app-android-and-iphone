'use client';

import { createContext, useActionState, useContext, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/lib/actions';

const FormCtx = createContext<ActionState>(null);

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Form bound to a server action. Shows success/error banners and per-field errors, and keeps typed values after a failure. */
export function ActionForm({ action, children, submitLabel = 'Save', submitTone = 'primary', hideSubmit, className }: {
  action: Action; children: ReactNode; submitLabel?: string; submitTone?: 'primary' | 'gold' | 'danger' | 'outline'; hideSubmit?: boolean; className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <FormCtx.Provider value={state}>
      <form action={formAction} className={className ?? 'space-y-5'} noValidate>
        {state?.error ? <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">{state.error}</div> : null}
        {state?.ok ? <div role="status" className="rounded-xl border border-success/30 bg-success-soft px-4 py-3 text-sm text-success">{state.ok}</div> : null}
        {children}
        {hideSubmit ? null : <SubmitButton label={submitLabel} tone={submitTone} />}
      </form>
    </FormCtx.Provider>
  );
}

export function SubmitButton({ label = 'Save', tone = 'primary', small }: { label?: string; tone?: 'primary' | 'gold' | 'danger' | 'outline'; small?: boolean }) {
  const { pending } = useFormStatus();
  const cls = tone === 'gold' ? 'btn-gold' : tone === 'danger' ? 'btn-danger' : tone === 'outline' ? 'btn-outline' : 'btn-primary';
  return (
    <button type="submit" disabled={pending} className={`${cls} ${small ? 'btn-sm' : ''}`}>
      {pending ? 'Working…' : label}
    </button>
  );
}

function useField(name: string) {
  const state = useContext(FormCtx);
  return { error: state?.fieldErrors?.[name], value: state?.values?.[name] };
}

function Shell({ label, name, help, error, children }: { label: string; name: string; help?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className="label">{label}</label>
      {children}
      {error ? <p id={`${name}-error`} className="mt-1 text-xs text-danger">{error}</p> : help ? <p className="mt-1 text-xs text-grey-600">{help}</p> : null}
    </div>
  );
}

const describe = (name: string, error?: string) => (error ? { 'aria-invalid': true as const, 'aria-describedby': `${name}-error` } : {});

export function TextField({ label, name, defaultValue, type = 'text', help, required, placeholder, step, min, max, maxLength, autoComplete }: {
  label: string; name: string; defaultValue?: string | number | null; type?: string; help?: string; required?: boolean; placeholder?: string;
  step?: string; min?: string | number; max?: string | number; maxLength?: number; autoComplete?: string;
}) {
  const { error, value } = useField(name);
  return (
    <Shell label={label} name={name} help={help} error={error}>
      <input id={name} name={name} type={type} defaultValue={value ?? defaultValue ?? ''} required={required} placeholder={placeholder} step={step} min={min} max={max} maxLength={maxLength} autoComplete={autoComplete} className="input" {...describe(name, error)} />
    </Shell>
  );
}

/** Naira field: staff type 30000 or 18,500.50; the action converts to integer kobo. */
export function MoneyField({ label, name, defaultKobo, help, required }: { label: string; name: string; defaultKobo?: number | null; help?: string; required?: boolean }) {
  const { error, value } = useField(name);
  const initial = value ?? (defaultKobo == null ? '' : (defaultKobo / 100).toFixed(2).replace(/\.00$/, ''));
  return (
    <Shell label={`${label} (₦)`} name={name} help={help} error={error}>
      <input id={name} name={name} inputMode="decimal" defaultValue={initial} required={required} placeholder="0" className="input" {...describe(name, error)} />
    </Shell>
  );
}

export function TextArea({ label, name, defaultValue, rows = 4, help, placeholder }: { label: string; name: string; defaultValue?: string | null; rows?: number; help?: string; placeholder?: string }) {
  const { error, value } = useField(name);
  return (
    <Shell label={label} name={name} help={help} error={error}>
      <textarea id={name} name={name} rows={rows} defaultValue={value ?? defaultValue ?? ''} placeholder={placeholder} className="input min-h-24 py-3" {...describe(name, error)} />
    </Shell>
  );
}

export function SelectField({ label, name, options, defaultValue, help, allowEmpty, emptyLabel = 'None' }: {
  label: string; name: string; options: { value: string; label: string }[]; defaultValue?: string | null; help?: string; allowEmpty?: boolean; emptyLabel?: string;
}) {
  const { error, value } = useField(name);
  return (
    <Shell label={label} name={name} help={help} error={error}>
      <select id={name} name={name} defaultValue={value ?? defaultValue ?? ''} className="input" {...describe(name, error)}>
        {allowEmpty ? <option value="">{emptyLabel}</option> : null}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Shell>
  );
}

export function Checkbox({ label, name, defaultChecked, help }: { label: string; name: string; defaultChecked?: boolean; help?: string }) {
  return (
    <div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
        <input type="hidden" name={name} value="false" />
        <input type="checkbox" name={name} value="true" defaultChecked={defaultChecked} className="size-5 accent-[#a68917]" />
        <span className="font-medium">{label}</span>
      </label>
      {help ? <p className="-mt-1 pl-8 text-xs text-grey-600">{help}</p> : null}
    </div>
  );
}

export function MultiCheck({ label, name, options, selected, help }: { label: string; name: string; options: { value: string; label: string }[]; selected: string[]; help?: string }) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-grey-200 bg-white px-3 text-sm has-[:checked]:border-ink has-[:checked]:bg-gold-soft">
            <input type="checkbox" name={name} value={o.value} defaultChecked={selected.includes(o.value)} className="size-4 accent-[#a68917]" />
            {o.label}
          </label>
        ))}
        {options.length === 0 ? <p className="text-sm text-grey-600">Nothing to choose from yet.</p> : null}
      </div>
      {help ? <p className="mt-1 text-xs text-grey-600">{help}</p> : null}
    </fieldset>
  );
}

export function FileField({ label, name, help, accept = 'image/jpeg,image/png,image/webp' }: { label: string; name: string; help?: string; accept?: string }) {
  const { error } = useField(name);
  return (
    <Shell label={label} name={name} help={help ?? 'JPEG, PNG or WebP, up to 5 MB.'} error={error}>
      <input id={name} name={name} type="file" accept={accept} className="block w-full text-sm file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-lg file:border file:border-grey-200 file:bg-white file:px-4 file:text-sm file:font-medium" />
    </Shell>
  );
}

export function FormGrid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  return <div className={`grid gap-4 ${cols === 3 ? 'sm:grid-cols-3' : cols === 2 ? 'sm:grid-cols-2' : ''}`}>{children}</div>;
}
