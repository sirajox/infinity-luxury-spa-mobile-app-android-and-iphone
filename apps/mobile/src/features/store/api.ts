import { supabase } from '@/lib/supabase';
import { ilikeTerm } from '@/lib/format';

export interface ProductVariant { id: string; name: string; sku: string; price_kobo: number; compare_at_price_kobo: number | null }

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  thumbnail_url: string | null;
  is_best_seller: boolean;
  is_new_arrival: boolean;
  is_featured: boolean;
  category_id: string | null;
  product_variants: ProductVariant[];
}

export interface ProductDetail extends ProductSummary {
  description: string | null;
  ingredients: string | null;
  how_to_use: string | null;
  product_images: { id: string; url: string; alt: string | null; position: number }[];
  product_categories: { slug: string; name: string } | null;
}

export interface ProductCategory { id: string; slug: string; name: string }
export type ProductFlag = 'best' | 'new' | 'featured';
export type StockStatus = { inStock: boolean; lowStock: boolean };

const VARIANTS = 'product_variants(id, name, sku, price_kobo, compare_at_price_kobo)';
const PRODUCT_COLUMNS = `id, slug, name, summary, thumbnail_url, is_best_seller, is_new_arrival, is_featured, category_id, ${VARIANTS}`;
export const PAGE_SIZE = 12;

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export const cheapestVariant = (p: { product_variants: ProductVariant[] }): ProductVariant | undefined =>
  [...p.product_variants].sort((a, b) => a.price_kobo - b.price_kobo)[0];

export function discountPercent(v: Pick<ProductVariant, 'price_kobo' | 'compare_at_price_kobo'>): number | null {
  if (!v.compare_at_price_kobo || v.compare_at_price_kobo <= v.price_kobo) return null;
  return Math.round(((v.compare_at_price_kobo - v.price_kobo) / v.compare_at_price_kobo) * 100);
}

export async function fetchProductCategories(): Promise<ProductCategory[]> {
  const { data, error } = await supabase.from('product_categories').select('id, slug, name').eq('is_active', true).is('parent_id', null).order('display_order');
  fail(error);
  return data ?? [];
}

export async function fetchProducts(p: { categoryId?: string | null; q?: string; flag?: ProductFlag; page: number }): Promise<{ items: ProductSummary[]; hasMore: boolean }> {
  let q = supabase.from('products').select(PRODUCT_COLUMNS).eq('is_active', true);
  if (p.categoryId) q = q.eq('category_id', p.categoryId);
  if (p.flag === 'best') q = q.eq('is_best_seller', true);
  if (p.flag === 'new') q = q.eq('is_new_arrival', true);
  if (p.flag === 'featured') q = q.eq('is_featured', true);
  const term = p.q ? ilikeTerm(p.q) : '';
  if (term.length >= 2) q = q.ilike('name', `%${term}%`);
  const from = p.page * PAGE_SIZE;
  const { data, error } = await q.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE).returns<ProductSummary[]>();
  fail(error);
  const rows = data ?? [];
  return { items: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
}

export async function fetchProduct(slug: string): Promise<ProductDetail | null> {
  const { data, error } = await supabase
    .from('products')
    .select(`${PRODUCT_COLUMNS}, description, ingredients, how_to_use, product_images(id, url, alt, position), product_categories(slug, name)`)
    .eq('slug', slug).eq('is_active', true).maybeSingle().returns<ProductDetail | null>();
  fail(error);
  return data ? { ...data, product_images: [...data.product_images].sort((a, b) => a.position - b.position) } : null;
}

export async function fetchRelatedProducts(product: { id: string; category_id: string | null }, limit = 6): Promise<ProductSummary[]> {
  if (!product.category_id) return [];
  const { data, error } = await supabase.from('products').select(PRODUCT_COLUMNS).eq('is_active', true).eq('category_id', product.category_id).neq('id', product.id).limit(limit).returns<ProductSummary[]>();
  fail(error);
  return data ?? [];
}

/** Coarse stock for a branch from a view that never exposes exact quantities. Display-only: checkout re-validates. */
export async function fetchStockStatus(variantIds: string[], branchId: string): Promise<Record<string, StockStatus>> {
  if (variantIds.length === 0) return {};
  const { data, error } = await supabase.from('product_stock_status').select('variant_id, in_stock, low_stock').eq('branch_id', branchId).in('variant_id', variantIds);
  fail(error);
  return Object.fromEntries((data ?? []).map((r) => [r.variant_id ?? "", { inStock: !!r.in_stock, lowStock: !!r.low_stock }]));
}

export async function fetchProductRating(productId: string): Promise<{ average: number; count: number } | null> {
  const { data, error } = await supabase.from('product_ratings').select('average, review_count').eq('product_id', productId).maybeSingle();
  fail(error);
  return data ? { average: Number(data.average), count: data.review_count ?? 0 } : null;
}

export async function toggleWishlist(target: { productId?: string; serviceId?: string }): Promise<boolean> {
  const { data, error } = await supabase.rpc('toggle_wishlist', { p_product: target.productId ?? null, p_service: target.serviceId ?? null });
  if (error) throw new Error(error.message);
  return !!data;
}

export interface WishlistEntry { id: string; product: ProductSummary | null; service: { id: string; slug: string; name: string; thumbnail_url: string | null; price_type: 'fixed' | 'from' | 'quote'; price_kobo: number | null } | null }

export async function fetchWishlist(): Promise<WishlistEntry[]> {
  const { data, error } = await supabase
    .from('wishlist_items')
    .select(`id, products(${PRODUCT_COLUMNS}), services(id, slug, name, thumbnail_url, price_type, price_kobo)`)
    .order('created_at', { ascending: false })
    .returns<{ id: string; products: ProductSummary | null; services: WishlistEntry['service'] }[]>();
  fail(error);
  return (data ?? []).map((r) => ({ id: r.id, product: r.products, service: r.services }));
}
