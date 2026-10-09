import { supabase } from '@/lib/supabase';
import { ilikeTerm } from '@/lib/format';

export type PriceType = 'fixed' | 'from' | 'quote';

export interface Branch {
  id: string;
  slug: string;
  name: string;
  is_main: boolean;
  address_line: string;
  area: string | null;
  city: string;
  state: string;
  phone: string | null;
  whatsapp: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  bookings_enabled: boolean;
  hours_verified: boolean;
}

export interface CategoryStat { treatment_count: number; from_price_kobo: number | null }
export interface Category { id: string; slug: string; name: string; description: string | null; icon: string | null; image_url: string | null; stats: CategoryStat }
export interface Subcategory { id: string; slug: string; name: string; description: string | null; image_url: string | null; stats: CategoryStat }

export interface ServiceSummary {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  thumbnail_url: string | null;
  duration_minutes: number;
  price_type: PriceType;
  price_kobo: number | null;
  session_count: number | null;
  is_featured: boolean;
  category_id: string;
  subcategory_id: string | null;
}

export interface ServiceDetail extends ServiceSummary {
  description: string | null;
  gallery_urls: string[];
  buffer_minutes: number;
  package_info: string | null;
  category: { slug: string; name: string; icon: string | null } | null;
  subcategory: { slug: string; name: string } | null;
  branch_ids: string[];
}

export interface StaffSummary {
  id: string;
  full_name: string;
  photo_url: string | null;
  job_title: string;
  bio: string | null;
  specialties: string[];
  phone: string | null;
  whatsapp: string | null;
  rating_average: number | null;
  review_count: number;
  branches: { id: string; name: string }[];
}

const BRANCH_COLUMNS = 'id, slug, name, is_main, address_line, area, city, state, phone, whatsapp, latitude, longitude, timezone, bookings_enabled, hours_verified';
const SERVICE_COLUMNS = 'id, slug, name, short_description, thumbnail_url, duration_minutes, price_type, price_kobo, session_count, is_featured, category_id, subcategory_id';

function fail(error: { message: string } | null): never | void {
  if (error) throw new Error(error.message);
}

export async function fetchBranches(): Promise<Branch[]> {
  const { data, error } = await supabase.from('branches').select(BRANCH_COLUMNS).eq('is_active', true).order('display_order').returns<Branch[]>();
  fail(error);
  return data ?? [];
}

export async function fetchCategories(): Promise<Category[]> {
  const [cats, stats] = await Promise.all([
    supabase.from('service_categories').select('id, slug, name, description, icon, image_url').eq('is_active', true).order('display_order'),
    supabase.from('service_category_stats').select('category_id, treatment_count, from_price_kobo'),
  ]);
  fail(cats.error);
  fail(stats.error);
  const byId = new Map((stats.data ?? []).map((s) => [s.category_id, s]));
  return (cats.data ?? []).map((c) => ({
    ...c,
    stats: { treatment_count: byId.get(c.id)?.treatment_count ?? 0, from_price_kobo: byId.get(c.id)?.from_price_kobo ?? null },
  }));
}

export async function fetchCategoryWithSubcategories(slug: string) {
  const { data: category, error } = await supabase.from('service_categories').select('id, slug, name, description, icon').eq('slug', slug).maybeSingle();
  fail(error);
  if (!category) return null;
  const [subs, stats, loose] = await Promise.all([
    supabase.from('service_subcategories').select('id, slug, name, description, image_url').eq('category_id', category.id).eq('is_active', true).order('display_order'),
    supabase.from('service_subcategory_stats').select('subcategory_id, treatment_count, from_price_kobo'),
    // Treatments filed directly under the category (no subcategory) are listed alongside the subcategories.
    supabase.from('services').select(SERVICE_COLUMNS).eq('category_id', category.id).is('subcategory_id', null).eq('is_active', true).order('display_order').returns<ServiceSummary[]>(),
  ]);
  fail(subs.error);
  fail(stats.error);
  fail(loose.error);
  const byId = new Map((stats.data ?? []).map((s) => [s.subcategory_id, s]));
  const subcategories: Subcategory[] = (subs.data ?? []).map((s) => ({
    ...s,
    stats: { treatment_count: byId.get(s.id)?.treatment_count ?? 0, from_price_kobo: byId.get(s.id)?.from_price_kobo ?? null },
  }));
  const total = subcategories.reduce((n, s) => n + s.stats.treatment_count, 0) + (loose.data?.length ?? 0);
  return { category, subcategories, directServices: loose.data ?? [], total };
}

export async function fetchSubcategoryWithServices(slug: string) {
  const { data: sub, error } = await supabase
    .from('service_subcategories').select('id, slug, name, description, category_id').eq('slug', slug).limit(1).maybeSingle();
  fail(error);
  if (!sub) return null;
  const { data, error: e2 } = await supabase.from('services').select(SERVICE_COLUMNS).eq('subcategory_id', sub.id).eq('is_active', true).order('display_order').returns<ServiceSummary[]>();
  fail(e2);
  return { subcategory: sub, services: data ?? [] };
}

export async function fetchFeaturedServices(limit = 8): Promise<ServiceSummary[]> {
  const { data, error } = await supabase.from('services').select(SERVICE_COLUMNS).eq('is_active', true).eq('is_featured', true).order('display_order').limit(limit).returns<ServiceSummary[]>();
  fail(error);
  return data ?? [];
}

export async function fetchService(slug: string): Promise<ServiceDetail | null> {
  const { data, error } = await supabase
    .from('services')
    .select(`${SERVICE_COLUMNS}, description, gallery_urls, buffer_minutes, package_info,
             service_categories(slug, name, icon), service_subcategories(slug, name), service_branches(branch_id)`)
    .eq('slug', slug).eq('is_active', true).maybeSingle()
    .returns<(ServiceSummary & Omit<ServiceDetail, keyof ServiceSummary | 'category' | 'subcategory' | 'branch_ids'> & {
      service_categories: ServiceDetail['category']; service_subcategories: ServiceDetail['subcategory']; service_branches: { branch_id: string }[];
    }) | null>();
  fail(error);
  if (!data) return null;
  const { service_categories, service_subcategories, service_branches, ...rest } = data;
  return { ...rest, category: service_categories, subcategory: service_subcategories, branch_ids: service_branches.map((b) => b.branch_id) };
}

export async function searchServices(term: string, limit = 12): Promise<ServiceSummary[]> {
  const t = ilikeTerm(term);
  if (t.length < 2) return [];
  const { data, error } = await supabase.from('services').select(SERVICE_COLUMNS).eq('is_active', true).ilike('name', `%${t}%`).order('display_order').limit(limit).returns<ServiceSummary[]>();
  fail(error);
  return data ?? [];
}

type StaffRow = Omit<StaffSummary, 'rating_average' | 'review_count' | 'branches'> & { staff_branches: { branches: { id: string; name: string } | null }[] };

async function withRatings(rows: StaffRow[]): Promise<StaffSummary[]> {
  if (rows.length === 0) return [];
  const { data: ratings, error } = await supabase.from('staff_ratings').select('staff_id, average, review_count').in('staff_id', rows.map((r) => r.id));
  fail(error);
  const byId = new Map((ratings ?? []).map((r) => [r.staff_id, r]));
  return rows.map(({ staff_branches, ...s }) => ({
    ...s,
    rating_average: byId.get(s.id) ? Number(byId.get(s.id)?.average) : null,
    review_count: byId.get(s.id)?.review_count ?? 0,
    branches: staff_branches.flatMap((b) => (b.branches ? [b.branches] : [])),
  }));
}

const STAFF_COLUMNS = 'id, full_name, photo_url, job_title, bio, specialties, phone, whatsapp, staff_branches(branches(id, name))';

export async function fetchTopStaff(limit = 6): Promise<StaffSummary[]> {
  const { data, error } = await supabase.from('staff').select(STAFF_COLUMNS).eq('is_active', true).order('display_order').limit(40).returns<StaffRow[]>();
  fail(error);
  const withR = await withRatings(data ?? []);
  return withR.sort((a, b) => (b.rating_average ?? 0) - (a.rating_average ?? 0)).slice(0, limit);
}

export async function fetchStaff(id: string): Promise<StaffSummary | null> {
  const { data, error } = await supabase.from('staff').select(STAFF_COLUMNS).eq('id', id).eq('is_active', true).maybeSingle().returns<StaffRow | null>();
  fail(error);
  return data ? (await withRatings([data]))[0] ?? null : null;
}

/** Staff who can perform a treatment at a branch, with their verified ratings. */
export async function fetchEligibleStaff(serviceId: string, branchId: string): Promise<StaffSummary[]> {
  const [bySvc, byBranch] = await Promise.all([
    supabase.from('staff_services').select('staff_id').eq('service_id', serviceId),
    supabase.from('staff_branches').select('staff_id').eq('branch_id', branchId),
  ]);
  fail(bySvc.error);
  fail(byBranch.error);
  const branchSet = new Set((byBranch.data ?? []).map((r) => r.staff_id));
  const ids = (bySvc.data ?? []).map((r) => r.staff_id).filter((id) => branchSet.has(id));
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('staff').select(STAFF_COLUMNS).in('id', ids).eq('is_active', true).order('display_order').returns<StaffRow[]>();
  fail(error);
  return withRatings(data ?? []);
}

export async function fetchStaffTreatments(staffId: string): Promise<ServiceSummary[]> {
  const { data: links, error } = await supabase.from('staff_services').select('service_id').eq('staff_id', staffId);
  fail(error);
  const ids = (links ?? []).map((l) => l.service_id);
  if (ids.length === 0) return [];
  const { data, error: e2 } = await supabase.from('services').select(SERVICE_COLUMNS).in('id', ids).eq('is_active', true).order('display_order').returns<ServiceSummary[]>();
  fail(e2);
  return data ?? [];
}

export interface Review {
  id: string;
  rating: number;
  body: string | null;
  reviewer_name: string | null;
  verified: boolean;
  created_at: string;
}

export async function fetchReviews(target: { staffId?: string; serviceId?: string; productId?: string }, limit = 20): Promise<Review[]> {
  let q = supabase.from('reviews').select('id, rating, body, reviewer_name, verified, created_at').eq('status', 'approved').order('created_at', { ascending: false }).limit(limit);
  if (target.staffId) q = q.eq('staff_id', target.staffId);
  if (target.serviceId) q = q.eq('service_id', target.serviceId);
  if (target.productId) q = q.eq('product_id', target.productId);
  const { data, error } = await q;
  fail(error);
  return data ?? [];
}
