-- 0006: membership plans, packages, reviews and wishlists.

-- ---------------------------------------------------------------------------
-- Memberships
-- ---------------------------------------------------------------------------
create type public.membership_interval as enum ('monthly', 'quarterly', 'yearly');
create type public.membership_status as enum ('pending', 'active', 'expired', 'cancelled');

create table public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  interval public.membership_interval not null,
  duration_days int not null check (duration_days > 0),
  price_kobo bigint not null check (price_kobo >= 0),
  benefits text[] not null default '{}',
  -- Plans stay unpublished until the business owner confirms price and benefits.
  is_published boolean not null default false,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger membership_plans_updated_at before update on public.membership_plans
  for each row execute function public.set_updated_at();
create trigger audit_membership_plans after insert or update or delete on public.membership_plans
  for each row execute function public.audit_trigger();

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  plan_id uuid references public.membership_plans (id) on delete set null,
  status public.membership_status not null default 'pending',
  plan_snapshot jsonb not null,
  price_kobo bigint not null,
  starts_at timestamptz,
  expires_at timestamptz,
  auto_renew boolean not null default false,
  cancelled_at timestamptz,
  expiry_notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index memberships_user_idx on public.memberships (user_id, created_at desc);
create index memberships_expiry_idx on public.memberships (expires_at) where status = 'active';

-- Initial reference pricing from the business brief. UNPUBLISHED and UNVERIFIED until confirmed.
insert into public.membership_plans (slug, name, interval, duration_days, price_kobo, display_order, description) values
  ('monthly', 'Monthly Membership', 'monthly', 30, 100000000, 1, 'Reference price ₦1,000,000 — pending business confirmation.'),
  ('quarterly', 'Quarterly Membership', 'quarterly', 90, 300000000, 2, 'Reference price ₦3,000,000 — pending business confirmation.'),
  ('yearly', 'Yearly Membership', 'yearly', 365, 700000000, 3, 'Reference price ₦7,000,000 — pending business confirmation.');

-- Called by the user to start a membership purchase; activation happens only on verified payment.
create or replace function public.create_membership_purchase(p_plan uuid)
returns public.memberships language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_plan public.membership_plans;
  v_m public.memberships;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select * into v_plan from public.membership_plans where id = p_plan and is_published;
  if not found then raise exception 'plan_unavailable' using errcode = 'P0001'; end if;
  -- Reuse an unpaid pending purchase for the same plan to avoid clutter.
  select * into v_m from public.memberships where user_id = v_uid and plan_id = p_plan and status = 'pending' limit 1;
  if found then return v_m; end if;
  insert into public.memberships (user_id, plan_id, plan_snapshot, price_kobo)
  values (v_uid, v_plan.id, to_jsonb(v_plan), v_plan.price_kobo)
  returning * into v_m;
  return v_m;
end $$;
revoke all on function public.create_membership_purchase(uuid) from public, anon;
grant execute on function public.create_membership_purchase(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Packages (bridal, mom & daughter, couples, custom)
-- ---------------------------------------------------------------------------
create table public.packages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  kind text not null default 'custom' check (kind in ('bridal', 'mom_daughter', 'couples', 'custom')),
  name text not null,
  description text,
  image_url text,
  price_kobo bigint not null check (price_kobo >= 0),
  original_price_kobo bigint check (original_price_kobo is null or original_price_kobo >= price_kobo),
  validity_days int check (validity_days is null or validity_days > 0),
  terms text,
  branch_ids uuid[] not null default '{}', -- empty = all branches
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger packages_updated_at before update on public.packages
  for each row execute function public.set_updated_at();
create trigger audit_packages after insert or update or delete on public.packages
  for each row execute function public.audit_trigger();

create table public.package_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages (id) on delete cascade,
  service_id uuid references public.services (id) on delete restrict,
  product_variant_id uuid references public.product_variants (id) on delete restrict,
  quantity int not null default 1 check (quantity > 0),
  check ((service_id is not null) <> (product_variant_id is not null))
);
create index package_items_package_idx on public.package_items (package_id);

create table public.package_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  package_id uuid references public.packages (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'active', 'expired', 'cancelled')),
  package_snapshot jsonb not null,
  price_kobo bigint not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index package_purchases_user_idx on public.package_purchases (user_id, created_at desc);

create or replace function public.create_package_purchase(p_package uuid)
returns public.package_purchases language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_pkg public.packages;
  v_p public.package_purchases;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select * into v_pkg from public.packages where id = p_package and is_active;
  if not found then raise exception 'package_unavailable' using errcode = 'P0001'; end if;
  insert into public.package_purchases (user_id, package_id, package_snapshot, price_kobo)
  values (v_uid, v_pkg.id, to_jsonb(v_pkg) || jsonb_build_object(
    'items', (select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) from public.package_items i where i.package_id = v_pkg.id)
  ), v_pkg.price_kobo)
  returning * into v_p;
  return v_p;
end $$;
revoke all on function public.create_package_purchase(uuid) from public, anon;
grant execute on function public.create_package_purchase(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Reviews: only customers with a completed booking / delivered order may review.
-- ---------------------------------------------------------------------------
create type public.review_target as enum ('service', 'staff', 'product');
create type public.review_status as enum ('pending', 'approved', 'rejected');

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  target public.review_target not null,
  service_id uuid references public.services (id) on delete cascade,
  staff_id uuid references public.staff (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  body text check (body is null or char_length(body) <= 2000),
  image_urls text[] not null default '{}',
  status public.review_status not null default 'pending',
  verified boolean not null default false,
  reviewer_name text,
  created_at timestamptz not null default now(),
  check (
    (target = 'service' and service_id is not null and staff_id is null and product_id is null) or
    (target = 'staff' and staff_id is not null and service_id is null and product_id is null) or
    (target = 'product' and product_id is not null and service_id is null and staff_id is null)
  )
);
create unique index reviews_one_per_service on public.reviews (user_id, service_id, booking_id) where target = 'service';
create unique index reviews_one_per_staff on public.reviews (user_id, staff_id, booking_id) where target = 'staff';
create unique index reviews_one_per_product on public.reviews (user_id, product_id) where target = 'product';
create index reviews_service_idx on public.reviews (service_id) where status = 'approved';
create index reviews_staff_idx on public.reviews (staff_id) where status = 'approved';
create index reviews_product_idx on public.reviews (product_id) where status = 'approved';

create or replace function public.reviews_enforce_eligibility()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_ref uuid;
  v_name text;
begin
  if (select auth.uid()) is null then
    return new; -- privileged server context (migrations / service role)
  end if;
  new.user_id := (select auth.uid());

  if new.target = 'service' then
    select b.id into v_ref from public.bookings b
    where b.user_id = new.user_id and b.service_id = new.service_id and b.status = 'completed'
      and not exists (select 1 from public.reviews r where r.booking_id = b.id and r.target = 'service' and r.user_id = b.user_id)
    order by b.starts_at desc limit 1;
    new.booking_id := v_ref;
  elsif new.target = 'staff' then
    select b.id into v_ref from public.bookings b
    where b.user_id = new.user_id and b.staff_id = new.staff_id and b.status = 'completed'
      and not exists (select 1 from public.reviews r where r.booking_id = b.id and r.target = 'staff' and r.user_id = b.user_id)
    order by b.starts_at desc limit 1;
    new.booking_id := v_ref;
  else
    select o.id into v_ref from public.orders o
    join public.order_items oi on oi.order_id = o.id
    join public.product_variants v on v.id = oi.variant_id
    where o.user_id = new.user_id and v.product_id = new.product_id and o.status = 'delivered'
    order by o.created_at desc limit 1;
    new.order_id := v_ref;
  end if;

  if v_ref is null then
    raise exception 'review_not_eligible' using errcode = 'P0001';
  end if;

  select split_part(coalesce(full_name, 'Customer'), ' ', 1) ||
         coalesce(' ' || nullif(left(split_part(coalesce(full_name, ''), ' ', 2), 1), '') || '.', '')
    into v_name from public.profiles where id = new.user_id;
  new.reviewer_name := v_name;
  new.verified := true;
  if not public.has_permission('reviews.moderate') then
    new.status := 'pending';
  end if;
  return new;
end $$;
create trigger reviews_eligibility before insert on public.reviews
  for each row execute function public.reviews_enforce_eligibility();

create view public.service_ratings with (security_invoker = true) as
  select service_id, round(avg(rating)::numeric, 1) as average, count(*)::int as review_count
  from public.reviews where status = 'approved' and target = 'service' group by service_id;
create view public.staff_ratings with (security_invoker = true) as
  select staff_id, round(avg(rating)::numeric, 1) as average, count(*)::int as review_count
  from public.reviews where status = 'approved' and target = 'staff' group by staff_id;
create view public.product_ratings with (security_invoker = true) as
  select product_id, round(avg(rating)::numeric, 1) as average, count(*)::int as review_count
  from public.reviews where status = 'approved' and target = 'product' group by product_id;

-- ---------------------------------------------------------------------------
-- Wishlists
-- ---------------------------------------------------------------------------
create table public.wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  wishlist_id uuid not null references public.wishlists (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  service_id uuid references public.services (id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((product_id is not null) <> (service_id is not null)),
  unique (wishlist_id, product_id),
  unique (wishlist_id, service_id)
);
