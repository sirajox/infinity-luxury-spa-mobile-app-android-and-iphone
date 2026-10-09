-- 0009: account deletion/export workflows and dashboard reporting.

-- ---------------------------------------------------------------------------
-- Account deletion. The delete-account Edge Function re-authenticates the user, calls this with the
-- service role, then removes the auth user (cascading profile, addresses, cart, notifications, devices).
-- Financial records (orders, payments, bookings) are retained but stripped of personal contact data.
-- ---------------------------------------------------------------------------
create or replace function public.prepare_account_deletion(p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  b record;
  r record;
  v_remaining bigint;
  v_cancelled int := 0;
begin
  for b in
    select * from public.bookings
    where user_id = p_user and status in ('pending', 'confirmed', 'checked_in') and starts_at > now()
    for update
  loop
    update public.bookings
    set status = 'cancelled', cancelled_at = now(), cancellation_reason = 'account_deleted'
    where id = b.id;
    v_cancelled := v_cancelled + 1;
    v_remaining := b.paid_kobo;
    for r in
      select p.id, p.amount_kobo - coalesce((
        select sum(f.amount_kobo) from public.refunds f where f.payment_id = p.id and f.status <> 'rejected'
      ), 0) as refundable
      from public.payments p
      where p.booking_id = b.id and p.status in ('succeeded', 'partially_refunded')
      order by p.paid_at desc
    loop
      exit when v_remaining <= 0;
      if r.refundable > 0 then
        perform private.queue_refund(r.id, least(r.refundable, v_remaining)::bigint, 'account_deleted');
        v_remaining := v_remaining - least(r.refundable, v_remaining);
      end if;
    end loop;
  end loop;

  -- Release any held stock for unpaid checkouts.
  for r in select id from public.orders where user_id = p_user and status = 'placed' and paid_at is null loop
    perform private.release_order_stock(r.id);
    update public.orders set status = 'cancelled' where id = r.id;
  end loop;

  -- Strip personal data from retained financial records.
  update public.orders set contact_name = null, contact_phone = null, shipping_address = null where user_id = p_user;
  delete from public.reviews where user_id = p_user;
  delete from public.support_tickets where user_id = p_user;
  update public.profiles set deleted_at = now(), full_name = null, phone = null, avatar_url = null where id = p_user;

  return jsonb_build_object('cancelled_bookings', v_cancelled);
end $$;
revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;

-- "Download my data": the caller's own personal data as JSON.
create or replace function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_uid),
    'preferences', (select to_jsonb(n) from public.notification_preferences n where n.user_id = v_uid),
    'addresses', coalesce((select jsonb_agg(to_jsonb(a)) from public.addresses a where a.user_id = v_uid), '[]'),
    'bookings', coalesce((select jsonb_agg(to_jsonb(b) - 'user_id') from public.bookings b where b.user_id = v_uid), '[]'),
    'orders', coalesce((select jsonb_agg(to_jsonb(o) - 'user_id') from public.orders o where o.user_id = v_uid), '[]'),
    'memberships', coalesce((select jsonb_agg(to_jsonb(m) - 'user_id') from public.memberships m where m.user_id = v_uid), '[]'),
    'reviews', coalesce((select jsonb_agg(to_jsonb(r) - 'user_id') from public.reviews r where r.user_id = v_uid), '[]')
  );
end $$;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard summary. Scoped to the branches where the caller holds reports.view.
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_summary(
  p_from timestamptz, p_to timestamptz, p_branch uuid default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_global boolean := public.has_permission('reports.view', null);
  v_branches uuid[];
begin
  if not public.has_permission('reports.view', p_branch) and p_branch is not null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_branch is null and not exists (select 1 from public.permitted_branches('reports.view')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_branches := case when p_branch is not null then array[p_branch]
                     else array(select public.permitted_branches('reports.view')) end;

  return jsonb_build_object(
    'revenue_kobo', coalesce((
      select sum(p.amount_kobo) from public.payments p
      left join public.bookings b on b.id = p.booking_id
      left join public.orders o on o.id = p.order_id
      where p.status in ('succeeded', 'partially_refunded') and p.paid_at between p_from and p_to
        and (coalesce(b.branch_id, o.branch_id) = any (v_branches)
             or (coalesce(b.branch_id, o.branch_id) is null and v_global and p_branch is null))
    ), 0),
    'bookings_by_status', coalesce((
      select jsonb_object_agg(status, n) from (
        select status::text, count(*) n from public.bookings
        where branch_id = any (v_branches) and created_at between p_from and p_to group by status) s
    ), '{}'::jsonb),
    'orders_by_status', coalesce((
      select jsonb_object_agg(status, n) from (
        select status::text, count(*) n from public.orders
        where branch_id = any (v_branches) and created_at between p_from and p_to group by status) s
    ), '{}'::jsonb),
    'new_customers', case when v_global and p_branch is null then
      (select count(*) from public.profiles where created_at between p_from and p_to and deleted_at is null) else null end,
    'low_stock_items', (
      select count(*) from public.inventory i join public.product_variants v on v.id = i.variant_id
      where i.branch_id = any (v_branches) and i.quantity - i.reserved <= v.low_stock_threshold
    ),
    'active_memberships', case when v_global then
      (select count(*) from public.memberships where status = 'active') else null end,
    'failed_payments', (
      select count(*) from public.payments p
      left join public.bookings b on b.id = p.booking_id
      left join public.orders o on o.id = p.order_id
      where p.status = 'failed' and p.created_at between p_from and p_to
        and coalesce(b.branch_id, o.branch_id) = any (v_branches)
    ),
    'upcoming_appointments', (
      select count(*) from public.bookings
      where branch_id = any (v_branches) and status = 'confirmed' and starts_at between now() and now() + interval '7 days'
    ),
    'top_treatments', coalesce((
      select jsonb_agg(t) from (
        select service_name as name, count(*) as bookings, sum(total_kobo) as value_kobo
        from public.bookings
        where branch_id = any (v_branches) and status in ('confirmed', 'checked_in', 'in_progress', 'completed')
          and created_at between p_from and p_to
        group by service_name order by count(*) desc limit 5) t
    ), '[]'::jsonb),
    'top_products', coalesce((
      select jsonb_agg(t) from (
        select oi.name_snapshot as name, sum(oi.quantity) as units, sum(oi.line_total_kobo) as value_kobo
        from public.order_items oi join public.orders o on o.id = oi.order_id
        where o.branch_id = any (v_branches) and o.paid_at between p_from and p_to
        group by oi.name_snapshot order by sum(oi.quantity) desc limit 5) t
    ), '[]'::jsonb),
    'branch_performance', coalesce((
      select jsonb_agg(t) from (
        select br.name, coalesce(sum(x.amount_kobo), 0) as revenue_kobo
        from public.branches br
        left join (
          select coalesce(b.branch_id, o.branch_id) as branch_id, p.amount_kobo
          from public.payments p
          left join public.bookings b on b.id = p.booking_id
          left join public.orders o on o.id = p.order_id
          where p.status in ('succeeded', 'partially_refunded') and p.paid_at between p_from and p_to
        ) x on x.branch_id = br.id
        where br.id = any (v_branches)
        group by br.name order by revenue_kobo desc) t
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.dashboard_summary(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.dashboard_summary(timestamptz, timestamptz, uuid) to authenticated;
