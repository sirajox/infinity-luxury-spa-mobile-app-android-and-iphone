import { FunctionsHttpError } from '@supabase/supabase-js';
import { AppError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  preferred_branch_id: string | null;
  tour_completed: boolean;
}

export interface Address { id: string; label: string | null; state: string; city: string; address_line: string; landmark: string | null; phone: string; is_default: boolean }
export interface Prefs { bookings: boolean; orders: boolean; offers: boolean; push_enabled: boolean; email_enabled: boolean }
export interface NotificationRow { id: string; kind: 'booking' | 'order' | 'payment' | 'membership' | 'offer' | 'system'; title: string; body: string; data: Record<string, string>; read_at: string | null; created_at: string }
export interface Faq { id: string; question: string; answer: string }
export interface ContentPage { slug: string; title: string; body_markdown: string; is_published: boolean }
export interface TourStep { id: string; kind: 'onboarding' | 'tour'; position: number; title: string; body: string; target: string | null }

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('id, full_name, email, phone, avatar_url, preferred_branch_id, tour_completed').eq('id', userId).maybeSingle();
  fail(error);
  return data;
}

export async function updateProfile(userId: string, patch: Partial<Pick<Profile, 'full_name' | 'phone' | 'avatar_url' | 'preferred_branch_id' | 'tour_completed'>>) {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  fail(error);
}

export async function fetchProfileStats(): Promise<{ bookings: number; orders: number; wishlist: number }> {
  const [b, o, w] = await Promise.all([
    supabase.from('bookings').select('id', { count: 'exact', head: true }).in('status', ['confirmed', 'checked_in', 'in_progress', 'completed']),
    supabase.from('orders').select('id', { count: 'exact', head: true }).neq('status', 'cancelled'),
    supabase.from('wishlist_items').select('id', { count: 'exact', head: true }),
  ]);
  fail(b.error); fail(o.error); fail(w.error);
  return { bookings: b.count ?? 0, orders: o.count ?? 0, wishlist: w.count ?? 0 };
}

export async function fetchAddresses(): Promise<Address[]> {
  const { data, error } = await supabase.from('addresses').select('id, label, state, city, address_line, landmark, phone, is_default').order('is_default', { ascending: false }).order('created_at', { ascending: false });
  fail(error);
  return data ?? [];
}

export async function saveAddress(userId: string, a: Omit<Address, 'id'> & { id?: string }) {
  if (a.is_default) await supabase.from('addresses').update({ is_default: false }).eq('user_id', userId);
  const row = { user_id: userId, label: a.label, state: a.state, city: a.city, address_line: a.address_line, landmark: a.landmark, phone: a.phone, is_default: a.is_default };
  const { error } = a.id ? await supabase.from('addresses').update(row).eq('id', a.id) : await supabase.from('addresses').insert(row);
  fail(error);
}

export async function deleteAddress(id: string) {
  const { error } = await supabase.from('addresses').delete().eq('id', id);
  fail(error);
}

export async function fetchPrefs(userId: string): Promise<Prefs> {
  const { data, error } = await supabase.from('notification_preferences').select('bookings, orders, offers, push_enabled, email_enabled').eq('user_id', userId).maybeSingle();
  fail(error);
  return data ?? { bookings: true, orders: true, offers: false, push_enabled: true, email_enabled: true };
}

export async function savePrefs(userId: string, prefs: Prefs) {
  const { error } = await supabase.from('notification_preferences').upsert({ user_id: userId, ...prefs });
  fail(error);
}

export async function fetchNotifications(): Promise<NotificationRow[]> {
  const { data, error } = await supabase.from('notifications').select('id, kind, title, body, data, read_at, created_at').order('created_at', { ascending: false }).limit(60).returns<NotificationRow[]>();
  fail(error);
  return data ?? [];
}

export async function markNotificationsRead(ids?: string[]) {
  let q = supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
  if (ids) q = q.in('id', ids);
  const { error } = await q;
  fail(error);
}

export async function fetchUnreadCount(): Promise<number> {
  const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  fail(error);
  return count ?? 0;
}

export async function fetchFaqs(): Promise<Faq[]> {
  const { data, error } = await supabase.from('faqs').select('id, question, answer').eq('is_active', true).order('display_order');
  fail(error);
  return data ?? [];
}

export async function fetchContent(slug: string): Promise<ContentPage | null> {
  const { data, error } = await supabase.from('app_content').select('slug, title, body_markdown, is_published').eq('slug', slug).maybeSingle();
  fail(error);
  return data;
}

export async function fetchTourSteps(kind: 'onboarding' | 'tour'): Promise<TourStep[]> {
  const { data, error } = await supabase.from('tour_steps').select('id, kind, position, title, body, target').eq('kind', kind).eq('is_enabled', true).order('position').returns<TourStep[]>();
  fail(error);
  return data ?? [];
}

export async function createTicket(userId: string, p: { subject: string; message: string; branchId?: string | null }) {
  const { data, error } = await supabase.from('support_tickets').insert({ user_id: userId, subject: p.subject, branch_id: p.branchId ?? null }).select('id').single();
  fail(error);
  const { error: e2 } = await supabase.from('support_messages').insert({ ticket_id: data!.id, body: p.message, author_id: userId });
  fail(e2);
}

export async function exportMyData(): Promise<string> {
  const { data, error } = await supabase.rpc('export_my_data');
  if (error) throw new Error(error.message);
  return JSON.stringify(data, null, 2);
}

export async function deleteAccount(input: { password?: string; confirm?: string }) {
  const { error } = await supabase.functions.invoke('delete-account', { body: input });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await error.context.json().catch(() => null)) as { error?: { code?: string } } | null;
      if (payload?.error?.code) throw new AppError(payload.error.code);
    }
    throw error;
  }
}

export interface MembershipPlan { id: string; slug: string; name: string; description: string | null; interval: string; duration_days: number; price_kobo: number; benefits: string[] }
export interface MembershipRow { id: string; status: 'pending' | 'active' | 'expired' | 'cancelled'; starts_at: string | null; expires_at: string | null; price_kobo: number; plan_snapshot: { name?: string } }
export interface PackageRow { id: string; slug: string; kind: string; name: string; description: string | null; image_url: string | null; price_kobo: number; original_price_kobo: number | null; validity_days: number | null; terms: string | null }

export async function fetchPlans(): Promise<MembershipPlan[]> {
  const { data, error } = await supabase.from('membership_plans').select('id, slug, name, description, interval, duration_days, price_kobo, benefits').eq('is_published', true).order('display_order');
  fail(error);
  return data ?? [];
}

export async function fetchMyMemberships(): Promise<MembershipRow[]> {
  const { data, error } = await supabase.from('memberships').select('id, status, starts_at, expires_at, price_kobo, plan_snapshot').neq('status', 'pending').order('created_at', { ascending: false }).returns<MembershipRow[]>();
  fail(error);
  return data ?? [];
}

export async function fetchPackages(): Promise<PackageRow[]> {
  const { data, error } = await supabase.from('packages').select('id, slug, kind, name, description, image_url, price_kobo, original_price_kobo, validity_days, terms').eq('is_active', true).order('display_order');
  fail(error);
  return data ?? [];
}

export async function startMembershipPurchase(planId: string) {
  const { data, error } = await supabase.rpc('create_membership_purchase', { p_plan: planId });
  if (error) throw new Error(error.message);
  return data;
}

export async function startPackagePurchase(packageId: string) {
  const { data, error } = await supabase.rpc('create_package_purchase', { p_package: packageId });
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchBanners(placement: 'home_hero' | 'store_hero') {
  const { data, error } = await supabase.from('app_banners').select('id, eyebrow, title, subtitle, cta_label, cta_target, image_url, display_order').eq('placement', placement).eq('is_active', true).order('display_order');
  fail(error);
  return data ?? [];
}

export async function fetchMaintenance(): Promise<{ enabled: boolean; message: string }> {
  const { data, error } = await supabase.from('settings').select('value').eq('key', 'maintenance').maybeSingle();
  fail(error);
  const v = (data?.value ?? {}) as { enabled?: boolean; message?: string };
  return { enabled: !!v.enabled, message: v.message ?? 'We are performing scheduled maintenance. Please check back shortly.' };
}

export async function fetchSettings<T>(key: string, fallback: T): Promise<T> {
  const { data, error } = await supabase.from('settings').select('value').eq('key', key).maybeSingle();
  fail(error);
  return (data?.value as T | undefined) ?? fallback;
}

export async function submitReview(p: { target: 'service' | 'staff' | 'product'; id: string; rating: number; body?: string }) {
  const row = {
    target: p.target, rating: p.rating, body: p.body?.trim() || null,
    service_id: p.target === 'service' ? p.id : null, staff_id: p.target === 'staff' ? p.id : null, product_id: p.target === 'product' ? p.id : null,
  };
  const { error } = await supabase.from('reviews').insert(row as never);
  if (error) throw new Error(error.message);
}

export async function fetchPurchase(kind: 'membership' | 'package', id: string): Promise<{ id: string; status: string; price_kobo: number; name: string } | null> {
  if (kind === 'membership') {
    const { data, error } = await supabase.from('memberships').select('id, status, price_kobo, plan_snapshot').eq('id', id).maybeSingle();
    fail(error);
    return data ? { id: data.id, status: data.status, price_kobo: data.price_kobo, name: String((data.plan_snapshot as { name?: string } | null)?.name ?? 'Membership') } : null;
  }
  const { data, error } = await supabase.from('package_purchases').select('id, status, price_kobo, package_snapshot').eq('id', id).maybeSingle();
  fail(error);
  return data ? { id: data.id, status: data.status, price_kobo: data.price_kobo, name: String((data.package_snapshot as { name?: string } | null)?.name ?? 'Package') } : null;
}

/** Avatars live in a private bucket under <user_id>/…; the profile stores the object path and views use signed URLs. */
export async function uploadAvatar(userId: string, bytes: ArrayBuffer): Promise<string> {
  const path = `${userId}/avatar.jpg`;
  const { error } = await supabase.storage.from('avatars').upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

export async function signedAvatarUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('avatars').createSignedUrl(path, 3600);
  return error ? null : data.signedUrl;
}
