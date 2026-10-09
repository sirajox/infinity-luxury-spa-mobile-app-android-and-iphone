import type { PaymentOption } from '@infinity/core';
import { supabase } from '@/lib/supabase';

export interface Slot { time: string; staffId: string; startsAt: string }
export interface DayAvailability { day: string; slotCount: number }

export type BookingStatus = 'pending' | 'confirmed' | 'checked_in' | 'in_progress' | 'completed' | 'cancelled' | 'no_show' | 'expired';

export interface BookingRow {
  id: string;
  reference: string;
  status: BookingStatus;
  starts_at: string;
  ends_at: string;
  total_kobo: number;
  due_now_kobo: number;
  paid_kobo: number;
  payment_option: PaymentOption;
  hold_expires_at: string | null;
  service_name: string;
  service_id: string;
  staff_id: string;
  branch_id: string;
  staff: { id: string; full_name: string } | null;
  branches: { id: string; name: string; area: string | null; address_line: string; city: string; timezone: string; phone: string | null; whatsapp: string | null; latitude: number | null; longitude: number | null } | null;
  services: { slug: string; thumbnail_url: string | null } | null;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/** Authoritative slots from the database. Never cached for decisions and never computed on the client. */
export async function fetchSlots(p: { serviceId: string; branchId: string; staffId: string | null; date: string; excludeBooking?: string }): Promise<Slot[]> {
  const { data, error } = await supabase.rpc('get_available_slots', {
    p_service: p.serviceId, p_branch: p.branchId, p_staff: p.staffId, p_date: p.date, p_exclude_booking: p.excludeBooking ?? null,
  });
  fail(error);
  const seen = new Set<string>();
  return (data ?? [])
    .map((r) => ({ time: r.slot_time.slice(0, 5), staffId: r.slot_staff_id, startsAt: r.slot_starts_at }))
    // "Any staff" returns one row per specialist; the customer only needs each time once.
    .filter((s) => (seen.has(s.time) ? false : (seen.add(s.time), true)));
}

export async function fetchAvailableDays(p: { serviceId: string; branchId: string; staffId: string | null; from: string; to: string }): Promise<DayAvailability[]> {
  const { data, error } = await supabase.rpc('get_available_days', { p_service: p.serviceId, p_branch: p.branchId, p_staff: p.staffId, p_from: p.from, p_to: p.to });
  fail(error);
  return (data ?? []).map((d) => ({ day: d.day, slotCount: d.slot_count }));
}

export async function createBooking(p: { serviceId: string; branchId: string; staffId: string | null; date: string; time: string; paymentOption: PaymentOption }) {
  const { data, error } = await supabase.rpc('create_booking', {
    p_service: p.serviceId, p_branch: p.branchId, p_staff: p.staffId, p_date: p.date, p_time: p.time, p_payment_option: p.paymentOption,
  });
  if (error) throw new Error(error.message);
  return data;
}

const BOOKING_SELECT = `id, reference, status, starts_at, ends_at, total_kobo, due_now_kobo, paid_kobo, payment_option, hold_expires_at,
  service_name, service_id, staff_id, branch_id, staff(id, full_name),
  branches(id, name, area, address_line, city, timezone, phone, whatsapp, latitude, longitude), services(slug, thumbnail_url)`;

export type BookingGroup = 'upcoming' | 'completed' | 'cancelled';

export async function fetchMyBookings(group: BookingGroup): Promise<BookingRow[]> {
  let q = supabase.from('bookings').select(BOOKING_SELECT);
  if (group === 'upcoming') q = q.in('status', ['pending', 'confirmed', 'checked_in', 'in_progress']).order('starts_at', { ascending: true });
  else if (group === 'completed') q = q.eq('status', 'completed').order('starts_at', { ascending: false });
  else q = q.in('status', ['cancelled', 'no_show', 'expired']).order('starts_at', { ascending: false });
  const { data, error } = await q.limit(50).returns<BookingRow[]>();
  fail(error);
  // A pending booking whose hold lapsed is effectively gone, even before the scheduled sweep marks it expired.
  return (data ?? []).filter((b) => !(b.status === 'pending' && b.hold_expires_at && new Date(b.hold_expires_at) < new Date()));
}

export async function fetchBooking(id: string): Promise<BookingRow | null> {
  const { data, error } = await supabase.from('bookings').select(BOOKING_SELECT).eq('id', id).maybeSingle().returns<BookingRow | null>();
  fail(error);
  return data;
}

export async function cancelBooking(id: string, reason?: string) {
  const { error } = await supabase.rpc('cancel_booking', { p_booking: id, p_reason: reason ?? null });
  if (error) throw new Error(error.message);
}

export async function rescheduleBooking(id: string, date: string, time: string) {
  const { error } = await supabase.rpc('reschedule_booking', { p_booking: id, p_date: date, p_time: time });
  if (error) throw new Error(error.message);
}
