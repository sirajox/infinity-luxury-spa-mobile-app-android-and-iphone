-- 0004: appointment bookings, authoritative availability, race-safe creation.
--
-- Slot holds are modelled as `pending` bookings with `hold_expires_at`. A hold blocks the slot via the
-- same exclusion constraint as a confirmed booking, so two customers can never hold or book the same
-- staff member at overlapping times. Expired holds are released by expire_stale_bookings() (scheduled)
-- and opportunistically inside create_booking().

create type public.booking_status as enum (
  'pending', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show', 'expired'
);
create type public.payment_option as enum ('full', 'advance');

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid references auth.users (id) on delete set null,
  service_id uuid not null references public.services (id) on delete restrict,
  branch_id uuid not null references public.branches (id) on delete restrict,
  staff_id uuid not null references public.staff (id) on delete restrict,
  status public.booking_status not null default 'pending',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  buffer_minutes int not null default 0,
  blocks_until timestamptz not null,
  -- immutable price snapshot (kobo)
  service_name text not null,
  total_kobo bigint not null check (total_kobo >= 0),
  payment_option public.payment_option not null default 'full',
  due_now_kobo bigint not null check (due_now_kobo >= 0),
  paid_kobo bigint not null default 0 check (paid_kobo >= 0),
  hold_expires_at timestamptz,
  notes text,
  cancelled_at timestamptz,
  cancellation_reason text,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (blocks_until >= ends_at),
  check (paid_kobo <= total_kobo)
);
create index bookings_user_idx on public.bookings (user_id, starts_at desc);
create index bookings_branch_idx on public.bookings (branch_id, starts_at);
create index bookings_staff_idx on public.bookings (staff_id, starts_at);
create index bookings_status_idx on public.bookings (status, starts_at);
create index bookings_hold_idx on public.bookings (hold_expires_at) where status = 'pending';

-- The double-booking guard: no overlapping active bookings (incl. buffer) for one staff member.
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    staff_id with =,
    tstzrange(starts_at, blocks_until) with &&
  ) where (status in ('pending', 'confirmed', 'checked_in', 'in_progress'));

create trigger bookings_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();

create table public.booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  service_id uuid references public.services (id) on delete set null,
  name_snapshot text not null,
  price_kobo bigint not null check (price_kobo >= 0),
  duration_minutes int not null
);
create index booking_items_booking_idx on public.booking_items (booking_id);

create table public.booking_status_history (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  from_status public.booking_status,
  to_status public.booking_status not null,
  changed_by uuid,
  note text,
  created_at timestamptz not null default now()
);
create index booking_status_history_booking_idx on public.booking_status_history (booking_id, created_at);

-- Allowed lifecycle transitions (mirrors BOOKING_TRANSITIONS in @infinity/core).
create or replace function public.booking_transition_allowed(p_from public.booking_status, p_to public.booking_status)
returns boolean language sql immutable as $$
  select case p_from
    when 'pending' then p_to in ('confirmed', 'cancelled', 'expired')
    when 'confirmed' then p_to in ('checked_in', 'cancelled', 'no_show')
    when 'checked_in' then p_to in ('in_progress', 'cancelled')
    when 'in_progress' then p_to in ('completed')
    -- A verified payment that lands after the hold lapsed may revive the booking if the slot is still free.
    when 'expired' then p_to in ('confirmed')
    else false
  end;
$$;

create or replace function public.bookings_track_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.booking_status_history (booking_id, from_status, to_status, changed_by)
    values (new.id, null, new.status, (select auth.uid()));
  elsif new.status is distinct from old.status then
    if not public.booking_transition_allowed(old.status, new.status) then
      raise exception 'invalid_booking_transition: % -> %', old.status, new.status using errcode = 'P0001';
    end if;
    insert into public.booking_status_history (booking_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, (select auth.uid()));
  end if;
  return new;
end $$;
create trigger bookings_track_status_ins after insert on public.bookings
  for each row execute function public.bookings_track_status();
create trigger bookings_track_status_upd before update of status on public.bookings
  for each row execute function public.bookings_track_status();
create trigger audit_bookings after update or delete on public.bookings
  for each row execute function public.audit_trigger();

-- Prevent history rows from being tampered with by anyone with table access.
create or replace function public.booking_history_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'booking_status_history is append-only' using errcode = '42501';
end $$;
create trigger booking_status_history_no_change before update or delete on public.booking_status_history
  for each row execute function public.booking_history_immutable();

-- Secure, collision-checked booking reference, e.g. BK-7F3A91C2.
create or replace function public.generate_booking_reference()
returns text language plpgsql volatile as $$
declare
  v_ref text;
begin
  loop
    v_ref := 'BK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.bookings where reference = v_ref);
  end loop;
  return v_ref;
end $$;

-- ---------------------------------------------------------------------------
-- Availability (authoritative). Callable by guests; reads other customers' bookings only as occupancy.
-- ---------------------------------------------------------------------------
create or replace function public.get_available_slots(
  p_service uuid,
  p_branch uuid,
  p_staff uuid,
  p_date date,
  p_exclude_booking uuid default null
)
returns table (slot_time time, slot_staff_id uuid, slot_starts_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text;
  v_enabled boolean;
  v_dur int;
  v_buf int;
  v_dow smallint;
  v_step int := public.setting_int('booking.slot_step_minutes', 30);
  v_notice int := public.setting_int('booking.min_notice_hours', 2);
  v_window int := public.setting_int('booking.max_window_days', 60);
  v_open time;
  v_close time;
  v_today date;
begin
  select b.timezone, b.bookings_enabled into v_tz, v_enabled
  from public.branches b where b.id = p_branch and b.is_active;
  if v_tz is null or not v_enabled then return; end if;

  select s.duration_minutes, s.buffer_minutes into v_dur, v_buf
  from public.services s
  join public.service_branches sb on sb.service_id = s.id and sb.branch_id = p_branch
  where s.id = p_service and s.is_active and s.price_type <> 'quote';
  if v_dur is null then return; end if;

  v_today := (now() at time zone v_tz)::date;
  if p_date < v_today or p_date > v_today + v_window then return; end if;
  if exists (
    select 1 from public.branch_holidays h
    where h.on_date = p_date and (h.branch_id is null or h.branch_id = p_branch)
  ) then return; end if;

  v_dow := extract(dow from p_date)::smallint;
  select bh.opens, bh.closes into v_open, v_close
  from public.branch_hours bh
  where bh.branch_id = p_branch and bh.day_of_week = v_dow and not bh.is_closed;
  if v_open is null then return; end if;

  return query
  with eligible as (
    select st.id as sid
    from public.staff st
    join public.staff_branches sbr on sbr.staff_id = st.id and sbr.branch_id = p_branch
    join public.staff_services ss on ss.staff_id = st.id and ss.service_id = p_service
    where st.is_active and (p_staff is null or st.id = p_staff)
  ),
  candidates as (
    select e.sid, g.t
    from eligible e
    join public.staff_working_hours wh
      on wh.staff_id = e.sid and wh.branch_id = p_branch and wh.day_of_week = v_dow
    cross join lateral generate_series(
      (p_date + greatest(wh.starts, v_open))::timestamp,
      (p_date + least(wh.ends, v_close))::timestamp - make_interval(mins => v_dur),
      make_interval(mins => v_step)
    ) as g (t)
  )
  select c.t::time, c.sid, (c.t at time zone v_tz)
  from candidates c
  where (c.t at time zone v_tz) >= now() + make_interval(hours => v_notice)
    and not exists (
      select 1 from public.staff_leave l
      where l.staff_id = c.sid and p_date between l.starts_on and l.ends_on
    )
    and not exists (
      select 1 from public.staff_breaks br
      where br.staff_id = c.sid
        and (br.day_of_week is null or br.day_of_week = v_dow)
        and c.t < (p_date + br.ends)::timestamp
        and (c.t + make_interval(mins => v_dur)) > (p_date + br.starts)::timestamp
    )
    and not exists (
      select 1 from public.bookings bk
      where bk.staff_id = c.sid
        and bk.id is distinct from p_exclude_booking
        and bk.status in ('pending', 'confirmed', 'checked_in', 'in_progress')
        and (bk.status <> 'pending' or bk.hold_expires_at > now())
        and tstzrange(bk.starts_at, bk.blocks_until) &&
            tstzrange(
              (c.t at time zone v_tz),
              (c.t at time zone v_tz) + make_interval(mins => v_dur + v_buf)
            )
    )
  order by 1, 2;
end $$;
grant execute on function public.get_available_slots(uuid, uuid, uuid, date, uuid) to anon, authenticated;

-- Calendar density for the month view: how many bookable start times each day has.
create or replace function public.get_available_days(
  p_service uuid, p_branch uuid, p_staff uuid, p_from date, p_to date
)
returns table (day date, slot_count int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_to - p_from > 62 then
    raise exception 'range_too_large' using errcode = 'P0001';
  end if;
  return query
  select d::date, (
    select count(distinct s.slot_time)::int
    from public.get_available_slots(p_service, p_branch, p_staff, d::date) s
  )
  from generate_series(p_from, p_to, interval '1 day') d;
end $$;
grant execute on function public.get_available_days(uuid, uuid, uuid, date, date) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Booking creation (the only supported way for customers to create a booking)
-- ---------------------------------------------------------------------------
create or replace function public.create_booking(
  p_service uuid,
  p_branch uuid,
  p_staff uuid,
  p_date date,
  p_time time,
  p_payment_option public.payment_option
)
returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_service public.services;
  v_tz text;
  v_staff uuid;
  v_start timestamptz;
  v_total bigint;
  v_due bigint;
  v_bps int := public.setting_int('booking.advance_bps', 3333);
  v_hold int := public.setting_int('booking.hold_minutes', 10);
  v_booking public.bookings;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select * into v_service from public.services where id = p_service and is_active;
  if not found then raise exception 'service_unavailable' using errcode = 'P0001'; end if;
  if v_service.price_type = 'quote' or v_service.price_kobo is null then
    raise exception 'quote_required' using errcode = 'P0001';
  end if;
  select timezone into v_tz from public.branches where id = p_branch and is_active and bookings_enabled;
  if v_tz is null then raise exception 'branch_unavailable' using errcode = 'P0001'; end if;

  -- Release this branch's lapsed holds so they do not block the exclusion constraint.
  update public.bookings set status = 'expired'
  where status = 'pending' and hold_expires_at <= now() and branch_id = p_branch;

  -- Pick the slot server-side; "any staff" resolves to the least-loaded eligible specialist that day.
  select s.slot_staff_id, s.slot_starts_at into v_staff, v_start
  from public.get_available_slots(p_service, p_branch, p_staff, p_date) s
  where s.slot_time = p_time
  order by (
    select count(*) from public.bookings b
    where b.staff_id = s.slot_staff_id
      and b.status in ('pending', 'confirmed', 'checked_in', 'in_progress')
      and (b.starts_at at time zone v_tz)::date = p_date
  ), s.slot_staff_id
  limit 1;
  if v_staff is null then raise exception 'slot_unavailable' using errcode = 'P0001'; end if;

  v_total := v_service.price_kobo;
  v_due := case when p_payment_option = 'full' then v_total
                else least(v_total, (v_total * v_bps + 5000) / 10000) end;

  begin
    insert into public.bookings (
      reference, user_id, service_id, branch_id, staff_id, status, starts_at, ends_at, buffer_minutes,
      blocks_until, service_name, total_kobo, payment_option, due_now_kobo, hold_expires_at
    ) values (
      public.generate_booking_reference(), v_uid, p_service, p_branch, v_staff, 'pending', v_start,
      v_start + make_interval(mins => v_service.duration_minutes), v_service.buffer_minutes,
      v_start + make_interval(mins => v_service.duration_minutes + v_service.buffer_minutes),
      v_service.name, v_total, p_payment_option, v_due, now() + make_interval(mins => v_hold)
    ) returning * into v_booking;
  exception when exclusion_violation then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end;

  insert into public.booking_items (booking_id, service_id, name_snapshot, price_kobo, duration_minutes)
  values (v_booking.id, p_service, v_service.name, v_total, v_service.duration_minutes);

  return v_booking;
end $$;
revoke all on function public.create_booking(uuid, uuid, uuid, date, time, public.payment_option) from public, anon;
grant execute on function public.create_booking(uuid, uuid, uuid, date, time, public.payment_option) to authenticated;

-- Reschedule within policy. Staff with bookings.update may bypass the customer notice window.
create or replace function public.reschedule_booking(p_booking uuid, p_date date, p_time time)
returns public.bookings
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_b public.bookings;
  v_tz text;
  v_staff uuid;
  v_start timestamptz;
  v_dur int;
  v_privileged boolean;
  v_min_hours int := public.setting_int('booking.reschedule_min_hours', 12);
begin
  if v_uid is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  select * into v_b from public.bookings where id = p_booking for update;
  if not found then raise exception 'booking_not_found' using errcode = 'P0001'; end if;
  v_privileged := public.has_permission('bookings.update', v_b.branch_id);
  if v_b.user_id is distinct from v_uid and not v_privileged then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_b.status not in ('pending', 'confirmed') then
    raise exception 'booking_not_reschedulable' using errcode = 'P0001';
  end if;
  if not v_privileged and v_b.starts_at - now() < make_interval(hours => v_min_hours) then
    raise exception 'reschedule_window_closed' using errcode = 'P0001';
  end if;

  select timezone into v_tz from public.branches where id = v_b.branch_id;
  select s.slot_staff_id, s.slot_starts_at into v_staff, v_start
  from public.get_available_slots(v_b.service_id, v_b.branch_id, v_b.staff_id, p_date, v_b.id) s
  where s.slot_time = p_time
  limit 1;
  -- Prefer the same specialist; fall back to any eligible one only for "any staff" style bookings.
  if v_staff is null then raise exception 'slot_unavailable' using errcode = 'P0001'; end if;

  v_dur := (select duration_minutes from public.services where id = v_b.service_id);
  begin
    update public.bookings
    set starts_at = v_start,
        ends_at = v_start + make_interval(mins => v_dur),
        blocks_until = v_start + make_interval(mins => v_dur + v_b.buffer_minutes),
        staff_id = v_staff,
        reminder_sent_at = null
    where id = v_b.id
    returning * into v_b;
  exception when exclusion_violation then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end;
  return v_b;
end $$;
revoke all on function public.reschedule_booking(uuid, date, time) from public, anon;
grant execute on function public.reschedule_booking(uuid, date, time) to authenticated;

-- Scheduled job: release lapsed holds. Idempotent.
create or replace function public.expire_stale_bookings()
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_count int;
begin
  with expired as (
    update public.bookings set status = 'expired'
    where status = 'pending' and hold_expires_at <= now()
    returning 1
  )
  select count(*) into v_count from expired;
  return v_count;
end $$;
revoke all on function public.expire_stale_bookings() from public, anon, authenticated;
grant execute on function public.expire_stale_bookings() to service_role;
