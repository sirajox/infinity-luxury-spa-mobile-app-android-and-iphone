import { supabase } from '@/lib/supabase';

export interface CartLine {
  variantId: string;
  productId: string;
  productSlug: string;
  name: string;
  variantName: string;
  image: string | null;
  priceKobo: number;
  compareAtKobo: number | null;
  quantity: number;
}

interface CartVariantRow {
  id: string;
  name: string;
  price_kobo: number;
  compare_at_price_kobo: number | null;
  is_active: boolean;
  products: { id: string; slug: string; name: string; thumbnail_url: string | null; is_active: boolean } | null;
}

const VARIANT_SELECT = 'id, name, price_kobo, compare_at_price_kobo, is_active, products(id, slug, name, thumbnail_url, is_active)';

function toLine(v: CartVariantRow, quantity: number): CartLine | null {
  if (!v.is_active || !v.products?.is_active) return null; // unavailable items are dropped, never purchasable
  return {
    variantId: v.id, productId: v.products.id, productSlug: v.products.slug, name: v.products.name, variantName: v.name,
    image: v.products.thumbnail_url, priceKobo: v.price_kobo, compareAtKobo: v.compare_at_price_kobo, quantity,
  };
}

/** Signed-in cart (RLS limits rows to the caller). Prices shown are for display; quote_cart is authoritative. */
export async function fetchServerCart(): Promise<CartLine[]> {
  const { data, error } = await supabase.from('cart_items').select(`quantity, created_at, product_variants(${VARIANT_SELECT})`).order('created_at').returns<{ quantity: number; product_variants: CartVariantRow | null }[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((r) => (r.product_variants ? [toLine(r.product_variants, r.quantity)] : [])).filter((l): l is CartLine => l !== null);
}

export async function fetchGuestCart(lines: { variantId: string; quantity: number }[]): Promise<CartLine[]> {
  if (lines.length === 0) return [];
  const { data, error } = await supabase.from('product_variants').select(VARIANT_SELECT).in('id', lines.map((l) => l.variantId)).returns<CartVariantRow[]>();
  if (error) throw new Error(error.message);
  const qty = new Map(lines.map((l) => [l.variantId, l.quantity]));
  return (data ?? []).flatMap((v) => [toLine(v, qty.get(v.id) ?? 1)]).filter((l): l is CartLine => l !== null);
}

export async function cartAdd(variantId: string, delta: number) {
  const { error } = await supabase.rpc('cart_add', { p_variant: variantId, p_delta: delta });
  if (error) throw new Error(error.message);
}

export interface Quote {
  subtotal_kobo: number;
  discount_kobo: number;
  delivery_fee_kobo: number;
  total_kobo: number;
  coupon_code: string | null;
  errors: string[];
  lines: { variant_id: string; quantity: number; available: number; name: string }[];
}

export async function quoteCart(p: { branchId: string; fulfilment: 'delivery' | 'pickup'; state?: string | null; coupon?: string | null }): Promise<Quote> {
  const { data, error } = await supabase.rpc('quote_cart', { p_branch: p.branchId, p_fulfilment: p.fulfilment, p_state: p.state ?? null, p_coupon: p.coupon ?? null });
  if (error) throw new Error(error.message);
  return data as unknown as Quote;
}

export interface OrderAddress { state: string; city: string; address: string; landmark: string; phone: string }

export async function createOrder(p: {
  branchId: string; fulfilment: 'delivery' | 'pickup'; contactName: string; contactPhone: string; address: OrderAddress | null; coupon?: string | null;
}) {
  const { data, error } = await supabase.rpc('create_order', {
    p_branch: p.branchId, p_fulfilment: p.fulfilment, p_contact_name: p.contactName, p_contact_phone: p.contactPhone,
    p_address: (p.address ?? {}) as unknown as never, p_coupon: p.coupon ?? null,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function cancelUnpaidOrder(id: string) {
  const { error } = await supabase.rpc('cancel_unpaid_order', { p_order: id });
  if (error) throw new Error(error.message);
}
