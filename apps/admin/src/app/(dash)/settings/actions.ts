'use server';

import { revalidatePath } from 'next/cache';
import { requireAccess } from '@/lib/auth';
import { UserError, describeDbError, formToObject, type ActionState } from '@/lib/actions';
import { SETTING_GROUPS, type SettingField } from '@/lib/settings-def';
import { parseNaira } from '@/lib/resources/engine';
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@infinity/core';

const lastOf = (v: string | string[] | undefined) => (Array.isArray(v) ? v[v.length - 1] : v);

function parseField(f: SettingField, raw: Record<string, string | string[]>): Json {
  const v = raw[f.name];
  switch (f.type) {
    case 'int': {
      const n = Number(lastOf(v));
      if (!Number.isInteger(n) || n < (f.min ?? 0)) throw new UserError(`${f.label}: enter a whole number of at least ${f.min ?? 0}.`);
      return n;
    }
    case 'percent_bps': {
      const n = Number(lastOf(v));
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new UserError(`${f.label}: enter a percentage between 0 and 100.`);
      return Math.round(n * 100);
    }
    case 'bool': return lastOf(v) === 'true';
    case 'kobo': {
      const s = String(lastOf(v) ?? '').trim();
      if (!s) return null;
      const k = parseNaira(s);
      if (k === null) throw new UserError(`${f.label}: enter an amount like 20000.`);
      return k;
    }
    case 'providers': {
      const list = (v === undefined ? [] : Array.isArray(v) ? v : [v]).filter((p) => p === 'paystack' || p === 'flutterwave');
      if (list.length === 0) throw new UserError('Enable at least one payment provider.');
      return list;
    }
    default: {
      const s = String(lastOf(v) ?? '').trim();
      return s === '' ? null : s;
    }
  }
}

export async function saveSettings(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireAccess('settings.manage');
  const raw = formToObject(fd);
  const group = SETTING_GROUPS.find((g) => g.id === raw._group);
  if (!group) return { error: 'Unknown settings group.' };
  try {
    const supabase = await createClient();
    const keys = [...new Set(group.fields.map((f) => f.key))];
    const { data: rows } = await supabase.from('settings').select('key, value').in('key', keys);
    const current = new Map((rows ?? []).map((r) => [r.key, r.value]));
    for (const key of keys) {
      const fields = group.fields.filter((f) => f.key === key);
      let value: Json;
      if (fields.every((f) => !f.path)) value = parseField(fields[0] as SettingField, raw);
      else {
        const base = (current.get(key) && typeof current.get(key) === 'object' ? { ...(current.get(key) as Record<string, Json>) } : {}) as Record<string, Json>;
        for (const f of fields) base[f.path as string] = parseField(f, raw);
        value = base;
      }
      const { data, error } = await supabase.from('settings').update({ value }).eq('key', key).select('key');
      if (error) throw new UserError(describeDbError(error));
      if (!data?.length) throw new UserError(`The setting "${key}" does not exist yet. Apply the latest database migrations.`);
    }
    revalidatePath('/settings');
    return { ok: `${group.title} saved.` };
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    console.error('saveSettings failed', e);
    return { error: 'Something went wrong. Please try again.' };
  }
}

