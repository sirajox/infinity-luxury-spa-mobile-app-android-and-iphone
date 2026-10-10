import { ActionForm, Checkbox, SelectField, SubmitButton, TextField } from '@/components/form';
import { ConfirmAction } from '@/components/confirm';
import { Badge } from '@/components/ui';
import { DAY_NAMES, DISPLAY_DAY_ORDER } from '@/lib/days';
import { fmtDate } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';
import { addHoliday, removeChild, saveBranchHours } from './actions';

export async function BranchExtras({ id, canWrite }: { id: string; canWrite: boolean }) {
  const supabase = await createClient();
  const [hours, holidays, branch] = await Promise.all([
    supabase.from('branch_hours').select('day_of_week, opens, closes, is_closed').eq('branch_id', id),
    supabase.from('branch_holidays').select('id, on_date, name, branch_id').or(`branch_id.eq.${id},branch_id.is.null`).gte('on_date', new Date().toISOString().slice(0, 10)).order('on_date'),
    supabase.from('branches').select('hours_verified, bookings_enabled').eq('id', id).single(),
  ]);
  const byDay = new Map((hours.data ?? []).map((h) => [h.day_of_week, h]));

  return (
    <>
      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-xl">Opening hours</h2>
          <Badge tone={branch.data?.hours_verified ? 'success' : 'gold'}>{branch.data?.hours_verified ? 'Confirmed' : 'Unconfirmed'}</Badge>
        </div>
        {!branch.data?.hours_verified ? <p className="mb-3 text-xs text-grey-600">These hours are a placeholder (09:00–19:00). Set the real hours, then tick “Opening hours confirmed” and enable bookings.</p> : null}
        <ActionForm action={saveBranchHours} submitLabel="Save hours" hideSubmit={!canWrite}>
          <input type="hidden" name="branch_id" value={id} />
          <fieldset disabled={!canWrite} className="space-y-2 border-0 p-0">
            {DISPLAY_DAY_ORDER.map((d) => {
              const h = byDay.get(d);
              return (
                <div key={d} className="grid grid-cols-[5.5rem_1fr_1fr] items-center gap-2">
                  <span className="text-sm font-medium">{DAY_NAMES[d]?.slice(0, 3)}</span>
                  <input aria-label={`${DAY_NAMES[d]} opens`} name={`open_${d}`} type="time" defaultValue={h?.opens.slice(0, 5) ?? '09:00'} className="input min-h-10" />
                  <input aria-label={`${DAY_NAMES[d]} closes`} name={`close_${d}`} type="time" defaultValue={h?.closes.slice(0, 5) ?? '19:00'} className="input min-h-10" />
                  <div className="col-span-3 -mt-1"><Checkbox label="Closed all day" name={`off_${d}`} defaultChecked={h?.is_closed ?? false} /></div>
                </div>
              );
            })}
          </fieldset>
          {canWrite ? <SubmitButton label="Save hours" /> : null}
        </ActionForm>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-xl">Closures & holidays</h2>
        <ul className="mb-4 divide-y divide-grey-200">
          {(holidays.data ?? []).map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span><strong>{fmtDate(`${h.on_date}T12:00:00Z`)}</strong> · {h.name}{h.branch_id === null ? ' (all branches)' : ''}</span>
              {canWrite ? <ConfirmAction small action={removeChild} buttonLabel="Remove" title="Remove this closure?" body="Customers will be able to book that day again." hidden={{ table: 'branch_holidays', id: h.id }} /> : null}
            </li>
          ))}
          {(holidays.data ?? []).length === 0 ? <li className="py-2 text-sm text-grey-600">No upcoming closures.</li> : null}
        </ul>
        {canWrite ? (
          <ActionForm action={addHoliday} submitLabel="Add closure" submitTone="outline">
            <input type="hidden" name="branch_id" value={id} />
            <TextField label="Date" name="on_date" type="date" required />
            <TextField label="Reason" name="name" placeholder="e.g. Public holiday" required />
            <Checkbox label="Applies to every branch" name="all_branches" />
          </ActionForm>
        ) : null}
      </section>
    </>
  );
}

export { SelectField };
