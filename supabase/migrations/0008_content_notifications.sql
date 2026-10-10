-- 0008: CMS content, tour, banners, notifications (in-app + push/email outbox), support tickets.

-- ---------------------------------------------------------------------------
-- CMS
-- ---------------------------------------------------------------------------
create table public.app_banners (
  id uuid primary key default gen_random_uuid(),
  placement text not null default 'home_hero' check (placement in ('home_hero', 'store_hero')),
  eyebrow text,
  title text not null,
  subtitle text,
  cta_label text,
  cta_target text, -- in-app route, e.g. /treatment/<slug>
  image_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index app_banners_placement_idx on public.app_banners (placement, display_order) where is_active;
create trigger app_banners_updated_at before update on public.app_banners
  for each row execute function public.set_updated_at();

create table public.app_content (
  slug text primary key,
  title text not null,
  body_markdown text not null default '',
  version int not null default 1,
  is_published boolean not null default false,
  updated_at timestamptz not null default now()
);
create trigger app_content_updated_at before update on public.app_content
  for each row execute function public.set_updated_at();
create trigger audit_app_content after insert or update or delete on public.app_content
  for each row execute function public.audit_trigger();

-- Legal documents are placeholders: the business must supply approved text before launch.
insert into public.app_content (slug, title) values
  ('privacy-policy', 'Privacy Policy'),
  ('terms-of-use', 'Terms of Use'),
  ('booking-policy', 'Booking Policy'),
  ('cancellation-policy', 'Cancellation Policy'),
  ('refund-policy', 'Refund Policy'),
  ('delivery-policy', 'Delivery Policy'),
  ('membership-terms', 'Membership Terms');

create table public.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  display_order int not null default 0,
  is_active boolean not null default true
);

create table public.tour_steps (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('onboarding', 'tour')),
  position int not null,
  title text not null,
  body text not null,
  target text, -- tab key the tour spotlights (home, bookings, store, orders, profile)
  image_url text,
  is_enabled boolean not null default true,
  unique (kind, position)
);

insert into public.tour_steps (kind, position, title, body, target) values
  ('onboarding', 1, 'Book your treatment at any Infinity branch', 'Choose a treatment, your city and the staff member you trust, then pick a time that suits you.', null),
  ('onboarding', 2, 'Shop skin care chosen by our therapists', 'Serums, creams and gift sets, delivered to you or ready for pickup at your branch.', null),
  ('onboarding', 3, 'Everything in one place', 'Manage bookings, track orders and keep your preferences up to date.', null),
  ('tour', 1, 'Discover treatments', 'Browse treatment categories and book from the Home tab.', 'home'),
  ('tour', 2, 'Your appointments', 'See upcoming visits, reschedule or pay a balance from Bookings.', 'bookings'),
  ('tour', 3, 'Shop skin care', 'Tap Store to browse serums, creams and gift sets, delivered to you or ready for pickup at your branch.', 'store'),
  ('tour', 4, 'Track your orders', 'Follow every order from placed to delivered.', 'orders'),
  ('tour', 5, 'Your profile', 'Update your details, addresses and notification preferences.', 'profile');

create table public.email_templates (
  key text primary key,
  subject text not null,
  html_body text not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);
create trigger email_templates_updated_at before update on public.email_templates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create type public.notification_kind as enum ('booking', 'order', 'payment', 'membership', 'offer', 'system');

create table public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  bookings boolean not null default true,
  orders boolean not null default true,
  offers boolean not null default false, -- marketing is opt-in
  push_enabled boolean not null default true,
  email_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
create trigger notification_preferences_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.notification_kind not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ios', 'android', 'web')),
  last_seen_at timestamptz not null default now(),
  invalid_at timestamptz
);
create index device_tokens_user_idx on public.device_tokens (user_id) where invalid_at is null;

-- Outbox consumed by the dispatch-notifications Edge Function (service role).
create table public.notification_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  channel text not null check (channel in ('push', 'email')),
  kind public.notification_kind not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  dedupe_key text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  error text,
  unique (channel, dedupe_key)
);
create index notification_outbox_pending_idx on public.notification_outbox (scheduled_for) where status = 'pending';

create or replace function private.preference_allows(p_user uuid, p_kind public.notification_kind)
returns boolean language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'booking' then coalesce((select bookings from public.notification_preferences where user_id = p_user), true)
    when 'order' then coalesce((select orders from public.notification_preferences where user_id = p_user), true)
    when 'offer' then coalesce((select offers from public.notification_preferences where user_id = p_user), false)
    else true -- payment, membership and system messages are transactional
  end;
$$;

-- Single entry point: stores the in-app notification and queues push/email according to preferences.
-- A dedupe key makes the call idempotent (reminders, retries).
create or replace function private.notify(
  p_user uuid, p_kind public.notification_kind, p_title text, p_body text,
  p_data jsonb default '{}'::jsonb, p_dedupe text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_push boolean;
  v_email boolean;
begin
  if p_user is null or not private.preference_allows(p_user, p_kind) then return; end if;
  if p_dedupe is not null and exists (
    select 1 from public.notification_outbox where dedupe_key = p_dedupe and user_id = p_user
  ) then return; end if;

  insert into public.notifications (user_id, kind, title, body, data) values (p_user, p_kind, p_title, p_body, p_data);

  select coalesce(push_enabled, true), coalesce(email_enabled, true) into v_push, v_email
  from (select 1) x left join public.notification_preferences np on np.user_id = p_user;
  if coalesce(v_push, true) then
    insert into public.notification_outbox (user_id, channel, kind, title, body, data, dedupe_key)
    values (p_user, 'push', p_kind, p_title, p_body, p_data, p_dedupe)
    on conflict (channel, dedupe_key) do nothing;
  end if;
  if coalesce(v_email, true) and p_kind in ('booking', 'order', 'payment', 'membership') then
    insert into public.notification_outbox (user_id, channel, kind, title, body, data, dedupe_key)
    values (p_user, 'email', p_kind, p_title, p_body, p_data, p_dedupe)
    on conflict (channel, dedupe_key) do nothing;
  end if;
end $$;

-- Event triggers -------------------------------------------------------------
create or replace function private.on_booking_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'confirmed' then
      perform private.notify(new.user_id, 'booking', 'Appointment confirmed',
        format('%s is booked. Reference %s.', new.service_name, new.reference),
        jsonb_build_object('booking_id', new.id), 'booking-confirmed:' || new.id);
    elsif new.status = 'cancelled' then
      perform private.notify(new.user_id, 'booking', 'Appointment cancelled',
        format('Your %s appointment (%s) was cancelled.', new.service_name, new.reference),
        jsonb_build_object('booking_id', new.id), 'booking-cancelled:' || new.id);
    end if;
  elsif new.starts_at is distinct from old.starts_at and new.status in ('pending', 'confirmed') then
    perform private.notify(new.user_id, 'booking', 'Appointment rescheduled',
      format('Your %s appointment (%s) has a new time.', new.service_name, new.reference),
      jsonb_build_object('booking_id', new.id), 'booking-rescheduled:' || new.id || ':' || new.starts_at::text);
  end if;
  return new;
end $$;
create trigger bookings_notify after update on public.bookings
  for each row execute function private.on_booking_change();

create or replace function private.on_order_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    perform private.notify(new.user_id, 'order', 'Order ' || new.number,
      case new.status
        when 'payment_confirmed' then 'Payment received. We are preparing your order.'
        when 'processing' then 'Your order is being prepared.'
        when 'ready_for_pickup' then 'Your order is ready for pickup.'
        when 'shipped' then 'Your order has shipped.'
        when 'out_for_delivery' then 'Your order is out for delivery.'
        when 'delivered' then 'Your order has been delivered.'
        when 'cancelled' then 'Your order was cancelled.'
        when 'refunded' then 'Your order was refunded.'
        else 'Your order was updated.' end,
      jsonb_build_object('order_id', new.id), 'order-' || new.status || ':' || new.id);
  end if;
  return new;
end $$;
create trigger orders_notify after update on public.orders
  for each row execute function private.on_order_change();

create or replace function private.on_payment_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'succeeded' then
      perform private.notify(new.user_id, 'payment', 'Payment received',
        format('We received ₦%s. Reference %s.', to_char(new.amount_kobo / 100.0, 'FM999,999,999,990.00'), new.reference),
        jsonb_build_object('payment_id', new.id), 'payment-succeeded:' || new.id);
    elsif new.status = 'failed' then
      perform private.notify(new.user_id, 'payment', 'Payment unsuccessful',
        'Your payment could not be completed. Please try again.',
        jsonb_build_object('payment_id', new.id), 'payment-failed:' || new.id);
    end if;
  end if;
  return new;
end $$;
create trigger payments_notify after update on public.payments
  for each row execute function private.on_payment_change();

create or replace function private.on_membership_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'active' and old.status <> 'active' then
    perform private.notify(new.user_id, 'membership', 'Membership active',
      format('Your %s is active until %s.', new.plan_snapshot ->> 'name', to_char(new.expires_at, 'DD Mon YYYY')),
      jsonb_build_object('membership_id', new.id), 'membership-active:' || new.id);
  end if;
  return new;
end $$;
create trigger memberships_notify after update on public.memberships
  for each row execute function private.on_membership_change();

-- Scheduled jobs (idempotent thanks to dedupe keys) -----------------------------
create or replace function public.enqueue_booking_reminders()
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select b.id, b.user_id, b.service_name, b.starts_at, br.timezone
    from public.bookings b join public.branches br on br.id = b.branch_id
    where b.status = 'confirmed' and b.starts_at between now() + interval '23 hours' and now() + interval '25 hours'
  loop
    perform private.notify(r.user_id, 'booking', 'Appointment tomorrow',
      format('%s at %s.', r.service_name, to_char(r.starts_at at time zone r.timezone, 'HH12:MI AM')),
      jsonb_build_object('booking_id', r.id), 'reminder-24h:' || r.id);
    v_count := v_count + 1;
  end loop;
  update public.bookings set reminder_sent_at = now()
  where status = 'confirmed' and starts_at between now() + interval '23 hours' and now() + interval '25 hours'
    and reminder_sent_at is null;
  return v_count;
end $$;
revoke all on function public.enqueue_booking_reminders() from public, anon, authenticated;
grant execute on function public.enqueue_booking_reminders() to service_role;

create or replace function public.expire_memberships()
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_count int := 0;
begin
  for r in select id, user_id, expires_at from public.memberships
           where status = 'active' and expires_at between now() and now() + interval '7 days' loop
    perform private.notify(r.user_id, 'membership', 'Membership expiring soon',
      format('Your membership expires on %s.', to_char(r.expires_at, 'DD Mon YYYY')),
      jsonb_build_object('membership_id', r.id), 'membership-expiring:' || r.id);
  end loop;
  update public.memberships set status = 'expired' where status = 'active' and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.expire_memberships() from public, anon, authenticated;
grant execute on function public.expire_memberships() to service_role;

-- Staff broadcast. Marketing ('offer') honours each customer's opt-in; segments are server-side.
create or replace function public.send_broadcast(
  p_title text, p_body text, p_segment text default 'all', p_branch uuid default null,
  p_kind public.notification_kind default 'offer'
)
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_count int := 0;
  v_batch text := gen_random_uuid()::text;
begin
  if not public.has_permission('notifications.send', p_branch) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_segment not in ('all', 'branch', 'recent_customers') then
    raise exception 'invalid_segment' using errcode = 'P0001';
  end if;
  if p_segment = 'branch' and p_branch is null then
    raise exception 'branch_required' using errcode = 'P0001';
  end if;
  for r in
    select p.id from public.profiles p
    where p.deleted_at is null
      and (p_segment <> 'branch' or p.preferred_branch_id = p_branch)
      and (p_segment <> 'recent_customers' or exists (
            select 1 from public.bookings b where b.user_id = p.id and b.created_at > now() - interval '90 days'))
  loop
    perform private.notify(r.id, p_kind, p_title, p_body, '{}'::jsonb, 'broadcast:' || v_batch || ':' || r.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.send_broadcast(text, text, text, uuid, public.notification_kind) from public, anon;
grant execute on function public.send_broadcast(text, text, text, uuid, public.notification_kind) to authenticated;

-- ---------------------------------------------------------------------------
-- Support tickets
-- ---------------------------------------------------------------------------
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  branch_id uuid references public.branches (id) on delete set null,
  subject text not null check (char_length(subject) between 3 and 200),
  status text not null default 'open' check (status in ('open', 'pending', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_tickets_user_idx on public.support_tickets (user_id, created_at desc);
create index support_tickets_status_idx on public.support_tickets (status, created_at desc);
create trigger support_tickets_updated_at before update on public.support_tickets
  for each row execute function public.set_updated_at();

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  is_staff boolean not null default false,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

-- Messages are stamped server-side so a customer cannot pose as staff.
create or replace function public.support_messages_stamp()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_ticket public.support_tickets;
begin
  select * into v_ticket from public.support_tickets where id = new.ticket_id;
  new.author_id := (select auth.uid());
  new.is_staff := v_ticket.user_id is distinct from (select auth.uid())
                  and public.has_permission('support.manage', v_ticket.branch_id);
  return new;
end $$;
create trigger support_messages_stamp before insert on public.support_messages
  for each row execute function public.support_messages_stamp();
