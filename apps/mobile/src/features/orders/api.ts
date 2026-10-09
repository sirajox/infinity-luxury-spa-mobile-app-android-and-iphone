import { supabase } from '@/lib/supabase';

export type OrderStatus = 'placed' | 'payment_confirmed' | 'processing' | 'ready_for_pickup' | 'shipped' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'refunded';

export interface OrderRow {
  id: string;
  number: string;
  status: OrderStatus;
  fulfilment: 'delivery' | 'pickup';
  subtotal_kobo: number;
  discount_kobo: number;
  delivery_fee_kobo: number;
  total_kobo: number;
  paid_at: string | null;
  created_at: string;
  tracking_number: string | null;
  carrier: string | null;
  estimated_delivery: string | null;
  shipping_address: { state?: string; city?: string; address?: string; landmark?: string } | null;
  contact_name: string | null;
  reservation_expires_at: string | null;
  branches: { id: string; name: string; phone: string | null; whatsapp: string | null } | null;
  order_items: { id: string; name_snapshot: string; variant_snapshot: string; image_snapshot: string | null; unit_price_kobo: number; quantity: number; line_total_kobo: number }[];
}

export interface OrderHistoryRow { id: number; to_status: OrderStatus; note: string | null; created_at: string }

const SELECT = `id, number, status, fulfilment, subtotal_kobo, discount_kobo, delivery_fee_kobo, total_kobo, paid_at, created_at,
  tracking_number, carrier, estimated_delivery, shipping_address, contact_name, reservation_expires_at,
  branches(id, name, phone, whatsapp), order_items(id, name_snapshot, variant_snapshot, image_snapshot, unit_price_kobo, quantity, line_total_kobo)`;

export async function fetchOrders(): Promise<OrderRow[]> {
  const { data, error } = await supabase.from('orders').select(SELECT).order('created_at', { ascending: false }).limit(50).returns<OrderRow[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchOrder(id: string): Promise<{ order: OrderRow; history: OrderHistoryRow[] } | null> {
  const [o, h] = await Promise.all([
    supabase.from('orders').select(SELECT).eq('id', id).maybeSingle().returns<OrderRow | null>(),
    supabase.from('order_status_history').select('id, to_status, note, created_at').eq('order_id', id).order('created_at').returns<OrderHistoryRow[]>(),
  ]);
  if (o.error) throw new Error(o.error.message);
  if (h.error) throw new Error(h.error.message);
  return o.data ? { order: o.data, history: h.data ?? [] } : null;
}

export const ORDER_STEPS: { status: OrderStatus; title: string }[] = [
  { status: 'placed', title: 'Order placed' },
  { status: 'payment_confirmed', title: 'Payment confirmed' },
  { status: 'processing', title: 'Processing' },
  { status: 'shipped', title: 'Shipped' },
  { status: 'out_for_delivery', title: 'Out for delivery' },
  { status: 'delivered', title: 'Delivered' },
];

export const PICKUP_STEPS: { status: OrderStatus; title: string }[] = [
  { status: 'placed', title: 'Order placed' },
  { status: 'payment_confirmed', title: 'Payment confirmed' },
  { status: 'processing', title: 'Processing' },
  { status: 'ready_for_pickup', title: 'Ready for pickup' },
  { status: 'delivered', title: 'Collected' },
];

export function orderStatusLabel(status: OrderStatus): string {
  return ({
    placed: 'Awaiting payment', payment_confirmed: 'Paid', processing: 'Processing', ready_for_pickup: 'Ready for pickup',
    shipped: 'Shipped', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled', refunded: 'Refunded',
  } as const)[status];
}
