import { describe, expect, it } from 'vitest';
import { csvCell } from './ui-helpers';
import { describeDbError, formToObject, zodFieldErrors } from './actions';
import { RESOURCES, resourceBySlug } from './resources/defs';
import { buildSchema, parseNaira, rowDefaults, slugify, toRow } from './resources/engine';
import { SETTING_GROUPS } from './settings-def';
import { NAV } from './nav';
import { PERMISSIONS } from '@infinity/core';

describe('money input', () => {
  it('parses naira to integer kobo without float drift', () => {
    expect(parseNaira('18,500.50')).toBe(1_850_050);
    expect(parseNaira('₦30000')).toBe(3_000_000);
    expect(parseNaira('0.1')).toBe(10);
    expect(parseNaira('1.005')).toBeNull(); // more than 2 decimals is rejected, not rounded
    expect(parseNaira('abc')).toBeNull();
    expect(parseNaira('-5')).toBeNull();
  });
});

describe('slugs and CSV', () => {
  it('slugifies names', () => {
    expect(slugify('Skin Tag & Body Tag Removal')).toBe('skin-tag-and-body-tag-removal');
    expect(slugify('  Crème Brûlée!! ')).toBe('creme-brulee');
  });
  it('neutralises spreadsheet formulas and escapes quotes', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+234')).toBe("'+234");
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(12.5)).toBe('12.5');
  });
});

describe('resource engine', () => {
  const services = resourceBySlug('services')!;

  it('validates and converts a treatment form', () => {
    const schema = buildSchema(services);
    const ok = schema.safeParse({
      name: 'Hydrafacial', category_id: '00000000-0000-4000-8000-000000000001', price_type: 'fixed', price: '25,000', duration_minutes: '45',
      is_active: ['false', 'true'], is_featured: 'false', gallery_urls: 'https://a.test/1.jpg\nhttps://a.test/2.jpg', branch_ids: ['00000000-0000-4000-8000-0000000000aa'],
    });
    expect(ok.success).toBe(true);
    const row = toRow(services, ok.data as Record<string, unknown>, 'create');
    expect(row).toMatchObject({ name: 'Hydrafacial', slug: 'hydrafacial', price_kobo: 2_500_000, duration_minutes: 45, is_active: true, is_featured: false });
    expect(row.gallery_urls).toEqual(['https://a.test/1.jpg', 'https://a.test/2.jpg']);
    expect(row.subcategory_id).toBeNull();
  });

  it('rejects missing and out-of-range values with field messages', () => {
    const bad = buildSchema(services).safeParse({ name: '', category_id: 'nope', price_type: 'weird', duration_minutes: '2' });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const errors = zodFieldErrors(bad.error);
      expect(Object.keys(errors)).toEqual(expect.arrayContaining(['name', 'price_type', 'duration_minutes']));
    }
  });

  it('stores coupon discounts as basis points or kobo depending on type', () => {
    const coupons = resourceBySlug('coupons')!;
    const base = { code: 'glow20', kind: 'percentage', percent: '20', is_active: 'true', first_order_only: 'false' };
    const pct = buildSchema(coupons).parse(base);
    expect(toRow(coupons, pct as Record<string, unknown>, 'create')).toMatchObject({ code: 'GLOW20', kind: 'percentage', value: 2000 });
    const fixed = buildSchema(coupons).parse({ ...base, kind: 'fixed', amount: '5,000', percent: '' });
    expect(toRow(coupons, fixed as Record<string, unknown>, 'create')).toMatchObject({ kind: 'fixed', value: 500_000 });
    expect(() => toRow(coupons, buildSchema(coupons).parse({ ...base, percent: '' }) as Record<string, unknown>, 'create')).toThrow(/discount value/);
  });

  it('never rewrites immutable columns on update', () => {
    const coupons = resourceBySlug('coupons')!;
    const data = buildSchema(coupons).parse({ code: 'newcode', kind: 'percentage', percent: '10', is_active: 'true', first_order_only: 'false' });
    expect(toRow(coupons, data as Record<string, unknown>, 'update')).not.toHaveProperty('code');
  });

  it('round-trips stored values back into form defaults', () => {
    const defaults = rowDefaults(services, { name: 'Hydrafacial', price_kobo: 2_500_000, gallery_urls: ['a', 'b'], is_active: true, subcategory_id: null });
    expect(defaults).toMatchObject({ name: 'Hydrafacial', price: '25000', gallery_urls: 'a\nb', is_active: 'true', subcategory_id: '' });
  });
});

describe('definitions stay consistent with the permission model', () => {
  it('only references permissions that exist', () => {
    const known = new Set<string>(PERMISSIONS);
    for (const r of RESOURCES) {
      expect(known.has(r.view), `${r.slug} view`).toBe(true);
      expect(known.has(r.write), `${r.slug} write`).toBe(true);
    }
    for (const item of NAV.flatMap((g) => g.items)) if (item.permission) expect(known.has(item.permission), item.href).toBe(true);
  });
  it('points every sidebar resource link at a real definition', () => {
    for (const item of NAV.flatMap((g) => g.items).filter((i) => i.href.startsWith('/manage/'))) {
      expect(resourceBySlug(item.href.replace('/manage/', '')), item.href).toBeDefined();
    }
  });
  it('has unique setting field names within each group', () => {
    for (const g of SETTING_GROUPS) expect(new Set(g.fields.map((f) => f.name)).size).toBe(g.fields.length);
  });
});

describe('action helpers', () => {
  it('collapses repeated form keys into arrays (checkbox + hidden pairs)', () => {
    const fd = new FormData();
    fd.append('is_active', 'false');
    fd.append('is_active', 'true');
    fd.append('name', 'x');
    expect(formToObject(fd)).toEqual({ is_active: ['false', 'true'], name: 'x' });
  });
  it('maps database errors to safe messages', () => {
    expect(describeDbError({ message: 'forbidden', code: '42501' })).toMatch(/permission/);
    expect(describeDbError({ message: 'duplicate key value', code: '23505' })).toMatch(/already exists/);
    expect(describeDbError({ message: 'insert or update violates foreign key constraint "x"', code: '23503' })).toMatch(/still in use/);
    expect(describeDbError({ message: 'secret internal detail', code: 'XX000' })).toBe('Something went wrong. Please try again.');
  });
});
