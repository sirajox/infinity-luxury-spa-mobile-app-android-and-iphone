-- 0010: Row Level Security, grants and privilege hardening.
-- Principle: deny by default. Everything is revoked, then granted narrowly. Money, stock, status changes and
-- role assignment can only happen through the SECURITY DEFINER functions defined in earlier migrations.

-- ---------------------------------------------------------------------------
-- Helpers used by policies
-- ---------------------------------------------------------------------------
create or replace function public.my_staff_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.staff where user_id = (select auth.uid());
$$;

create or replace function public.payment_branch_id(p_booking uuid, p_order uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select branch_id from public.bookings where id = p_booking),
    (select branch_id from public.orders where id = p_order)
  );
$$;

-- Staff may view a customer who has a booking or order at a branch they are authorised for.
create or replace function public.staff_can_view_customer(p_customer uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_permission('customers.view', null)
    or exists (select 1 from public.bookings b where b.user_id = p_customer and public.has_permission('customers.view', b.branch_id))
    or exists (select 1 from public.orders o where o.user_id = p_customer and public.has_permission('customers.view', o.branch_id));
$$;

-- Stock status without exposing exact counts or reservations.
create view public.product_stock_status as
  select i.branch_id, i.variant_id,
         (i.quantity - i.reserved) > 0 as in_stock,
         (i.quantity - i.reserved) <= v.low_stock_threshold as low_stock
  from public.inventory i
  join public.product_variants v on v.id = i.variant_id and v.is_active
  join public.products p on p.id = v.product_id and p.is_active;

-- Staff cancellations must go through cancel_booking() so refund requests are queued.
create or replace function public.bookings_guard_cancel()
returns trigger language plpgsql as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled'
     and (select auth.uid()) is not null
     and coalesce(current_setting('app.via_cancel_booking', true), '') <> '1' then
    raise exception 'use cancel_booking()' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger bookings_guard_cancel before update of status on public.bookings
  for each row execute function public.bookings_guard_cancel();

create or replace function public.cancel_booking(p_booking uuid, p_reason text default null)
returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_b public.bookings;
  v_privileged boolean;
  v_free_hours int := public.setting_int('booking.cancel_free_hours', 24);
  v_refundable boolean;
  v_remaining bigint;
  r record;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select * into v_b from public.bookings where id = p_booking for update;
  if not found then raise exception 'booking_not_found' using errcode = 'P0001'; end if;
  v_privileged := public.has_permission('bookings.cancel', v_b.branch_id);
  if v_b.user_id is distinct from v_uid and not v_privileged then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_b.status not in ('pending', 'confirmed', 'checked_in') then
    raise exception 'booking_not_cancellable' using errcode = 'P0001';
  end if;

  v_refundable := v_privileged or v_b.starts_at - now() >= make_interval(hours => v_free_hours);
  perform set_config('app.via_cancel_booking', '1', true);
  update public.bookings
  set status = 'cancelled', cancelled_at = now(), cancellation_reason = left(p_reason, 500)
  where id = v_b.id returning * into v_b;
  perform set_config('app.via_cancel_booking', '', true);

  if v_refundable and v_b.paid_kobo > 0 then
    v_remaining := v_b.paid_kobo;
    for r in
      select p.id, p.amount_kobo - coalesce((
        select sum(f.amount_kobo) from public.refunds f where f.payment_id = p.id and f.status <> 'rejected'
      ), 0) as refundable
      from public.payments p
      where p.booking_id = v_b.id and p.status in ('succeeded', 'partially_refunded')
      order by p.paid_at desc
    loop
      exit when v_remaining <= 0;
      if r.refundable > 0 then
        perform private.queue_refund(r.id, least(r.refundable, v_remaining)::bigint, 'booking_cancelled');
        v_remaining := v_remaining - least(r.refundable, v_remaining);
      end if;
    end loop;
  end if;
  return v_b;
end $$;

-- ---------------------------------------------------------------------------
-- Baseline: strip every default privilege, then grant deliberately.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;

do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- Functions that must stay callable by the client roles.
grant execute on function public.has_permission(text, uuid) to anon, authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.permitted_branches(text) to authenticated;
grant execute on function public.my_staff_id() to authenticated;
grant execute on function public.payment_branch_id(uuid, uuid) to authenticated;
grant execute on function public.staff_can_view_customer(uuid) to authenticated;
grant execute on function public.get_available_slots(uuid, uuid, uuid, date, uuid) to anon, authenticated;
grant execute on function public.get_available_days(uuid, uuid, uuid, date, date) to anon, authenticated;
grant execute on function public.adjust_inventory(uuid, uuid, int, text) to authenticated;
grant execute on function public.transfer_inventory(uuid, uuid, uuid, int, text) to authenticated;
grant execute on function public.cancel_booking(uuid, text) to authenticated;
-- Internal helpers: service/definer use only.
revoke execute on function public.setting_int(text, int) from authenticated;
revoke execute on function public.generate_booking_reference() from authenticated;
revoke execute on function public.generate_order_number() from authenticated;
grant execute on function public.setting_int(text, int) to service_role;

-- ---------------------------------------------------------------------------
-- Public catalogue (guests may browse)
-- ---------------------------------------------------------------------------
grant select on public.branches, public.branch_hours, public.branch_holidays, public.staff, public.staff_branches,
  public.staff_services, public.service_categories, public.service_subcategories, public.services,
  public.service_branches, public.product_categories, public.products, public.product_variants,
  public.product_images, public.packages, public.package_items, public.membership_plans, public.app_banners,
  public.app_content, public.faqs, public.tour_steps, public.settings, public.delivery_fees, public.reviews,
  public.product_stock_status, public.service_ratings, public.staff_ratings, public.product_ratings
  to anon, authenticated;

create policy branches_public_read on public.branches for select to anon, authenticated using (is_active);
create policy branches_staff_read on public.branches for select to authenticated using (public.is_staff());
create policy branch_hours_public_read on public.branch_hours for select to anon, authenticated using (true);
create policy branch_holidays_public_read on public.branch_holidays for select to anon, authenticated using (true);
create policy staff_public_read on public.staff for select to anon, authenticated using (is_active);
create policy staff_staff_read on public.staff for select to authenticated using (public.is_staff());
create policy staff_branches_public_read on public.staff_branches for select to anon, authenticated using (true);
create policy staff_services_public_read on public.staff_services for select to anon, authenticated using (true);
create policy service_categories_public_read on public.service_categories for select to anon, authenticated
  using (is_active or public.has_permission('categories.manage'));
create policy service_subcategories_public_read on public.service_subcategories for select to anon, authenticated
  using (is_active or public.has_permission('categories.manage'));
create policy services_public_read on public.services for select to anon, authenticated
  using (is_active or public.has_permission('treatments.manage'));
create policy service_branches_public_read on public.service_branches for select to anon, authenticated using (true);
create policy product_categories_public_read on public.product_categories for select to anon, authenticated
  using (is_active or public.has_permission('categories.manage'));
create policy products_public_read on public.products for select to anon, authenticated
  using (is_active or public.has_permission('products.view'));
create policy product_variants_public_read on public.product_variants for select to anon, authenticated
  using (is_active or public.has_permission('products.view'));
create policy product_images_public_read on public.product_images for select to anon, authenticated using (true);
create policy packages_public_read on public.packages for select to anon, authenticated
  using (is_active or public.has_permission('packages.manage'));
create policy package_items_public_read on public.package_items for select to anon, authenticated using (true);
create policy membership_plans_public_read on public.membership_plans for select to anon, authenticated
  using (is_published or public.has_permission('memberships.manage'));
create policy app_banners_public_read on public.app_banners for select to anon, authenticated
  using ((is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
         or public.has_permission('banners.manage'));
create policy app_content_public_read on public.app_content for select to anon, authenticated
  using (is_published or public.has_permission('content.manage'));
create policy faqs_public_read on public.faqs for select to anon, authenticated
  using (is_active or public.has_permission('content.manage'));
create policy tour_steps_public_read on public.tour_steps for select to anon, authenticated
  using (is_enabled or public.has_permission('content.manage'));
create policy settings_public_read on public.settings for select to anon, authenticated
  using (is_public or public.has_permission('settings.manage'));
create policy delivery_fees_public_read on public.delivery_fees for select to anon, authenticated
  using (is_active or public.has_permission('settings.manage'));
create policy reviews_public_read on public.reviews for select to anon, authenticated
  using (status = 'approved' or user_id = (select auth.uid()) or public.has_permission('reviews.moderate'));

-- ---------------------------------------------------------------------------
-- Staff-managed catalogue (writes gated by permission)
-- ---------------------------------------------------------------------------
grant insert, update, delete on public.branches, public.branch_hours, public.branch_holidays, public.staff,
  public.staff_branches, public.staff_services, public.staff_working_hours, public.staff_breaks, public.staff_leave,
  public.service_categories, public.service_subcategories, public.services, public.service_branches,
  public.product_categories, public.products, public.product_variants, public.product_images, public.packages,
  public.package_items, public.membership_plans, public.app_banners, public.app_content, public.faqs,
  public.tour_steps, public.email_templates, public.settings, public.delivery_fees, public.coupons
  to authenticated;
grant select on public.staff_working_hours, public.staff_breaks, public.staff_leave, public.email_templates,
  public.coupons to authenticated;

create policy branches_manage on public.branches for all to authenticated
  using (public.has_permission('branches.manage')) with check (public.has_permission('branches.manage'));
create policy branch_hours_manage on public.branch_hours for all to authenticated
  using (public.has_permission('branches.manage', branch_id)) with check (public.has_permission('branches.manage', branch_id));
create policy branch_holidays_manage on public.branch_holidays for all to authenticated
  using (public.has_permission('branches.manage', branch_id)) with check (public.has_permission('branches.manage', branch_id));

create policy staff_manage on public.staff for all to authenticated
  using (public.has_permission('staff.manage')) with check (public.has_permission('staff.manage'));
create policy staff_branches_manage on public.staff_branches for all to authenticated
  using (public.has_permission('staff.manage', branch_id)) with check (public.has_permission('staff.manage', branch_id));
create policy staff_services_manage on public.staff_services for all to authenticated
  using (public.has_permission('staff.manage')) with check (public.has_permission('staff.manage'));
create policy staff_working_hours_read on public.staff_working_hours for select to authenticated
  using (public.has_permission('staff.manage', branch_id) or staff_id = public.my_staff_id());
create policy staff_working_hours_manage on public.staff_working_hours for all to authenticated
  using (public.has_permission('staff.manage', branch_id)) with check (public.has_permission('staff.manage', branch_id));
create policy staff_breaks_manage on public.staff_breaks for all to authenticated
  using (exists (select 1 from public.staff_branches sb where sb.staff_id = staff_breaks.staff_id and public.has_permission('staff.manage', sb.branch_id)))
  with check (exists (select 1 from public.staff_branches sb where sb.staff_id = staff_breaks.staff_id and public.has_permission('staff.manage', sb.branch_id)));
create policy staff_leave_manage on public.staff_leave for all to authenticated
  using (exists (select 1 from public.staff_branches sb where sb.staff_id = staff_leave.staff_id and public.has_permission('staff.manage', sb.branch_id)))
  with check (exists (select 1 from public.staff_branches sb where sb.staff_id = staff_leave.staff_id and public.has_permission('staff.manage', sb.branch_id)));

create policy service_categories_manage on public.service_categories for all to authenticated
  using (public.has_permission('categories.manage')) with check (public.has_permission('categories.manage'));
create policy service_subcategories_manage on public.service_subcategories for all to authenticated
  using (public.has_permission('categories.manage')) with check (public.has_permission('categories.manage'));
create policy services_manage on public.services for all to authenticated
  using (public.has_permission('treatments.manage')) with check (public.has_permission('treatments.manage'));
create policy service_branches_manage on public.service_branches for all to authenticated
  using (public.has_permission('treatments.manage')) with check (public.has_permission('treatments.manage'));
create policy product_categories_manage on public.product_categories for all to authenticated
  using (public.has_permission('categories.manage')) with check (public.has_permission('categories.manage'));

create policy products_insert on public.products for insert to authenticated with check (public.has_permission('products.create'));
create policy products_update on public.products for update to authenticated
  using (public.has_permission('products.update')) with check (public.has_permission('products.update'));
create policy products_delete on public.products for delete to authenticated using (public.has_permission('products.delete'));
create policy product_variants_insert on public.product_variants for insert to authenticated with check (public.has_permission('products.create'));
create policy product_variants_update on public.product_variants for update to authenticated
  using (public.has_permission('products.update')) with check (public.has_permission('products.update'));
create policy product_variants_delete on public.product_variants for delete to authenticated using (public.has_permission('products.delete'));
create policy product_images_manage on public.product_images for all to authenticated
  using (public.has_permission('products.update')) with check (public.has_permission('products.update'));

create policy packages_manage on public.packages for all to authenticated
  using (public.has_permission('packages.manage')) with check (public.has_permission('packages.manage'));
create policy package_items_manage on public.package_items for all to authenticated
  using (public.has_permission('packages.manage')) with check (public.has_permission('packages.manage'));
create policy membership_plans_manage on public.membership_plans for all to authenticated
  using (public.has_permission('memberships.manage')) with check (public.has_permission('memberships.manage'));
create policy app_banners_manage on public.app_banners for all to authenticated
  using (public.has_permission('banners.manage')) with check (public.has_permission('banners.manage'));
create policy app_content_manage on public.app_content for all to authenticated
  using (public.has_permission('content.manage')) with check (public.has_permission('content.manage'));
create policy faqs_manage on public.faqs for all to authenticated
  using (public.has_permission('content.manage')) with check (public.has_permission('content.manage'));
create policy tour_steps_manage on public.tour_steps for all to authenticated
  using (public.has_permission('content.manage')) with check (public.has_permission('content.manage'));
create policy email_templates_manage on public.email_templates for all to authenticated
  using (public.has_permission('content.manage')) with check (public.has_permission('content.manage'));
create policy settings_manage on public.settings for all to authenticated
  using (public.has_permission('settings.manage')) with check (public.has_permission('settings.manage'));
create policy delivery_fees_manage on public.delivery_fees for all to authenticated
  using (public.has_permission('settings.manage')) with check (public.has_permission('settings.manage'));
create policy coupons_manage on public.coupons for all to authenticated
  using (public.has_permission('coupons.manage')) with check (public.has_permission('coupons.manage'));

-- ---------------------------------------------------------------------------
-- RBAC tables
-- ---------------------------------------------------------------------------
grant select on public.permissions, public.roles, public.role_permissions, public.user_roles to authenticated;
grant insert, update, delete on public.roles, public.role_permissions, public.user_roles to authenticated;
create policy permissions_staff_read on public.permissions for select to authenticated using (public.is_staff());
create policy roles_staff_read on public.roles for select to authenticated using (public.is_staff());
create policy roles_manage on public.roles for all to authenticated
  using (public.has_permission('roles.manage')) with check (public.has_permission('roles.manage'));
create policy role_permissions_staff_read on public.role_permissions for select to authenticated using (public.is_staff());
create policy role_permissions_manage on public.role_permissions for all to authenticated
  using (public.has_permission('roles.manage')) with check (public.has_permission('roles.manage'));
create policy user_roles_read on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('users.manage'));
create policy user_roles_manage on public.user_roles for all to authenticated
  using (public.has_permission('users.manage')) with check (public.has_permission('users.manage'));

-- ---------------------------------------------------------------------------
-- Profiles: customers edit only safe columns of their own row.
-- ---------------------------------------------------------------------------
grant select on public.profiles to authenticated;
grant update (full_name, phone, avatar_url, preferred_branch_id, tour_completed) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.staff_can_view_customer(id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Bookings: read-only for customers; staff may update status/notes within scope.
-- ---------------------------------------------------------------------------
grant select on public.bookings, public.booking_items, public.booking_status_history to authenticated;
grant update (status, notes) on public.bookings to authenticated;
create policy bookings_read on public.bookings for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('bookings.view', branch_id) or staff_id = public.my_staff_id());
create policy bookings_staff_update on public.bookings for update to authenticated
  using (public.has_permission('bookings.update', branch_id)) with check (public.has_permission('bookings.update', branch_id));
create policy booking_items_read on public.booking_items for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id));
create policy booking_history_read on public.booking_status_history for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id));

-- ---------------------------------------------------------------------------
-- Orders, inventory (read-only; mutations via functions)
-- ---------------------------------------------------------------------------
grant select on public.orders, public.order_items, public.order_status_history, public.inventory,
  public.inventory_transactions, public.inventory_reservations to authenticated;
create policy orders_read on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('orders.view', branch_id));
create policy order_items_read on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy order_history_read on public.order_status_history for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy inventory_staff_read on public.inventory for select to authenticated
  using (public.has_permission('inventory.view', branch_id));
create policy inventory_txn_staff_read on public.inventory_transactions for select to authenticated
  using (exists (select 1 from public.inventory i where i.id = inventory_id));
create policy inventory_reservations_staff_read on public.inventory_reservations for select to authenticated
  using (exists (select 1 from public.inventory i where i.id = inventory_id));

-- ---------------------------------------------------------------------------
-- Payments (read-only for everyone through the API)
-- ---------------------------------------------------------------------------
grant select on public.payments, public.payment_status_history, public.refunds, public.payment_events to authenticated;
create policy payments_read on public.payments for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('payments.view', public.payment_branch_id(booking_id, order_id)));
create policy payment_history_read on public.payment_status_history for select to authenticated
  using (exists (select 1 from public.payments p where p.id = payment_id));
create policy refunds_read on public.refunds for select to authenticated
  using (exists (select 1 from public.payments p where p.id = payment_id));
create policy payment_events_staff_read on public.payment_events for select to authenticated
  using (public.has_permission('payments.view', null));

-- ---------------------------------------------------------------------------
-- Customer-owned data
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.addresses, public.carts, public.cart_items, public.wishlists,
  public.wishlist_items, public.device_tokens to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;
grant select on public.memberships, public.package_purchases, public.coupon_redemptions to authenticated;

create policy addresses_own on public.addresses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy carts_own on public.carts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy cart_items_own on public.cart_items for all to authenticated
  using (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())))
  with check (exists (select 1 from public.carts c where c.id = cart_id and c.user_id = (select auth.uid())));
create policy wishlists_own on public.wishlists for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy wishlist_items_own on public.wishlist_items for all to authenticated
  using (exists (select 1 from public.wishlists w where w.id = wishlist_id and w.user_id = (select auth.uid())))
  with check (exists (select 1 from public.wishlists w where w.id = wishlist_id and w.user_id = (select auth.uid())));
create policy device_tokens_own on public.device_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notification_prefs_own on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_own_read on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_own_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_own_delete on public.notifications for delete to authenticated using (user_id = (select auth.uid()));
create policy memberships_read on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('memberships.manage'));
create policy package_purchases_read on public.package_purchases for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('packages.manage'));
create policy coupon_redemptions_read on public.coupon_redemptions for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('coupons.manage'));

-- Reviews: eligible customers insert (trigger enforces eligibility); moderators update status.
grant insert (target, service_id, staff_id, product_id, rating, body, image_urls) on public.reviews to authenticated;
grant update (status) on public.reviews to authenticated;
grant delete on public.reviews to authenticated;
create policy reviews_insert_own on public.reviews for insert to authenticated with check (user_id = (select auth.uid()));
create policy reviews_moderate on public.reviews for update to authenticated
  using (public.has_permission('reviews.moderate')) with check (public.has_permission('reviews.moderate'));
create policy reviews_delete on public.reviews for delete to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('reviews.moderate'));

-- Support
grant select, insert on public.support_tickets, public.support_messages to authenticated;
grant update (status) on public.support_tickets to authenticated;
create policy support_tickets_read on public.support_tickets for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('support.manage', branch_id));
create policy support_tickets_insert on public.support_tickets for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy support_tickets_staff_update on public.support_tickets for update to authenticated
  using (public.has_permission('support.manage', branch_id)) with check (public.has_permission('support.manage', branch_id));
create policy support_messages_read on public.support_messages for select to authenticated
  using (exists (select 1 from public.support_tickets t where t.id = ticket_id));
create policy support_messages_insert on public.support_messages for insert to authenticated
  with check (exists (select 1 from public.support_tickets t where t.id = ticket_id));

-- Audit log: readable by auditors; no API role can write.
grant select on public.audit_logs to authenticated;
create policy audit_logs_read on public.audit_logs for select to authenticated using (public.has_permission('audit.view'));

-- notification_outbox: RLS enabled with no policies and no grants => service role only.
