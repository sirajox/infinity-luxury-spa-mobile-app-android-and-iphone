-- 0016: helpers for the admin dashboard.

-- The caller's effective permissions, used only to decide which controls to show.
-- Authorisation itself is always enforced by RLS and the privileged functions, never by this list.
create or replace function public.my_permissions()
returns table (permission_key text, branch_id uuid)
language sql stable security definer set search_path = '' as $$
  select p.key, ur.branch_id
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  join public.permissions p
    on r.key = 'super_admin'
    or exists (select 1 from public.role_permissions rp where rp.role_id = r.id and rp.permission_key = p.key)
  where ur.user_id = (select auth.uid());
$$;
revoke all on function public.my_permissions() from public, anon;
grant execute on function public.my_permissions() to authenticated;

-- Record a payment taken at the branch (cash / POS transfer). Requires payments.view + bookings.update for the branch,
-- is audited through the payments table, and can never exceed the outstanding balance.
create or replace function public.record_manual_payment(p_booking uuid, p_amount_kobo bigint, p_note text)
returns public.payments
language plpgsql security definer set search_path = '' as $$
declare
  v_b public.bookings;
  v_p public.payments;
begin
  select * into v_b from public.bookings where id = p_booking for update;
  if not found then raise exception 'booking_not_found' using errcode = 'P0001'; end if;
  if not (public.has_permission('bookings.update', v_b.branch_id) and public.has_permission('payments.view', v_b.branch_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_amount_kobo <= 0 or v_b.paid_kobo + p_amount_kobo > v_b.total_kobo then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  insert into public.payments (reference, provider, purpose, user_id, booking_id, amount_kobo, status, paid_at, metadata)
  values ('MAN-' || upper(replace(gen_random_uuid()::text, '-', '')), 'manual', 'booking_balance', v_b.user_id, v_b.id,
          p_amount_kobo, 'succeeded', now(), jsonb_build_object('manual', true, 'note', left(p_note, 300), 'recorded_by', (select auth.uid())))
  returning * into v_p;
  update public.bookings set paid_kobo = paid_kobo + p_amount_kobo where id = v_b.id;
  return v_p;
end $$;
revoke all on function public.record_manual_payment(uuid, bigint, text) from public, anon;
grant execute on function public.record_manual_payment(uuid, bigint, text) to authenticated;
