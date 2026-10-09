-- 0013: atomic cart and wishlist operations (no read-modify-write races from the client).

-- Adds p_delta to a cart line (creating the cart/line as needed). Quantity is clamped to 1..99;
-- a result of 0 or less removes the line. Returns the new quantity (0 when removed).
create or replace function public.cart_add(p_variant uuid, p_delta int)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_cart uuid;
  v_qty int;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not exists (
    select 1 from public.product_variants v join public.products p on p.id = v.product_id
    where v.id = p_variant and v.is_active and p.is_active
  ) then
    raise exception 'product_unavailable' using errcode = 'P0001';
  end if;
  insert into public.carts (user_id) values (v_uid) on conflict (user_id) do nothing;
  select id into v_cart from public.carts where user_id = v_uid;
  if p_delta > 0 then
    insert into public.cart_items (cart_id, variant_id, quantity)
    values (v_cart, p_variant, least(p_delta, 99))
    on conflict (cart_id, variant_id) do update set quantity = least(public.cart_items.quantity + p_delta, 99)
    returning quantity into v_qty;
  else
    select quantity into v_qty from public.cart_items where cart_id = v_cart and variant_id = p_variant for update;
    if v_qty is null then return 0; end if;
    if v_qty + p_delta <= 0 then
      delete from public.cart_items where cart_id = v_cart and variant_id = p_variant;
      return 0;
    end if;
    update public.cart_items set quantity = v_qty + p_delta
    where cart_id = v_cart and variant_id = p_variant
    returning quantity into v_qty;
  end if;
  update public.carts set updated_at = now() where id = v_cart;
  return v_qty;
end $$;
revoke all on function public.cart_add(uuid, int) from public, anon;
grant execute on function public.cart_add(uuid, int) to authenticated;

-- Merge a guest cart ([{"variant_id": "...", "quantity": 2}, ...]) into the signed-in user's cart.
create or replace function public.cart_merge(p_items jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_cart uuid;
  r record;
  v_count int := 0;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  insert into public.carts (user_id) values (v_uid) on conflict (user_id) do nothing;
  select id into v_cart from public.carts where user_id = v_uid;
  for r in
    select (e ->> 'variant_id')::uuid as variant_id, least(greatest((e ->> 'quantity')::int, 1), 99) as quantity
    from jsonb_array_elements(p_items) e
  loop
    if exists (
      select 1 from public.product_variants v join public.products p on p.id = v.product_id
      where v.id = r.variant_id and v.is_active and p.is_active
    ) then
      insert into public.cart_items (cart_id, variant_id, quantity) values (v_cart, r.variant_id, r.quantity)
      on conflict (cart_id, variant_id) do update set quantity = least(public.cart_items.quantity + excluded.quantity, 99);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;
revoke all on function public.cart_merge(jsonb) from public, anon;
grant execute on function public.cart_merge(jsonb) to authenticated;

-- Toggle a product or treatment in the caller's wishlist. Returns true when it is now saved.
create or replace function public.toggle_wishlist(p_product uuid default null, p_service uuid default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_list uuid;
  v_deleted int;
begin
  if v_uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if (p_product is null) = (p_service is null) then
    raise exception 'exactly one of product or service is required' using errcode = 'P0001';
  end if;
  insert into public.wishlists (user_id) values (v_uid) on conflict (user_id) do nothing;
  select id into v_list from public.wishlists where user_id = v_uid;
  delete from public.wishlist_items
  where wishlist_id = v_list and product_id is not distinct from p_product and service_id is not distinct from p_service;
  get diagnostics v_deleted = row_count;
  if v_deleted > 0 then return false; end if;
  insert into public.wishlist_items (wishlist_id, product_id, service_id) values (v_list, p_product, p_service);
  return true;
end $$;
revoke all on function public.toggle_wishlist(uuid, uuid) from public, anon;
grant execute on function public.toggle_wishlist(uuid, uuid) to authenticated;
