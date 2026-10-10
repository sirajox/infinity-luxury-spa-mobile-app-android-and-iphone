'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { formAction } from '@/lib/action-wrapper';
import { UserError, describeDbError, type ActionState } from '@/lib/actions';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, parseNaira } from '@/lib/resources/engine';

const uuid = z.string().uuid();
const money = (label: string) => z.string().min(1, `${label} is required`).transform((v, ctx) => {
  const k = parseNaira(v);
  if (k === null) ctx.addIssue({ code: 'custom', message: 'Enter an amount, e.g. 18500' });
  return k ?? 0;
});

/** Create or update one size/variant. Price changes are audited by a database trigger. */
export const saveVariant = formAction({
  permission: 'products.update',
  schema: z.object({
    id: z.string().optional(), product_id: uuid, name: z.string().trim().min(1, 'Name the size, e.g. 30 ml'), sku: z.string().trim().min(2, 'Enter a SKU').max(60),
    price: money('Price'), compare_at: z.string().optional(), low_stock_threshold: z.coerce.number().int().min(0).default(5), is_active: z.union([z.string(), z.array(z.string())]).optional(),
  }),
}, async (d, { supabase }) => {
  const compare = d.compare_at ? parseNaira(d.compare_at) : null;
  if (d.compare_at && compare === null) throw new UserError('Enter a valid compare-at price.');
  if (compare !== null && compare <= d.price) throw new UserError('The compare-at price must be higher than the selling price.');
  const active = (Array.isArray(d.is_active) ? d.is_active[d.is_active.length - 1] : d.is_active) === 'true';
  const row = { product_id: d.product_id, name: d.name, sku: d.sku, price_kobo: d.price, compare_at_price_kobo: compare, low_stock_threshold: d.low_stock_threshold, is_active: active };
  const q = d.id ? supabase.from('product_variants').update(row).eq('id', d.id) : supabase.from('product_variants').insert(row);
  const { error } = await q;
  if (error) throw new UserError(describeDbError(error));
  revalidatePath('/manage/products');
  return d.id ? 'Variant saved.' : 'Variant added.';
});

export const addProductImage = formAction({ permission: 'products.update', schema: z.object({ product_id: uuid, alt: z.string().trim().optional() }) }, async (d, { supabase }, raw) => {
  const file = raw.get('file');
  if (!(file instanceof File) || file.size === 0) throw new UserError('Choose an image to upload.');
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw new UserError('Use a JPEG, PNG or WebP image.');
  if (file.size > MAX_IMAGE_BYTES) throw new UserError('The image must be 5 MB or smaller.');
  const path = `products/${d.product_id}/${randomUUID()}.${ext}`;
  const up = await supabase.storage.from('product-images').upload(path, file, { contentType: file.type, cacheControl: '31536000' });
  if (up.error) throw new UserError(describeDbError(up.error));
  const url = supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
  const { count } = await supabase.from('product_images').select('id', { count: 'exact', head: true }).eq('product_id', d.product_id);
  const { error } = await supabase.from('product_images').insert({ product_id: d.product_id, url, alt: d.alt || null, position: count ?? 0 });
  if (error) throw new UserError(describeDbError(error));
  revalidatePath('/manage/products');
  return 'Image added.';
});

export async function removeProductImage(prev: ActionState, fd: FormData): Promise<ActionState> {
  return formAction({ permission: 'products.update', schema: z.object({ id: uuid }) }, async (d, { supabase }) => {
    const { error } = await supabase.from('product_images').delete().eq('id', d.id);
    if (error) throw new UserError(describeDbError(error));
    revalidatePath('/manage/products');
    return 'Image removed.';
  })(prev, fd);
}
