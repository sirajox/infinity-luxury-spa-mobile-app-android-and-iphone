'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { formAction } from '@/lib/action-wrapper';
import { UserError, describeDbError, type ActionState } from '@/lib/actions';
import { DAY_NAMES } from '@/lib/days';
import { from } from '@/lib/resources/engine';

const time = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM');
const uuid = z.string().uuid();
const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

const isOff = (v: unknown) => (Array.isArray(v) ? v[v.length - 1] : v) === 'true';

interface DayRow { day_of_week: number; off: boolean; open?: string; close?: string }

/** Parse the seven day rows of a schedule form, validating each open day. */
function parseDays(data: Record<string, unknown>): DayRow[] {
  return DAYS.map((d) => {
    if (isOff(data[`off_${d}`])) return { day_of_week: d, off: true };
    const open = String(data[`open_${d}`] ?? '');
    const close = String(data[`close_${d}`] ?? '');
    if (!/^d{2}:d{2}$/.test(open) || !/^d{2}:d{2}$/.test(close) || close <= open) throw new UserError(`${DAY_NAMES[d]}: closing time must be after opening time.`);
    return { day_of_week: d, off: false, open, close };
  });
}

const dayShape = Object.fromEntries(DAYS.flatMap((d) => [[`open_${d}`, z.string().optional()], [`close_${d}`, z.string().optional()], [`off_${d}`, z.union([z.string(), z.array(z.string())]).optional()]]));

export const saveBranchHours = formAction({ permission: 'branches.manage', schema: z.object({ branch_id: uuid, ...dayShape }) }, async (data, { supabase }) => {
  for (const day of parseDays(data)) {
    const values = { opens: day.open ?? '09:00', closes: day.close ?? '19:00', is_closed: day.off };
    const { data: updated, error } = await from(supabase, 'branch_hours').update(values).eq('branch_id', data.branch_id).eq('day_of_week', day.day_of_week).select('id');
    if (error) throw new UserError(describeDbError(error));
    if (((updated as unknown[] | null) ?? []).length === 0) {
      const { error: e2 } = await from(supabase, 'branch_hours').insert({ branch_id: data.branch_id, day_of_week: day.day_of_week, ...values });
      if (e2) throw new UserError(describeDbError(e2));
    }
  }
  revalidatePath('/manage/branches');
  return 'Opening hours saved. Remember to tick "Opening hours confirmed" on the branch once they are correct.';
});

export const addHoliday = formAction({ permission: 'branches.manage', schema: z.object({ branch_id: uuid, on_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'), name: z.string().trim().min(2, 'Enter a name'), all_branches: z.string().optional() }) }, async (data, { supabase }) => {
  const { error } = await from(supabase, 'branch_holidays').insert({ branch_id: data.all_branches === 'true' ? null : data.branch_id, on_date: data.on_date, name: data.name });
  if (error) throw new UserError(describeDbError(error));
  revalidatePath('/manage/branches');
  return 'Closure added.';
});

export const saveStaffHours = formAction({ permission: 'staff.manage', schema: z.object({ staff_id: uuid, branch_id: uuid, ...dayShape }) }, async (data, { supabase }) => {
  const rows = parseDays(data).filter((d) => !d.off).map((d) => ({ staff_id: data.staff_id, branch_id: data.branch_id, day_of_week: d.day_of_week, starts: d.open, ends: d.close }));
  const { data: existing } = await from(supabase, 'staff_working_hours').select('*').eq('staff_id', data.staff_id).eq('branch_id', data.branch_id);
  const { error: delError } = await from(supabase, 'staff_working_hours').delete().eq('staff_id', data.staff_id).eq('branch_id', data.branch_id);
  if (delError) throw new UserError(describeDbError(delError));
  if (rows.length) {
    const { error } = await from(supabase, 'staff_working_hours').insert(rows);
    if (error) {
      // Put the previous schedule back so a failed save never leaves a staff member with no hours.
      const old = ((existing as Record<string, unknown>[] | null) ?? []).map(({ id: _id, ...r }) => r);
      if (old.length) await from(supabase, 'staff_working_hours').insert(old);
      throw new UserError(describeDbError(error));
    }
  }
  revalidatePath('/manage/staff');
  return 'Weekly schedule saved.';
});

export const addBreak = formAction({ permission: 'staff.manage', schema: z.object({ staff_id: uuid, day_of_week: z.string().optional(), starts: time, ends: time, label: z.string().trim().optional() }) }, async (data, { supabase }) => {
  if (data.ends <= data.starts) throw new UserError('The break must end after it starts.');
  const { error } = await from(supabase, 'staff_breaks').insert({ staff_id: data.staff_id, day_of_week: data.day_of_week ? Number(data.day_of_week) : null, starts: data.starts, ends: data.ends, label: data.label || null });
  if (error) throw new UserError(describeDbError(error));
  revalidatePath('/manage/staff');
  return 'Break added.';
});

export const addLeave = formAction({ permission: 'staff.manage', schema: z.object({ staff_id: uuid, starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a start date'), ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose an end date'), reason: z.string().trim().optional() }) }, async (data, { supabase }) => {
  if (data.ends_on < data.starts_on) throw new UserError('The end date cannot be before the start date.');
  const { error } = await from(supabase, 'staff_leave').insert({ staff_id: data.staff_id, starts_on: data.starts_on, ends_on: data.ends_on, reason: data.reason || null });
  if (error) throw new UserError(describeDbError(error));
  revalidatePath('/manage/staff');
  return 'Leave added.';
});

export const addPackageItem = formAction({ permission: 'packages.manage', schema: z.object({ package_id: uuid, service_id: uuid, quantity: z.coerce.number().int().min(1).max(50) }) }, async (data, { supabase }) => {
  const { error } = await from(supabase, 'package_items').insert({ package_id: data.package_id, service_id: data.service_id, quantity: data.quantity });
  if (error) throw new UserError(describeDbError(error));
  revalidatePath('/manage/packages');
  return 'Added to the package.';
});

const CHILD_TABLES: Record<string, { permission: string; path: string }> = {
  branch_holidays: { permission: 'branches.manage', path: '/manage/branches' },
  staff_breaks: { permission: 'staff.manage', path: '/manage/staff' },
  staff_leave: { permission: 'staff.manage', path: '/manage/staff' },
  package_items: { permission: 'packages.manage', path: '/manage/packages' },
};

/** Delete one row from a small child table. The table must be on the allow-list; RLS still decides. */
export async function removeChild(prev: ActionState, fd: FormData): Promise<ActionState> {
  const table = String(fd.get('table') ?? '');
  const cfg = CHILD_TABLES[table];
  if (!cfg) return { error: 'Not allowed.' };
  return formAction({ permission: cfg.permission, schema: z.object({ table: z.string(), id: uuid }) }, async (data, { supabase }) => {
    const { error } = await from(supabase, table).delete().eq('id', data.id);
    if (error) throw new UserError(describeDbError(error));
    revalidatePath(cfg.path);
    return 'Removed.';
  })(prev, fd);
}
