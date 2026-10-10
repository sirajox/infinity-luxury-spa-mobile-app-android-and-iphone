import 'server-only';
import { z } from 'zod';
import { nairaToKobo, zonedTimeToUtc, formatInZone } from '@infinity/core';
import type { createClient } from '../supabase/server';
import type { FieldDef, JoinDef, OptionSource, ResourceDef } from './types';

type Supabase = Awaited<ReturnType<typeof createClient>>;
export type Row = Record<string, unknown>;
export interface Option { value: string; label: string }

/**
 * The engine addresses tables by name from a definition list, which the generated types cannot express.
 * All access still goes through the staff member's own session, so RLS is the authority; the cast is contained here.
 */
export function from(supabase: Supabase, table: string) {
  return supabase.from(table as 'services') as unknown as {
    select: (cols?: string, opts?: { count?: 'exact' }) => LooseQuery;
    insert: (v: unknown) => LooseQuery;
    update: (v: unknown) => LooseQuery;
    delete: () => LooseQuery;
  };
}
export interface LooseQuery extends PromiseLike<{ data: unknown; error: { message: string; code?: string } | null; count?: number | null }> {
  eq: (c: string, v: unknown) => LooseQuery;
  in: (c: string, v: unknown[]) => LooseQuery;
  or: (f: string) => LooseQuery;
  ilike: (c: string, v: string) => LooseQuery;
  order: (c: string, o?: { ascending: boolean }) => LooseQuery;
  range: (a: number, b: number) => LooseQuery;
  limit: (n: number) => LooseQuery;
  select: (c?: string) => LooseQuery;
  single: () => LooseQuery;
  maybeSingle: () => LooseQuery;
}

export const pkOf = (def: ResourceDef) => def.pk ?? 'id';
export const columnOf = (f: FieldDef) => f.column ?? f.name;

/** Nullable DB columns: an empty form value clears them. Other empty numbers are left to the column default. */
const NULLABLE = new Set([
  'session_count', 'validity_days', 'usage_limit', 'per_customer_limit', 'estimated_days', 'latitude', 'longitude',
  'original_price_kobo', 'max_discount_kobo', 'price_kobo', 'subcategory_id', 'parent_id',
]);

export async function loadOptions(supabase: Supabase, src: OptionSource): Promise<Option[]> {
  let q = from(supabase, src.table).select(`${src.value}, ${src.label}`);
  for (const [k, v] of Object.entries(src.where ?? {})) q = q.eq(k, v);
  const { data } = await q.order(src.orderBy ?? src.label).limit(500);
  return ((data as Row[] | null) ?? []).map((r) => ({ value: String(r[src.value]), label: String(r[src.label]) }));
}

export async function loadAllOptions(supabase: Supabase, def: ResourceDef): Promise<Record<string, Option[]>> {
  const out: Record<string, Option[]> = {};
  const jobs: Promise<void>[] = [];
  for (const f of def.fields) if (f.from) jobs.push(loadOptions(supabase, f.from).then((o) => void (out[f.name] = o)));
  for (const j of def.joins ?? []) jobs.push(loadOptions(supabase, j.from).then((o) => void (out[j.name] = o)));
  await Promise.all(jobs);
  return out;
}

export async function listRows(supabase: Supabase, def: ResourceDef, p: { q?: string; page: number; pageSize: number }) {
  let q = from(supabase, def.table).select(def.select ?? '*', { count: 'exact' });
  const term = (p.q ?? '').replace(/[%_,()*\\]/g, ' ').trim();
  if (term) q = q.or(def.searchColumns.map((c) => `${c}.ilike.%${term}%`).join(','));
  const lo = (p.page - 1) * p.pageSize;
  const res = await q.order(def.orderBy, { ascending: def.ascending ?? true }).range(lo, lo + p.pageSize - 1);
  return { rows: (res.data as Row[] | null) ?? [], total: res.count ?? 0, error: res.error };
}

export async function getRow(supabase: Supabase, def: ResourceDef, id: string) {
  const { data } = await from(supabase, def.table).select(def.select ?? '*').eq(pkOf(def), id).maybeSingle();
  return (data as Row | null) ?? null;
}

export async function getJoinSelections(supabase: Supabase, def: ResourceDef, id: string): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  await Promise.all((def.joins ?? []).map(async (j) => {
    const { data } = await from(supabase, j.table).select(j.other).eq(j.fk, id);
    out[j.name] = ((data as Row[] | null) ?? []).map((r) => String(r[j.other]));
  }));
  return out;
}

const NAIRA_RE = /^\d{1,12}(\.\d{1,2})?$/;

export function parseNaira(input: string): number | null {
  const cleaned = input.replace(/[₦,\s]/g, '');
  return NAIRA_RE.test(cleaned) ? nairaToKobo(Number(cleaned)) : null;
}

export function slugify(input: string): string {
  return input.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

const last = (v: unknown) => (Array.isArray(v) ? v[v.length - 1] : v);
const asArray = (v: unknown): string[] => (v === undefined || v === '' ? [] : Array.isArray(v) ? v.map(String) : [String(v)]);

/** zod schema for one field. Output is the parsed value (not yet the DB column mapping). */
function fieldSchema(f: FieldDef): z.ZodType {
  const empty = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  const req = (msg = 'This field is required') => (f.required ? z.string({ error: msg }).trim().min(1, msg) : z.string().trim().optional());
  switch (f.type) {
    case 'text': case 'textarea': case 'markdown':
      return z.preprocess((v) => (empty(v) ? undefined : String(last(v))), f.required ? z.string().trim().min(1, 'This field is required') : z.string().trim().optional());
    case 'select':
      return z.preprocess((v) => (empty(v) ? undefined : String(last(v))), f.required ? z.string().min(1, 'Choose an option') : z.string().optional()).refine((v) => !f.options || v === undefined || f.options.some((o) => o.value === v), 'Choose a valid option');
    case 'number': {
      const num = z.number({ error: 'Enter a number' }).refine(Number.isFinite, 'Enter a number')
        .refine((n) => f.min === undefined || n >= f.min, `Must be at least ${f.min}`)
        .refine((n) => f.max === undefined || n <= f.max, `Must be at most ${f.max}`);
      return z.preprocess((v) => (empty(v) ? undefined : Number(String(last(v)).trim())), f.required ? num : num.optional());
    }
    case 'percent':
      return z.preprocess((v) => (empty(v) ? undefined : Number(String(last(v)).trim())),
        z.number({ error: 'Enter a number' }).min(0).max(100, 'Cannot exceed 100').optional());
    case 'money': {
      const amount = z.number({ error: 'Enter an amount, e.g. 18500' }).refine((n) => n >= 0, 'Cannot be negative');
      return z.preprocess((v) => (empty(v) ? undefined : parseNaira(String(last(v)))), f.required ? amount : amount.optional());
    }
    case 'bool':
      return z.preprocess((v) => String(last(v)) === 'true', z.boolean());
    case 'date': case 'datetime':
      return z.preprocess((v) => (empty(v) ? undefined : String(last(v))), z.string().optional()).refine((v) => !v || !Number.isNaN(Date.parse(v)), 'Enter a valid date');
    case 'tags':
      return z.preprocess((v) => String(last(v) ?? '').split(',').map((s) => s.trim()).filter(Boolean), z.array(z.string().max(60)));
    case 'lines':
      return z.preprocess((v) => String(last(v) ?? '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean), z.array(z.string().max(500)));
    case 'image':
      return z.preprocess((v) => (empty(v) ? undefined : String(last(v))), z.string().url('Must be a valid URL').optional().or(z.literal('')));
    case 'multi': case 'uuids':
      return z.preprocess(asArray, z.array(z.string().uuid()));
    default:
      return req();
  }
}

export function buildSchema(def: ResourceDef) {
  const shape: Record<string, z.ZodType> = { _id: z.string().optional() };
  for (const f of def.fields) shape[f.name] = fieldSchema(f);
  for (const j of def.joins ?? []) shape[j.name] = z.preprocess(asArray, z.array(z.string().uuid()));
  return z.object(shape);
}

/** Convert a validated form into the DB row. Empty values are cleared (nullable) or omitted (column default). */
export function toRow(def: ResourceDef, data: Record<string, unknown>, mode: 'create' | 'update'): Row {
  const row: Row = {};
  for (const f of def.fields) {
    if (f.createOnly && mode === 'update') continue;
    let v = data[f.name];
    if (f.slugFrom && (v === undefined || v === '')) v = slugify(String(data[f.slugFrom] ?? ''));
    if (f.uppercase && typeof v === 'string') v = v.toUpperCase();
    const col = columnOf(f);
    if (f.type === 'percent') continue; // handled with `kind` below
    if (f.type === 'datetime' && typeof v === 'string') v = zonedTimeToUtc(v.slice(0, 10), v.slice(11, 16) || '00:00', 'Africa/Lagos').toISOString();
    if (v === undefined) {
      if (f.type === 'select' ? f.nullable || NULLABLE.has(col) : NULLABLE.has(col) || f.type === 'datetime' || f.type === 'date' || f.type === 'text' || f.type === 'textarea' || f.type === 'markdown' || f.type === 'image') {
        row[col] = null;
      }
      continue;
    }
    row[col] = v;
  }
  if (def.slug === 'coupons') {
    // One `value` column holds basis points (percentage) or kobo (fixed), chosen by `kind`.
    if (data.kind === 'percentage') row.value = Math.round(Number(data.percent ?? 0) * 100);
    else row.value = data.amount ?? 0;
    if (!row.value) throw new Error('A discount value is required');
  }
  return row;
}

/** DB row → form defaults (reverse of toRow for the fields that differ). */
export function rowDefaults(def: ResourceDef, row: Row | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!row) return out;
  for (const f of def.fields) {
    const col = columnOf(f);
    let v = row[col];
    if (def.slug === 'coupons' && f.name === 'percent') v = row.kind === 'percentage' ? Number(row.value) / 100 : null;
    if (def.slug === 'coupons' && f.name === 'amount') v = row.kind === 'fixed' ? row.value : null;
    if (v === null || v === undefined) { out[f.name] = ''; continue; }
    if (f.type === 'money') out[f.name] = (Number(v) / 100).toFixed(2).replace(/\.00$/, '');
    else if (f.type === 'tags') out[f.name] = (v as string[]).join(', ');
    else if (f.type === 'lines') out[f.name] = (v as string[]).join('\n');
    else if (f.type === 'datetime') out[f.name] = formatInZone(String(v), 'Africa/Lagos', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).replace(/^(\d{2})\/(\d{2})\/(\d{4}),?\s*/, '$3-$2-$1T');
    else if (f.type === 'uuids') out[f.name] = (v as string[]).join(',');
    else out[f.name] = String(v);
  }
  return out;
}

export async function syncJoin(supabase: Supabase, j: JoinDef, id: string, wanted: string[]) {
  const { data } = await from(supabase, j.table).select(j.other).eq(j.fk, id);
  const have = new Set(((data as Row[] | null) ?? []).map((r) => String(r[j.other])));
  const want = new Set(wanted);
  const add = [...want].filter((x) => !have.has(x));
  const remove = [...have].filter((x) => !want.has(x));
  if (add.length) {
    const { error } = await from(supabase, j.table).insert(add.map((o) => ({ [j.fk]: id, [j.other]: o })));
    if (error) throw error;
  }
  if (remove.length) {
    const { error } = await from(supabase, j.table).delete().eq(j.fk, id).in(j.other, remove);
    if (error) throw error;
  }
}

export const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
