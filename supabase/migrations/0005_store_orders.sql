-- 0005: skincare store, branch inventory, carts, coupons and orders.
-- All pricing, stock and discount decisions are made here; clients only display what these functions return.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.product_categories (id) on delete set null,
  slug text not null unique,
  name text not null,
  image_url text,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger product_categories_updated_at before update on public.product_categories
  for each row execute function public.set_updated_at();

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category_id uuid references public.product_categories (id) on delete set null,
  name text not null,
  summary text,
  description text,
  ingredients text,
  how_to_use text,
  thumbnail_url text,
  is_featured boolean not null default false,
  is_best_seller boolean not null default false,
  is_new_arrival boolean not null default false,
  is_active boolean not null default true,
  search_text tsvector generated always as (
    to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(summary, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_idx on public.products (category_id) where is_active;
create index products_search_idx on public.products using gin (search_text);
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger audit_products after insert or update or delete on public.products
  for each row execute function public.audit_trigger();

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  name text not null, -- e.g. "30 ml"
  sku text not null unique,
  price_kobo bigint not null check (price_kobo >= 0),
  compare_at_price_kobo bigint check (compare_at_price_kobo is null or compare_at_price_kobo > price_kobo),
  weight_grams int check (weight_grams is null or weight_grams >= 0),
  low_stock_threshold int not null default 5 check (low_stock_threshold >= 0),
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index product_variants_product_idx on public.product_variants (product_id, display_order);
create trigger product_variants_updated_at before update on public.product_variants
  for each row execute function public.set_updated_at();
create trigger audit_product_variants after insert or update or delete on public.product_variants
  for each row execute function public.audit_trigger();

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  url text not null,
  alt text,
  position int not null default 0
);
create index product_images_product_idx on public.product_images (product_id, position);

-- ---------------------------------------------------------------------------
-- Inventory (per branch + variant). Direct DML is not granted; use the functions below.
-- ---------------------------------------------------------------------------
create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  quantity int not null default 0 check (quantity >= 0),
  reserved int not null default 0 check (reserved >= 0),
  updated_at timestamptz not null default now(),
  unique (branch_id, variant_id),
  check (reserved <= quantity)
);
create index inventory_variant_idx on public.inventory (variant_id);

create type public.inventory_txn_kind as enum (
  'initial', 'adjustment', 'sale', 'return', 'transfer_in', 'transfer_out', 'reservation', 'release'
);

create table public.inventory_transactions (
  id bigint generated always as identity primary key,
  inventory_id uuid not null references public.inventory (id) on delete cascade,
  kind public.inventory_txn_kind not null,
  quantity_delta int not null default 0,
  reserved_delta int not null default 0,
  reason text,
  actor_id uuid,
  order_id uuid,
  created_at timestamptz not null default now()
);
create index inventory_transactions_inv_idx on public.inventory_transactions (inventory_id, created_at desc);

create or replace function public.inventory_txn_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'inventory_transactions is append-only' using errcode = '42501';
end $$;
create trigger inventory_transactions_no_change before update or delete on public.inventory_transactions
  for each row execute function public.inventory_txn_immutable();

-- Staff stock adjustment (positive or negative). Requires inventory.adjust for the branch.
create or replace function public.adjust_inventory(p_branch uuid, p_variant uuid, p_delta int, p_reason text)
returns public.inventory language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.inventory;
begin
  if not public.has_permission('inventory.adjust', p_branch) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  insert into public.inventory (branch_id, variant_id, quantity)
  values (p_branch, p_variant, 0)
  on conflict (branch_id, variant_id) do nothing;
  select * into v_inv from public.inventory where branch_id = p_branch and variant_id = p_variant for update;
  if v_inv.quantity + p_delta < v_inv.reserved then
    raise exception 'insufficient_stock' using errcode = 'P0001';
  end if;
  update public.inventory set quantity = quantity + p_delta, updated_at = now()
  where id = v_inv.id returning * into v_inv;
  insert into public.inventory_transactions (inventory_id, kind, quantity_delta, reason, actor_id)
  values (v_inv.id, 'adjustment', p_delta, p_reason, (select auth.uid()));
  return v_inv;
end $$;

create or replace function public.transfer_inventory(p_from uuid, p_to uuid, p_variant uuid, p_qty int, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_src public.inventory;
  v_dst public.inventory;
begin
  if p_qty <= 0 or p_from = p_to then raise exception 'invalid_transfer' using errcode = 'P0001'; end if;
  if not (public.has_permission('inventory.adjust', p_from) and public.has_permission('inventory.adjust', p_to)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.inventory (branch_id, variant_id) values (p_from, p_variant), (p_to, p_variant)
  on conflict (branch_id, variant_id) do nothing;
  -- Lock in a stable order to avoid deadlocks between concurrent opposite transfers.
  perform 1 from public.inventory where variant_id = p_variant and branch_id in (p_from, p_to)
    order by id for update;
  select * into v_src from public.inventory where branch_id = p_from and variant_id = p_variant;
  if v_src.quantity - v_src.reserved < p_qty then raise exception 'insufficient_stock' using errcode = 'P0001'; end if;
  update public.inventory set quantity = quantity - p_qty, updated_at = now() where id = v_src.id;
  update public.inventory set quantity = quantity + p_qty, updated_at = now()
    where branch_id = p_to and variant_id = p_variant returning * into v_dst;
  insert into public.inventory_transactions (inventory_id, kind, quantity_delta, reason, actor_id) values
    (v_src.id, 'transfer_out', -p_qty, p_reason, (select auth.uid())),
    (v_dst.id, 'transfer_in', p_qty, p_reason, (select auth.uid()));
end $$;

-- ---------------------------------------------------------------------------
-- Addresses, carts, delivery
-- ---------------------------------------------------------------------------
create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text,
  state text not null,
  city text not null,
  address_line text not null,
  landmark text,
  phone text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index addresses_user_idx on public.addresses (user_id);

create table public.delivery_fees (
  id uuid primary key default gen_random_uuid(),
  state text not null unique,
  fee_kobo bigint not null check (fee_kobo >= 0),
  estimated_days int,
  is_active boolean not null default true
);
create trigger audit_delivery_fees after insert or update or delete on public.delivery_fees
  for each row execute function public.audit_trigger();

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now()
);
create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  quantity int not null check (quantity between 1 and 99),
  created_at timestamptz not null default now(),
  unique (cart_id, variant_id)
);

-- ---------------------------------------------------------------------------
-- Coupons
-- ---------------------------------------------------------------------------
create type public.coupon_kind as enum ('percentage', 'fixed');

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code)),
  description text,
  kind public.coupon_kind not null,
  value bigint not null check (value > 0), -- basis points for percentage, kobo for fixed
  min_purchase_kobo bigint not null default 0,
  max_discount_kobo bigint,
  starts_at timestamptz,
  expires_at timestamptz,
  usage_limit int check (usage_limit is null or usage_limit > 0),
  per_customer_limit int check (per_customer_limit is null or per_customer_limit > 0),
  first_order_only boolean not null default false,
  product_ids uuid[] not null default '{}',
  category_ids uuid[] not null default '{}',
  branch_ids uuid[] not null default '{}',
  used_count int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (kind <> 'percentage' or value <= 10000)
);
create trigger audit_coupons after insert or update or delete on public.coupons
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create type public.order_status as enum (
  'placed', 'payment_confirmed', 'processing', 'ready_for_pickup', 'shipped',
  'out_for_delivery', 'delivered', 'cancelled', 'refunded'
);
create type public.fulfilment_method as enum ('delivery', 'pickup');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  user_id uuid references auth.users (id) on delete set null,
  branch_id uuid not null references public.branches (id) on delete restrict,
  status public.order_status not null default 'placed',
  fulfilment public.fulfilment_method not null,
  contact_name text,
  contact_phone text,
  shipping_address jsonb, -- snapshot
  subtotal_kobo bigint not null check (subtotal_kobo >= 0),
  discount_kobo bigint not null default 0 check (discount_kobo >= 0),
  delivery_fee_kobo bigint not null default 0 check (delivery_fee_kobo >= 0),
  total_kobo bigint not null check (total_kobo >= 0),
  coupon_id uuid references public.coupons (id) on delete set null,
  coupon_code text,
  tracking_number text,
  carrier text,
  estimated_delivery date,
  reservation_expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_kobo = subtotal_kobo - discount_kobo + delivery_fee_kobo)
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_branch_idx on public.orders (branch_id, status, created_at desc);
create index orders_expiry_idx on public.orders (reservation_expires_at) where status = 'placed';
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  name_snapshot text not null,
  variant_snapshot text not null,
  sku_snapshot text not null,
  image_snapshot text,
  unit_price_kobo bigint not null check (unit_price_kobo >= 0),
  quantity int not null check (quantity > 0),
  line_total_kobo bigint not null check (line_total_kobo = unit_price_kobo * quantity)
);
create index order_items_order_idx on public.order_items (order_id);

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  note text,
  changed_by uuid,
  created_at timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  inventory_id uuid not null references public.inventory (id) on delete cascade,
  quantity int not null check (quantity > 0),
  status text not null default 'active' check (status in ('active', 'consumed', 'released')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index inventory_reservations_order_idx on public.inventory_reservations (order_id);

create or replace function public.order_transition_allowed(p_from public.order_status, p_to public.order_status)
returns boolean language sql immutable as $$
  select case p_from
    when 'placed' then p_to in ('payment_confirmed', 'cancelled')
    when 'payment_confirmed' then p_to in ('processing', 'cancelled', 'refunded')
    when 'processing' then p_to in ('ready_for_pickup', 'shipped', 'cancelled', 'refunded')
    when 'ready_for_pickup' then p_to in ('delivered', 'cancelled', 'refunded')
    when 'shipped' then p_to in ('out_for_delivery', 'delivered', 'refunded')
    when 'out_for_delivery' then p_to in ('delivered', 'refunded')
    when 'delivered' then p_to in ('refunded')
    else false
  end;
$$;

create or replace function public.orders_track_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by)
    values (new.id, null, new.status, (select auth.uid()));
  elsif new.status is distinct from old.status then
    if not public.order_transition_allowed(old.status, new.status) then
      raise exception 'invalid_order_transition: % -> %', old.status, new.status using errcode = 'P0001';
    end if;
    insert into public.order_status_history (order_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, (select auth.uid()));
  end if;
  return new;
end $$;
create trigger orders_track_status_ins after insert on public.orders
  for each row execute function public.orders_track_status();
create trigger orders_track_status_upd before update of status on public.orders
  for each row execute function public.orders_track_status();
create trigger audit_orders after update or delete on public.orders
  for each row execute function public.audit_trigger();

create or replace function public.order_history_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'order_status_history is append-only' using errcode = '42501';
end $$;
create trigger order_status_history_no_change before update or delete on public.order_status_history
  for each row execute function public.order_history_immutable();

-- ---------------------------------------------------------------------------
-- Pricing engine (authoritative). private.* is not reachable through the Data API.
-- ---------------------------------------------------------------------------
create or replace function private.price_cart(
  p_uid uuid,
  p_branch uuid,
  p_fulfilment public.fulfilment_method,
  p_state text,
  p_coupon text
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_lines jsonb;
  v_subtotal bigint := 0;
  v_discount bigint := 0;
  v_delivery bigint := 0;
  v_errors jsonb := '[]'::jsonb;
  v_coupon public.coupons;
  v_eligible bigint;
  v_code text := nullif(upper(trim(coalesce(p_coupon, ''))), '');
  v_prior_orders int;
  v_user_uses int;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'variant_id', v.id, 'product_id', p.id, 'category_id', p.category_id,
      'name', p.name, 'variant', v.name, 'sku', v.sku, 'image', p.thumbnail_url,
      'unit_price_kobo', v.price_kobo, 'quantity', ci.quantity,
      'available', coalesce(inv.quantity - inv.reserved, 0),
      'line_total_kobo', v.price_kobo * ci.quantity
    ) order by ci.created_at), '[]'::jsonb)
  into v_lines
  from public.carts c
  join public.cart_items ci on ci.cart_id = c.id
  join public.product_variants v on v.id = ci.variant_id and v.is_active
  join public.products p on p.id = v.product_id and p.is_active
  left join public.inventory inv on inv.variant_id = v.id and inv.branch_id = p_branch
  where c.user_id = p_uid;

  if jsonb_array_length(v_lines) = 0 then
    v_errors := v_errors || to_jsonb('cart_empty'::text);
  end if;

  select coalesce(sum((l ->> 'line_total_kobo')::bigint), 0) into v_subtotal
  from jsonb_array_elements(v_lines) l;

  if exists (select 1 from jsonb_array_elements(v_lines) l where (l ->> 'quantity')::int > (l ->> 'available')::int) then
    v_errors := v_errors || to_jsonb('out_of_stock'::text);
  end if;

  if p_fulfilment = 'delivery' then
    select fee_kobo into v_delivery from public.delivery_fees
    where lower(state) = lower(coalesce(p_state, '')) and is_active;
    if v_delivery is null then
      v_delivery := 0;
      v_errors := v_errors || to_jsonb('delivery_unavailable'::text);
    end if;
  end if;

  if v_code is not null then
    select * into v_coupon from public.coupons where code = v_code and is_active;
    if not found
       or (v_coupon.starts_at is not null and v_coupon.starts_at > now())
       or (v_coupon.expires_at is not null and v_coupon.expires_at <= now())
       or (v_coupon.usage_limit is not null and v_coupon.used_count >= v_coupon.usage_limit)
       or (cardinality(v_coupon.branch_ids) > 0 and not (p_branch = any (v_coupon.branch_ids))) then
      v_errors := v_errors || to_jsonb('coupon_invalid'::text);
      v_coupon := null;
    else
      if v_coupon.per_customer_limit is not null then
        select count(*) into v_user_uses from public.coupon_redemptions r
        where r.coupon_id = v_coupon.id and r.user_id = p_uid;
        if v_user_uses >= v_coupon.per_customer_limit then
          v_errors := v_errors || to_jsonb('coupon_limit_reached'::text);
          v_coupon := null;
        end if;
      end if;
      if v_coupon.id is not null and v_coupon.first_order_only then
        select count(*) into v_prior_orders from public.orders o
        where o.user_id = p_uid and o.paid_at is not null;
        if v_prior_orders > 0 then
          v_errors := v_errors || to_jsonb('coupon_first_order_only'::text);
          v_coupon := null;
        end if;
      end if;
    end if;

    if v_coupon.id is not null then
      select coalesce(sum((l ->> 'line_total_kobo')::bigint), 0) into v_eligible
      from jsonb_array_elements(v_lines) l
      where (cardinality(v_coupon.product_ids) = 0 or (l ->> 'product_id')::uuid = any (v_coupon.product_ids))
        and (cardinality(v_coupon.category_ids) = 0
             or (l ->> 'category_id') is not null and (l ->> 'category_id')::uuid = any (v_coupon.category_ids));
      if v_eligible < v_coupon.min_purchase_kobo or v_eligible = 0 then
        v_errors := v_errors || to_jsonb('coupon_minimum_not_met'::text);
        v_coupon := null;
      else
        v_discount := case v_coupon.kind
          when 'percentage' then (v_eligible * v_coupon.value + 5000) / 10000
          else v_coupon.value end;
        if v_coupon.max_discount_kobo is not null then
          v_discount := least(v_discount, v_coupon.max_discount_kobo);
        end if;
        v_discount := least(v_discount, v_eligible);
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'lines', v_lines,
    'subtotal_kobo', v_subtotal,
    'discount_kobo', v_discount,
    'delivery_fee_kobo', v_delivery,
    'total_kobo', v_subtotal - v_discount + v_delivery,
    'coupon_id', case when v_coupon.id is null then null else to_jsonb(v_coupon.id) end,
    'coupon_code', case when v_coupon.id is null then null else to_jsonb(v_coupon.code) end,
    'errors', v_errors
  );
end $$;

-- Client-facing quote: same engine, caller's own cart only.
create or replace function public.quote_cart(
  p_branch uuid, p_fulfilment public.fulfilment_method, p_state text default null, p_coupon text default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  return private.price_cart((select auth.uid()), p_branch, p_fulfilment, p_state, p_coupon);
end $$;
revoke all on function public.quote_cart(uuid, public.fulfilment_method, text, text) from public, anon;
grant execute on function public.quote_cart(uuid, public.fulfilment_method, text, text) to authenticated;

-- Generic stock release used by cancellation and expiry.
create or replace function private.release_order_stock(p_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in
    select * from public.inventory_reservations where order_id = p_order and status = 'active' order by inventory_id
  loop
    update public.inventory set reserved = greatest(reserved - r.quantity, 0), updated_at = now()
    where id = r.inventory_id;
    insert into public.inventory_transactions (inventory_id, kind, reserved_delta, reason, order_id)
    values (r.inventory_id, 'release', -r.quantity, 'order released', p_order);
    update public.inventory_reservations set status = 'released' where id = r.id;
  end loop;
end $$;

create or replace function public.generate_order_number()
returns text language plpgsql volatile as $$
declare
  v_num text;
begin
  loop
    v_num := 'INF-' || lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint) % 1000000)::text, 6, '0');
    exit when not exists (select 1 from public.orders where number = v_num);
  end loop;
  return v_num;
end $$;

-- Create an order from the caller's cart; reserves stock atomically.
create or replace function public.create_order(
  p_branch uuid,
  p_fulfilment public.fulfilment_method,
  p_contact_name text,
  p_contact_phone text,
  p_address jsonb,
  p_coupon text default null
)
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_priced jsonb;
  v_state text;
  v_order public.orders;
  v_line jsonb;
  v_inv public.inventory;
  v_minutes int := public.setting_int('inventory.reservation_minutes', 30);
  v_expires timestamptz := now() + make_interval(mins => public.setting_int('inventory.reservation_minutes', 30));
  r record;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not exists (select 1 from public.branches where id = p_branch and is_active) then
    raise exception 'branch_unavailable' using errcode = 'P0001';
  end if;
  if p_fulfilment = 'delivery' then
    v_state := p_address ->> 'state';
    if coalesce(p_address ->> 'address', '') = '' or coalesce(v_state, '') = ''
       or coalesce(p_address ->> 'city', '') = '' or coalesce(p_address ->> 'landmark', '') = '' then
      raise exception 'address_incomplete' using errcode = 'P0001';
    end if;
  end if;

  -- Free stock held by this customer's earlier unpaid checkouts before re-reserving.
  for r in select id from public.orders where user_id = v_uid and status = 'placed' and paid_at is null loop
    perform private.release_order_stock(r.id);
    update public.orders set status = 'cancelled' where id = r.id;
  end loop;

  v_priced := private.price_cart(v_uid, p_branch, p_fulfilment, v_state, p_coupon);
  if jsonb_array_length(v_priced -> 'errors') > 0 then
    raise exception '%', (v_priced -> 'errors' ->> 0) using errcode = 'P0001';
  end if;

  insert into public.orders (
    number, user_id, branch_id, fulfilment, contact_name, contact_phone, shipping_address,
    subtotal_kobo, discount_kobo, delivery_fee_kobo, total_kobo, coupon_id, coupon_code, reservation_expires_at
  ) values (
    public.generate_order_number(), v_uid, p_branch, p_fulfilment, p_contact_name, p_contact_phone,
    case when p_fulfilment = 'delivery' then p_address else null end,
    (v_priced ->> 'subtotal_kobo')::bigint, (v_priced ->> 'discount_kobo')::bigint,
    (v_priced ->> 'delivery_fee_kobo')::bigint, (v_priced ->> 'total_kobo')::bigint,
    nullif(v_priced ->> 'coupon_id', '')::uuid, v_priced ->> 'coupon_code', v_expires
  ) returning * into v_order;

  -- Reserve in a deterministic order so concurrent checkouts cannot deadlock.
  for v_line in
    select l from jsonb_array_elements(v_priced -> 'lines') l order by l ->> 'variant_id'
  loop
    select * into v_inv from public.inventory
    where branch_id = p_branch and variant_id = (v_line ->> 'variant_id')::uuid for update;
    if not found or v_inv.quantity - v_inv.reserved < (v_line ->> 'quantity')::int then
      raise exception 'out_of_stock' using errcode = 'P0001';
    end if;
    update public.inventory set reserved = reserved + (v_line ->> 'quantity')::int, updated_at = now()
    where id = v_inv.id;
    insert into public.inventory_reservations (order_id, inventory_id, quantity, expires_at)
    values (v_order.id, v_inv.id, (v_line ->> 'quantity')::int, v_expires);
    insert into public.inventory_transactions (inventory_id, kind, reserved_delta, reason, actor_id, order_id)
    values (v_inv.id, 'reservation', (v_line ->> 'quantity')::int, 'checkout', v_uid, v_order.id);
    insert into public.order_items (
      order_id, variant_id, product_id, name_snapshot, variant_snapshot, sku_snapshot, image_snapshot,
      unit_price_kobo, quantity, line_total_kobo
    ) values (
      v_order.id, (v_line ->> 'variant_id')::uuid, (v_line ->> 'product_id')::uuid, v_line ->> 'name',
      v_line ->> 'variant', v_line ->> 'sku', v_line ->> 'image',
      (v_line ->> 'unit_price_kobo')::bigint, (v_line ->> 'quantity')::int, (v_line ->> 'line_total_kobo')::bigint
    );
  end loop;

  return v_order;
end $$;
revoke all on function public.create_order(uuid, public.fulfilment_method, text, text, jsonb, text) from public, anon;
grant execute on function public.create_order(uuid, public.fulfilment_method, text, text, jsonb, text) to authenticated;

-- Customer or staff cancellation of an unpaid order.
create or replace function public.cancel_unpaid_order(p_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_o public.orders;
begin
  select * into v_o from public.orders where id = p_order for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if v_o.user_id is distinct from (select auth.uid()) and not public.has_permission('orders.update', v_o.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_o.status <> 'placed' or v_o.paid_at is not null then
    raise exception 'order_not_cancellable' using errcode = 'P0001';
  end if;
  perform private.release_order_stock(v_o.id);
  update public.orders set status = 'cancelled' where id = v_o.id;
end $$;
revoke all on function public.cancel_unpaid_order(uuid) from public, anon;
grant execute on function public.cancel_unpaid_order(uuid) to authenticated;

-- Staff fulfilment updates (status, tracking). Requires orders.update for the order's branch.
create or replace function public.update_order_fulfilment(
  p_order uuid, p_status public.order_status, p_note text default null,
  p_tracking text default null, p_carrier text default null, p_eta date default null
)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare
  v_o public.orders;
begin
  select * into v_o from public.orders where id = p_order for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0001'; end if;
  if not public.has_permission('orders.update', v_o.branch_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status = 'payment_confirmed' then
    raise exception 'payment_status_is_system_managed' using errcode = '42501';
  end if;
  if p_status is distinct from v_o.status then
    update public.orders set status = p_status where id = p_order;
    update public.order_status_history set note = p_note
    where id = (select max(id) from public.order_status_history where order_id = p_order);
    if p_status = 'cancelled' then perform private.release_order_stock(p_order); end if;
  end if;
  update public.orders
  set tracking_number = coalesce(p_tracking, tracking_number),
      carrier = coalesce(p_carrier, carrier),
      estimated_delivery = coalesce(p_eta, estimated_delivery)
  where id = p_order returning * into v_o;
  return v_o;
end $$;
revoke all on function public.update_order_fulfilment(uuid, public.order_status, text, text, text, date) from public, anon;
grant execute on function public.update_order_fulfilment(uuid, public.order_status, text, text, text, date) to authenticated;

-- Scheduled job: release stock held by abandoned checkouts. Idempotent.
create or replace function public.expire_stale_orders()
returns int language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select id from public.orders
    where status = 'placed' and paid_at is null and reservation_expires_at <= now()
    for update skip locked
  loop
    perform private.release_order_stock(r.id);
    update public.orders set status = 'cancelled' where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.expire_stale_orders() from public, anon, authenticated;
grant execute on function public.expire_stale_orders() to service_role;

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  amount_kobo bigint not null,
  created_at timestamptz not null default now(),
  unique (coupon_id, order_id)
);
create index coupon_redemptions_user_idx on public.coupon_redemptions (coupon_id, user_id);
