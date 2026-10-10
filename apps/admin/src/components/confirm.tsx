'use client';

import { useActionState, useRef, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/lib/actions';

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

function Confirm({ label, tone }: { label: string; tone: 'danger' | 'primary' | 'gold' }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={tone === 'danger' ? 'btn-danger' : tone === 'gold' ? 'btn-gold' : 'btn-primary'}>{pending ? 'Working…' : label}</button>;
}

/**
 * A button that asks "are you sure?" in a modal dialog before running a server action.
 * Used for destructive or financially sensitive operations (refunds, deletions, cancellations, stock changes).
 */
export function ConfirmAction({ action, buttonLabel, title, body, confirmLabel, tone = 'danger', small, hidden, children }: {
  action: Action; buttonLabel: string; title: string; body: ReactNode; confirmLabel?: string; tone?: 'danger' | 'primary' | 'gold'; small?: boolean;
  hidden?: Record<string, string>; children?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await action(prev, fd);
    if (result?.ok) ref.current?.close();
    return result;
  }, null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={`${tone === 'danger' ? 'btn-outline text-danger' : 'btn-outline'} ${small ? 'btn-sm' : ''}`}>{buttonLabel}</button>
      <dialog ref={ref} aria-labelledby="confirm-title" className="m-auto w-[min(92vw,28rem)] rounded-2xl border border-grey-200 p-0 shadow-xl backdrop:bg-black/50">
        <form action={formAction} className="space-y-4 p-6">
          <h2 id="confirm-title" className="text-xl">{title}</h2>
          <div className="text-sm text-grey-600">{body}</div>
          {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          {children}
          {state?.error ? <p role="alert" className="text-sm text-danger">{state.error}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-outline" onClick={() => ref.current?.close()}>Cancel</button>
            <Confirm label={confirmLabel ?? buttonLabel} tone={tone} />
          </div>
        </form>
      </dialog>
    </>
  );
}
