import { NextResponse, type NextRequest } from 'next/server';
import { formatNaira } from '@infinity/core';
import { getAccess, getUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { csvCell } from '@/lib/ui-helpers';

const MAX_ROWS = 5000;

interface Spec { permission: string; filename: string; headers: string[]; load: (sb: Awaited<ReturnType<typeof createClient>>, p: URLSearchParams) => Promise<unknown[][]> }

const range = (q: URLSearchParams, col: string) => ({ from: q.get('from') ? `${q.get('from')}T00:00:00+01:00` : null, to: q.get('to') ? `${q.get('to')}T23:59:59+01:00` : null, col });

const SPECS: Record<string, Spec> = {
  payments: {
    permission: 'payments.view', filename: 'payments', headers: ['Reference', 'Created', 'Paid at', 'Provider', 'Purpose', 'Customer', 'Amount (NGN)', 'Status', 'Failure reason'],
    async load(sb, p) {
      const r = range(p, 'created_at');
      let q = sb.from('payments').select('reference, created_at, paid_at, provider, purpose, amount_kobo, status, failure_reason, profiles(full_name)').order('created_at', { ascending: false }).limit(MAX_ROWS);
      if (r.from) q = q.gte('created_at', r.from);
      if (r.to) q = q.lte('created_at', r.to);
      const status = p.get('status');
      if (status) q = q.eq('status', status as 'succeeded');
      const { data } = await q.returns<{ reference: string; created_at: string; paid_at: string | null; provider: string; purpose: string; amount_kobo: number; status: string; failure_reason: string | null; profiles: { full_name: string | null } | null }[]>();
      return (data ?? []).map((x) => [x.reference, x.created_at, x.paid_at, x.provider, x.purpose, x.profiles?.full_name, formatNaira(Number(x.amount_kobo)).replace('₦', ''), x.status, x.failure_reason]);
    },
  },
  bookings: {
    permission: 'bookings.view', filename: 'bookings', headers: ['Reference', 'Starts', 'Treatment', 'Customer', 'Branch', 'Staff', 'Total (NGN)', 'Paid (NGN)', 'Status'],
    async load(sb, p) {
      const r = range(p, 'starts_at');
      let q = sb.from('bookings').select('reference, starts_at, service_name, total_kobo, paid_kobo, status, branches(name), staff(full_name), profiles(full_name)').order('starts_at', { ascending: false }).limit(MAX_ROWS);
      if (r.from) q = q.gte('starts_at', r.from);
      if (r.to) q = q.lte('starts_at', r.to);
      const { data } = await q.returns<{ reference: string; starts_at: string; service_name: string; total_kobo: number; paid_kobo: number; status: string; branches: { name: string } | null; staff: { full_name: string } | null; profiles: { full_name: string | null } | null }[]>();
      return (data ?? []).map((x) => [x.reference, x.starts_at, x.service_name, x.profiles?.full_name, x.branches?.name, x.staff?.full_name, Number(x.total_kobo) / 100, Number(x.paid_kobo) / 100, x.status]);
    },
  },
  orders: {
    permission: 'orders.view', filename: 'orders', headers: ['Order', 'Placed', 'Customer', 'Branch', 'Method', 'Subtotal (NGN)', 'Discount (NGN)', 'Delivery (NGN)', 'Total (NGN)', 'Status'],
    async load(sb, p) {
      const r = range(p, 'created_at');
      let q = sb.from('orders').select('number, created_at, contact_name, fulfilment, subtotal_kobo, discount_kobo, delivery_fee_kobo, total_kobo, status, branches(name)').order('created_at', { ascending: false }).limit(MAX_ROWS);
      if (r.from) q = q.gte('created_at', r.from);
      if (r.to) q = q.lte('created_at', r.to);
      const { data } = await q.returns<{ number: string; created_at: string; contact_name: string | null; fulfilment: string; subtotal_kobo: number; discount_kobo: number; delivery_fee_kobo: number; total_kobo: number; status: string; branches: { name: string } | null }[]>();
      return (data ?? []).map((x) => [x.number, x.created_at, x.contact_name, x.branches?.name, x.fulfilment, Number(x.subtotal_kobo) / 100, Number(x.discount_kobo) / 100, Number(x.delivery_fee_kobo) / 100, Number(x.total_kobo) / 100, x.status]);
    },
  },
  inventory: {
    permission: 'inventory.view', filename: 'inventory', headers: ['Product', 'Size', 'SKU', 'Branch', 'On hand', 'Reserved', 'Available', 'Low-stock alert at'],
    async load(sb) {
      const { data } = await sb.from('inventory').select('quantity, reserved, branches(name), product_variants(name, sku, low_stock_threshold, products(name))').limit(MAX_ROWS)
        .returns<{ quantity: number; reserved: number; branches: { name: string } | null; product_variants: { name: string; sku: string; low_stock_threshold: number; products: { name: string } | null } | null }[]>();
      return (data ?? []).map((x) => [x.product_variants?.products?.name, x.product_variants?.name, x.product_variants?.sku, x.branches?.name, x.quantity, x.reserved, x.quantity - x.reserved, x.product_variants?.low_stock_threshold]);
    },
  },
};

/** CSV export, produced with the staff member's own session so RLS limits it to what they may see. Cells are protected against spreadsheet formula injection. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const spec = SPECS[kind];
  if (!spec) return NextResponse.json({ error: 'Unknown export' }, { status: 404 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const access = await getAccess();
  if (!access.hasAny(spec.permission)) return NextResponse.json({ error: 'Not permitted' }, { status: 403 });

  const supabase = await createClient();
  const rows = await spec.load(supabase, request.nextUrl.searchParams);
  const body = '﻿' + [spec.headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${spec.filename}-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
