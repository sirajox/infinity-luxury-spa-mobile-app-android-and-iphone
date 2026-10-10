import { ActionForm, Checkbox, SelectField, SubmitButton, TextField } from '@/components/form';
import { ConfirmAction } from '@/components/confirm';
import { DAY_NAMES, DISPLAY_DAY_ORDER } from '@/lib/days';
import { fmtDate } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';
import { addBreak, addLeave, removeChild, saveStaffHours } from './actions';

/** Weekly schedule per branch, recurring breaks and leave: the inputs to the authoritative availability function. */
export async function StaffExtras({ id, canWrite }: { id: string; canWrite: boolean }) {
  const supabase = await createClient();
  const [links, hours, breaks, leave] = await Promise.all([
    supabase.from('staff_branches').select('branch_id, branches(name)').eq('staff_id', id).returns<{ branch_id: string; branches: { name: string } | null }[]>(),
    supabase.from('staff_working_hours').select('branch_id, day_of_week, starts, ends').eq('staff_id', id),
    supabase.from('staff_breaks').select('id, day_of_week, starts, ends, label').eq('staff_id', id),
    supabase.from('staff_leave').select('id, starts_on, ends_on, reason').eq('staff_id', id).gte('ends_on', new Date().toISOString().slice(0, 10)).order('starts_on'),
  ]);

  return (
    <>
      <section className="card p-5">
        <h2 className="mb-1 text-xl">Weekly schedule</h2>
        <p className="mb-4 text-xs text-grey-600">Customers can only book a specialist inside these hours. Assign branches on the main form first.</p>
        {(links.data ?? []).length === 0 ? <p className="text-sm text-grey-600">This person is not assigned to a branch yet. Tick a branch under “Works at branches” and save.</p> : null}
        {(links.data ?? []).map((l) => {
          const byDay = new Map((hours.data ?? []).filter((h) => h.branch_id === l.branch_id).map((h) => [h.day_of_week, h]));
          return (
            <ActionForm key={l.branch_id} action={saveStaffHours} submitLabel="Save schedule" hideSubmit={!canWrite} className="mb-6 space-y-3 border-t border-grey-200 pt-4 first:border-0 first:pt-0">
              <input type="hidden" name="staff_id" value={id} />
              <input type="hidden" name="branch_id" value={l.branch_id} />
              <h3 className="text-base font-semibold">{l.branches?.name}</h3>
              <fieldset disabled={!canWrite} className="space-y-2 border-0 p-0">
                {DISPLAY_DAY_ORDER.map((d) => {
                  const h = byDay.get(d);
                  return (
                    <div key={d} className="grid grid-cols-[3rem_1fr_1fr] items-center gap-2">
                      <span className="text-sm font-medium">{DAY_NAMES[d]?.slice(0, 3)}</span>
                      <input aria-label={`${DAY_NAMES[d]} start`} name={`open_${d}`} type="time" defaultValue={h?.starts.slice(0, 5) ?? ''} className="input min-h-10" />
                      <input aria-label={`${DAY_NAMES[d]} end`} name={`close_${d}`} type="time" defaultValue={h?.ends.slice(0, 5) ?? ''} className="input min-h-10" />
                      <div className="col-span-3 -mt-1"><Checkbox label="Not working" name={`off_${d}`} defaultChecked={!h} /></div>
                    </div>
                  );
                })}
              </fieldset>
              {canWrite ? <SubmitButton label="Save schedule" small /> : null}
            </ActionForm>
          );
        })}
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-xl">Breaks</h2>
        <ul className="mb-4 divide-y divide-grey-200">
          {(breaks.data ?? []).map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span>{b.day_of_week === null ? 'Every day' : DAY_NAMES[b.day_of_week]} · {b.starts.slice(0, 5)}–{b.ends.slice(0, 5)}{b.label ? ` · ${b.label}` : ''}</span>
              {canWrite ? <ConfirmAction small action={removeChild} buttonLabel="Remove" title="Remove this break?" body="That time becomes bookable again." hidden={{ table: 'staff_breaks', id: b.id }} /> : null}
            </li>
          ))}
          {(breaks.data ?? []).length === 0 ? <li className="py-2 text-sm text-grey-600">No breaks set.</li> : null}
        </ul>
        {canWrite ? (
          <ActionForm action={addBreak} submitLabel="Add break" submitTone="outline">
            <input type="hidden" name="staff_id" value={id} />
            <SelectField label="Day" name="day_of_week" allowEmpty emptyLabel="Every day" options={DISPLAY_DAY_ORDER.map((d) => ({ value: String(d), label: DAY_NAMES[d] ?? '' }))} />
            <div className="grid grid-cols-2 gap-3"><TextField label="From" name="starts" type="time" required /><TextField label="To" name="ends" type="time" required /></div>
            <TextField label="Label" name="label" placeholder="Lunch" />
          </ActionForm>
        ) : null}
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-xl">Leave</h2>
        <ul className="mb-4 divide-y divide-grey-200">
          {(leave.data ?? []).map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span>{fmtDate(`${l.starts_on}T12:00:00Z`)} → {fmtDate(`${l.ends_on}T12:00:00Z`)}{l.reason ? ` · ${l.reason}` : ''}</span>
              {canWrite ? <ConfirmAction small action={removeChild} buttonLabel="Remove" title="Remove this leave?" body="Customers will be able to book them on those days again." hidden={{ table: 'staff_leave', id: l.id }} /> : null}
            </li>
          ))}
          {(leave.data ?? []).length === 0 ? <li className="py-2 text-sm text-grey-600">No upcoming leave.</li> : null}
        </ul>
        {canWrite ? (
          <ActionForm action={addLeave} submitLabel="Add leave" submitTone="outline">
            <input type="hidden" name="staff_id" value={id} />
            <div className="grid grid-cols-2 gap-3"><TextField label="From" name="starts_on" type="date" required /><TextField label="To" name="ends_on" type="date" required /></div>
            <TextField label="Reason" name="reason" />
          </ActionForm>
        ) : null}
      </section>
    </>
  );
}
