-- 0017: daily revenue/activity series for dashboard charts and CSV reports.
-- Same branch-scoping rules as dashboard_summary(): only branches where the caller holds reports.view.

create or replace function public.revenue_by_day(p_from timestamptz, p_to timestamptz, p_branch uuid default null)
returns table (day date, revenue_kobo bigint, bookings int, orders int)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_branches uuid[];
  v_tz text := 'Africa/Lagos';
begin
  if p_to - p_from > interval '400 days' then
    raise exception 'range_too_large' using errcode = 'P0001';
  end if;
  if p_branch is not null then
    if not public.has_permission('reports.view', p_branch) then raise exception 'forbidden' using errcode = '42501'; end if;
    v_branches := array[p_branch];
  else
    v_branches := array(select public.permitted_branches('reports.view'));
    if cardinality(v_branches) = 0 then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;

  return query
  with days as (
    select d::date as day from generate_series((p_from at time zone v_tz)::date, (p_to at time zone v_tz)::date, interval '1 day') d
  ),
  rev as (
    select (p.paid_at at time zone v_tz)::date as day, sum(p.amount_kobo)::bigint as amount
    from public.payments p
    left join public.bookings b on b.id = p.booking_id
    left join public.orders o on o.id = p.order_id
    where p.status in ('succeeded', 'partially_refunded') and p.paid_at between p_from and p_to
      and coalesce(b.branch_id, o.branch_id) = any (v_branches)
    group by 1
  ),
  bk as (
    select (created_at at time zone v_tz)::date as day, count(*)::int as n
    from public.bookings
    where branch_id = any (v_branches) and created_at between p_from and p_to and status not in ('expired', 'cancelled')
    group by 1
  ),
  od as (
    select (created_at at time zone v_tz)::date as day, count(*)::int as n
    from public.orders
    where branch_id = any (v_branches) and created_at between p_from and p_to and status not in ('cancelled')
    group by 1
  )
  select d.day, coalesce(rev.amount, 0), coalesce(bk.n, 0), coalesce(od.n, 0)
  from days d left join rev on rev.day = d.day left join bk on bk.day = d.day left join od on od.day = d.day
  order by d.day;
end $$;
revoke all on function public.revenue_by_day(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.revenue_by_day(timestamptz, timestamptz, uuid) to authenticated;
