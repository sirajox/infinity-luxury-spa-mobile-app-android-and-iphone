-- 0007: payments, webhook events, refunds, and the atomic functions that settle bookings/orders/memberships.
--
-- Trust model:
--   * Clients can only ask create_payment_intent(); the amount is computed here from authoritative records.
--   * Only service_role (Edge Functions that have verified the provider's webhook signature or called the
--     provider's verify API) may call apply_payment_success()/mark_payment_failed().

create type public.payment_provider as enum ('paystack', 'flutterwave');
create type public.payment_purpose as enum ('booking', 'booking_balance', 'order', 'membership', 'package');
create type public.payment_status as enum (
  'pending', 'processing', 'succeeded', 'failed', 'abandoned', 'refunded', 'partially_refunded'
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  provider public.payment_provider not null,
  purpose public.payment_purpose not null,
  user_id uuid references auth.users (id) on delete set null,
  booking_id uuid references public.bookings (id) on delete restrict,
  order_id uuid references public.orders (id) on delete restrict,
  membership_id uuid references public.memberships (id) on delete restrict,
  package_purchase_id uuid references public.package_purchases (id) on delete restrict,
  amount_kobo bigint not null check (amount_kobo > 0),
  currency char(3) not null default 'NGN',
  status public.payment_status not null default 'pending',
  provider_reference text,
  authorization_url text,
  access_code text,
  failure_reason text,
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(booking_id, order_id, membership_id, package_purchase_id) = 1)
);
create index payments_user_idx on public.payments (user_id, created_at desc);
create index payments_booking_idx on public.payments (booking_id);
create index payments_order_idx on public.payments (order_id);
create index payments_status_idx on public.payments (status, created_at desc);
create unique index payments_provider_ref_idx on public.payments (provider, provider_reference)
  where provider_reference is not null;
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

create table public.payment_status_history (
  id bigint generated always as identity primary key,
  payment_id uuid not null references public.payments (id) on delete cascade,
  from_status public.payment_status,
  to_status public.payment_status not null,
  note text,
  created_at timestamptz not null default now()
);
create index payment_status_history_idx on public.payment_status_history (payment_id, created_at);

create or replace function public.payments_track_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.payment_status_history (payment_id, from_status, to_status) values (new.id, null, new.status);
  elsif new.status is distinct from old.status then
    insert into public.payment_status_history (payment_id, from_status, to_status, note)
    values (new.id, old.status, new.status, new.failure_reason);
  end if;
  return new;
end $$;
create trigger payments_track_status_ins after insert on public.payments
  for each row execute function public.payments_track_status();
create trigger payments_track_status_upd after update of status on public.payments
  for each row execute function public.payments_track_status();
create trigger audit_payments after update on public.payments
  for each row execute function public.audit_trigger();

-- Raw provider events. (provider, event_id) uniqueness makes webhook processing idempotent.
create table public.payment_events (
  id bigint generated always as identity primary key,
  provider public.payment_provider not null,
  event_id text not null,
  event_type text not null,
  reference text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  outcome text,
  unique (provider, event_id)
);

create type public.refund_status as enum ('requested', 'processing', 'completed', 'rejected', 'failed');

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete restrict,
  amount_kobo bigint not null check (amount_kobo > 0),
  reason text not null,
  status public.refund_status not null default 'requested',
  requested_by uuid references auth.users (id) on delete set null,
  processed_by uuid references auth.users (id) on delete set null,
  provider_refund_id text,
  failure_reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index refunds_payment_idx on public.refunds (payment_id);
create index refunds_status_idx on public.refunds (status, created_at desc);
create trigger audit_refunds after insert or update or delete on public.refunds
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- Payment initialisation (called with the customer's own JWT; amount is server-derived)
-- ---------------------------------------------------------------------------
create or replace function public.create_payment_intent(
  p_purpose public.payment_purpose, p_target uuid, p_provider public.payment_provider
)
returns public.payments
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_amount bigint;
  v_b public.bookings;
  v_o public.orders;
  v_m public.memberships;
  v_pp public.package_purchases;
  v_p public.payments;
  v_enabled jsonb;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;

  select value into v_enabled from public.settings where key = 'payments.providers';
  if v_enabled is null or not (v_enabled ? p_provider::text) then
    raise exception 'provider_disabled' using errcode = 'P0001';
  end if;

  if p_purpose = 'booking' then
    select * into v_b from public.bookings where id = p_target and user_id = v_uid for update;
    if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
    if v_b.status <> 'pending' or v_b.hold_expires_at <= now() then
      raise exception 'hold_expired' using errcode = 'P0001';
    end if;
    v_amount := v_b.due_now_kobo;
  elsif p_purpose = 'booking_balance' then
    select * into v_b from public.bookings where id = p_target and user_id = v_uid for update;
    if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
    if v_b.status not in ('confirmed', 'checked_in', 'in_progress', 'completed') or v_b.paid_kobo >= v_b.total_kobo then
      raise exception 'nothing_due' using errcode = 'P0001';
    end if;
    v_amount := v_b.total_kobo - v_b.paid_kobo;
  elsif p_purpose = 'order' then
    select * into v_o from public.orders where id = p_target and user_id = v_uid for update;
    if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
    if v_o.status <> 'placed' or v_o.paid_at is not null or v_o.reservation_expires_at <= now() then
      raise exception 'order_not_payable' using errcode = 'P0001';
    end if;
    v_amount := v_o.total_kobo;
  elsif p_purpose = 'membership' then
    select * into v_m from public.memberships where id = p_target and user_id = v_uid for update;
    if not found or v_m.status <> 'pending' then raise exception 'not_found' using errcode = 'P0001'; end if;
    if not exists (select 1 from public.membership_plans where id = v_m.plan_id and is_published) then
      raise exception 'plan_unavailable' using errcode = 'P0001';
    end if;
    v_amount := v_m.price_kobo;
  else
    select * into v_pp from public.package_purchases where id = p_target and user_id = v_uid for update;
    if not found or v_pp.status <> 'pending' then raise exception 'not_found' using errcode = 'P0001'; end if;
    v_amount := v_pp.price_kobo;
  end if;

  if v_amount is null or v_amount <= 0 then raise exception 'nothing_due' using errcode = 'P0001'; end if;

  -- Earlier unpaid attempts for the same target are no longer needed.
  update public.payments set status = 'abandoned', failure_reason = 'superseded'
  where status = 'pending' and user_id = v_uid
    and coalesce(booking_id, order_id, membership_id, package_purchase_id) = p_target;

  insert into public.payments (
    reference, provider, purpose, user_id, booking_id, order_id, membership_id, package_purchase_id, amount_kobo
  ) values (
    'PAY-' || upper(replace(gen_random_uuid()::text, '-', '')), p_provider, p_purpose, v_uid,
    case when p_purpose in ('booking', 'booking_balance') then p_target end,
    case when p_purpose = 'order' then p_target end,
    case when p_purpose = 'membership' then p_target end,
    case when p_purpose = 'package' then p_target end,
    v_amount
  ) returning * into v_p;
  return v_p;
end $$;
revoke all on function public.create_payment_intent(public.payment_purpose, uuid, public.payment_provider) from public, anon;
grant execute on function public.create_payment_intent(public.payment_purpose, uuid, public.payment_provider) to authenticated;

-- Edge Function stores what the provider returned for the checkout session.
create or replace function public.record_payment_initialized(
  p_reference text, p_provider_reference text, p_authorization_url text, p_access_code text
)
returns void language sql security definer set search_path = '' as $$
  update public.payments
  set provider_reference = coalesce(p_provider_reference, provider_reference),
      authorization_url = p_authorization_url,
      access_code = p_access_code
  where reference = p_reference and status = 'pending';
$$;
revoke all on function public.record_payment_initialized(text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_payment_initialized(text, text, text, text) to service_role;

-- Queue a refund for money we cannot apply (duplicate/late payments).
create or replace function private.queue_refund(p_payment uuid, p_amount bigint, p_reason text)
returns void language sql security definer set search_path = '' as $$
  insert into public.refunds (payment_id, amount_kobo, reason, status) values (p_payment, p_amount, p_reason, 'requested');
$$;

-- ---------------------------------------------------------------------------
-- Settlement. Idempotent: replays of the same success return the stored result.
-- ---------------------------------------------------------------------------
create or replace function public.apply_payment_success(
  p_reference text, p_provider_reference text, p_amount_kobo bigint, p_currency text
)
returns public.payments
language plpgsql security definer set search_path = '' as $$
declare
  v_p public.payments;
  v_b public.bookings;
  v_o public.orders;
  v_m public.memberships;
  v_pp public.package_purchases;
  v_pkg_days int;
  v_start timestamptz;
  v_refund_reason text;
  r record;
begin
  select * into v_p from public.payments where reference = p_reference for update;
  if not found then raise exception 'payment_not_found' using errcode = 'P0001'; end if;
  if v_p.status in ('succeeded', 'refunded', 'partially_refunded') then return v_p; end if;

  if p_amount_kobo <> v_p.amount_kobo or upper(p_currency) <> v_p.currency then
    update public.payments
    set status = 'failed', provider_reference = coalesce(p_provider_reference, provider_reference),
        failure_reason = format('amount_mismatch: expected %s %s, provider reported %s %s',
                                v_p.amount_kobo, v_p.currency, p_amount_kobo, upper(p_currency))
    where id = v_p.id returning * into v_p;
    return v_p;
  end if;

  if v_p.purpose in ('booking', 'booking_balance') then
    select * into v_b from public.bookings where id = v_p.booking_id for update;
    if v_b.paid_kobo + v_p.amount_kobo > v_b.total_kobo then
      v_refund_reason := 'duplicate_payment';
    elsif v_b.status in ('pending', 'expired') then
      begin
        update public.bookings
        set paid_kobo = paid_kobo + v_p.amount_kobo, status = 'confirmed', hold_expires_at = null
        where id = v_b.id;
      exception when exclusion_violation then
        v_refund_reason := 'slot_taken_after_hold_expired';
      end;
    elsif v_b.status in ('confirmed', 'checked_in', 'in_progress', 'completed') then
      update public.bookings set paid_kobo = paid_kobo + v_p.amount_kobo where id = v_b.id;
    else
      v_refund_reason := 'booking_cancelled_before_payment';
    end if;

  elsif v_p.purpose = 'order' then
    select * into v_o from public.orders where id = v_p.order_id for update;
    if v_o.status <> 'placed' then
      v_refund_reason := case when v_o.status = 'cancelled' then 'order_expired_before_payment' else 'duplicate_payment' end;
    else
      for r in
        select * from public.inventory_reservations where order_id = v_o.id and status = 'active' order by inventory_id
      loop
        update public.inventory
        set quantity = quantity - r.quantity, reserved = reserved - r.quantity, updated_at = now()
        where id = r.inventory_id;
        insert into public.inventory_transactions (inventory_id, kind, quantity_delta, reserved_delta, reason, order_id)
        values (r.inventory_id, 'sale', -r.quantity, -r.quantity, 'order paid', v_o.id);
        update public.inventory_reservations set status = 'consumed' where id = r.id;
      end loop;
      update public.orders
      set status = 'payment_confirmed', paid_at = now(), reservation_expires_at = null
      where id = v_o.id;
      if v_o.coupon_id is not null then
        insert into public.coupon_redemptions (coupon_id, user_id, order_id, amount_kobo)
        values (v_o.coupon_id, v_o.user_id, v_o.id, v_o.discount_kobo)
        on conflict (coupon_id, order_id) do nothing;
        update public.coupons set used_count = used_count + 1 where id = v_o.coupon_id;
      end if;
      delete from public.cart_items where cart_id in (select id from public.carts where user_id = v_o.user_id);
    end if;

  elsif v_p.purpose = 'membership' then
    select * into v_m from public.memberships where id = v_p.membership_id for update;
    if v_m.status <> 'pending' then
      v_refund_reason := 'duplicate_payment';
    else
      select greatest(now(), coalesce(max(expires_at), now())) into v_start
      from public.memberships where user_id = v_m.user_id and status = 'active';
      update public.memberships
      set status = 'active', starts_at = v_start,
          expires_at = v_start + make_interval(days => (v_m.plan_snapshot ->> 'duration_days')::int)
      where id = v_m.id;
    end if;

  else
    select * into v_pp from public.package_purchases where id = v_p.package_purchase_id for update;
    if v_pp.status <> 'pending' then
      v_refund_reason := 'duplicate_payment';
    else
      v_pkg_days := nullif(v_pp.package_snapshot ->> 'validity_days', '')::int;
      update public.package_purchases
      set status = 'active', expires_at = case when v_pkg_days is null then null else now() + make_interval(days => v_pkg_days) end
      where id = v_pp.id;
    end if;
  end if;

  update public.payments
  set status = 'succeeded', paid_at = now(),
      provider_reference = coalesce(p_provider_reference, provider_reference), failure_reason = v_refund_reason
  where id = v_p.id returning * into v_p;

  if v_refund_reason is not null then
    perform private.queue_refund(v_p.id, v_p.amount_kobo, v_refund_reason);
  end if;
  return v_p;
end $$;
revoke all on function public.apply_payment_success(text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.apply_payment_success(text, text, bigint, text) to service_role;

create or replace function public.mark_payment_failed(p_reference text, p_reason text)
returns void language sql security definer set search_path = '' as $$
  update public.payments set status = 'failed', failure_reason = left(p_reason, 500)
  where reference = p_reference and status in ('pending', 'processing');
$$;
revoke all on function public.mark_payment_failed(text, text) from public, anon, authenticated;
grant execute on function public.mark_payment_failed(text, text) to service_role;

-- Scheduled job: pending payments older than an hour become abandoned.
create or replace function public.expire_abandoned_payments()
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  with a as (
    update public.payments set status = 'abandoned', failure_reason = 'no completion within 1 hour'
    where status = 'pending' and created_at < now() - interval '1 hour' returning 1
  )
  select count(*) into v_count from a;
  return v_count;
end $$;
revoke all on function public.expire_abandoned_payments() from public, anon, authenticated;
grant execute on function public.expire_abandoned_payments() to service_role;

-- Booking cancellation (cancel_booking) is defined in 0010 alongside the staff-cancel guard it depends on.

-- ---------------------------------------------------------------------------
-- Refund workflow
-- ---------------------------------------------------------------------------
create or replace function public.create_refund_request(p_payment uuid, p_amount bigint, p_reason text)
returns public.refunds
language plpgsql security definer set search_path = '' as $$
declare
  v_p public.payments;
  v_branch uuid;
  v_already bigint;
  v_refund public.refunds;
begin
  select * into v_p from public.payments where id = p_payment for update;
  if not found then raise exception 'payment_not_found' using errcode = 'P0001'; end if;
  select coalesce(b.branch_id, o.branch_id) into v_branch
  from (select 1) x
  left join public.bookings b on b.id = v_p.booking_id
  left join public.orders o on o.id = v_p.order_id;
  if not public.has_permission('refunds.create', v_branch) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_p.status not in ('succeeded', 'partially_refunded') then
    raise exception 'payment_not_refundable' using errcode = 'P0001';
  end if;
  select coalesce(sum(amount_kobo), 0) into v_already from public.refunds
  where payment_id = p_payment and status in ('requested', 'processing', 'completed');
  if p_amount <= 0 or p_amount + v_already > v_p.amount_kobo then
    raise exception 'invalid_refund_amount' using errcode = 'P0001';
  end if;
  insert into public.refunds (payment_id, amount_kobo, reason, requested_by)
  values (p_payment, p_amount, p_reason, (select auth.uid())) returning * into v_refund;
  return v_refund;
end $$;
revoke all on function public.create_refund_request(uuid, bigint, text) from public, anon;
grant execute on function public.create_refund_request(uuid, bigint, text) to authenticated;

-- The Edge Function (service role) records the provider's outcome.
create or replace function public.finalize_refund(
  p_refund uuid, p_success boolean, p_provider_refund_id text, p_failure text, p_processed_by uuid
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_r public.refunds;
  v_p public.payments;
  v_total bigint;
begin
  select * into v_r from public.refunds where id = p_refund for update;
  if not found or v_r.status in ('completed', 'rejected') then return; end if;
  if not p_success then
    update public.refunds set status = 'failed', failure_reason = left(p_failure, 500), processed_by = p_processed_by
    where id = p_refund;
    return;
  end if;
  update public.refunds
  set status = 'completed', provider_refund_id = p_provider_refund_id, completed_at = now(), processed_by = p_processed_by
  where id = p_refund;
  select * into v_p from public.payments where id = v_r.payment_id for update;
  select coalesce(sum(amount_kobo), 0) into v_total from public.refunds where payment_id = v_p.id and status = 'completed';
  update public.payments
  set status = case when v_total >= amount_kobo then 'refunded'::public.payment_status else 'partially_refunded'::public.payment_status end
  where id = v_p.id;
  if v_p.booking_id is not null then
    update public.bookings set paid_kobo = greatest(paid_kobo - v_r.amount_kobo, 0) where id = v_p.booking_id;
  end if;
  if v_p.order_id is not null and v_total >= v_p.amount_kobo then
    begin
      update public.orders set status = 'refunded' where id = v_p.order_id;
    exception when others then
      -- Order is already cancelled/refunded; the payment record still reflects the refund.
      null;
    end;
  end if;
end $$;
revoke all on function public.finalize_refund(uuid, boolean, text, text, uuid) from public, anon, authenticated;
grant execute on function public.finalize_refund(uuid, boolean, text, text, uuid) to service_role;

-- Receipt for the payer or authorised finance staff.
create or replace function public.get_payment_receipt(p_payment uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_p public.payments;
  v_branch uuid;
  v_desc text;
begin
  select * into v_p from public.payments where id = p_payment;
  if not found then return null; end if;
  select coalesce(b.branch_id, o.branch_id),
         coalesce(b.service_name, 'Order ' || o.number, m.plan_snapshot ->> 'name', pp.package_snapshot ->> 'name')
    into v_branch, v_desc
  from (select 1) x
  left join public.bookings b on b.id = v_p.booking_id
  left join public.orders o on o.id = v_p.order_id
  left join public.memberships m on m.id = v_p.membership_id
  left join public.package_purchases pp on pp.id = v_p.package_purchase_id;
  if v_p.user_id is distinct from (select auth.uid()) and not public.has_permission('payments.view', v_branch) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'reference', v_p.reference, 'provider', v_p.provider, 'purpose', v_p.purpose, 'description', v_desc,
    'amount_kobo', v_p.amount_kobo, 'currency', v_p.currency, 'status', v_p.status, 'paid_at', v_p.paid_at
  );
end $$;
revoke all on function public.get_payment_receipt(uuid) from public, anon;
grant execute on function public.get_payment_receipt(uuid) to authenticated;
