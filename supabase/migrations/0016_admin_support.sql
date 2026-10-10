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

-- Decline a queued refund (e.g. a cancellation outside the free window that staff decide not to honour).
create or replace function public.reject_refund(p_refund uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_r public.refunds;
  v_branch uuid;
begin
  select * into v_r from public.refunds where id = p_refund for update;
  if not found then raise exception 'refund_not_found' using errcode = 'P0001'; end if;
  select public.payment_branch_id(p.booking_id, p.order_id) into v_branch from public.payments p where p.id = v_r.payment_id;
  if not public.has_permission('refunds.create', v_branch) then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_r.status not in ('requested', 'failed') then raise exception 'refund_not_pending' using errcode = 'P0001'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required' using errcode = 'P0001'; end if;
  update public.refunds set status = 'rejected', failure_reason = left(p_reason, 500), processed_by = (select auth.uid()) where id = p_refund;
end $$;
revoke all on function public.reject_refund(uuid, text) from public, anon;
grant execute on function public.reject_refund(uuid, text) to authenticated;

-- Lookup used by "Add staff": finds an existing account by exact email. Only for users.manage holders,
-- returns just the id and name so it cannot be used to browse customer data.
create or replace function public.find_user_by_email(p_email text)
returns table (id uuid, full_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name from public.profiles p
  where public.has_permission('users.manage') and p.deleted_at is null and lower(p.email) = lower(trim(p_email));
$$;
revoke all on function public.find_user_by_email(text) from public, anon;
grant execute on function public.find_user_by_email(text) to authenticated;
