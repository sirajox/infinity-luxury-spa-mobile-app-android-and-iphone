-- 0002: branches, opening hours, staff, schedules and global settings.

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  is_main boolean not null default false,
  address_line text not null,
  area text,
  city text not null,
  state text not null,
  phone text,
  whatsapp text,
  email text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  timezone text not null default 'Africa/Lagos',
  is_active boolean not null default true,
  -- Opening hours are seeded as an unverified default; the owner must confirm before bookings go live.
  hours_verified boolean not null default false,
  bookings_enabled boolean not null default false,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger branches_updated_at before update on public.branches
  for each row execute function public.set_updated_at();
create trigger audit_branches after insert or update or delete on public.branches
  for each row execute function public.audit_trigger();

alter table public.profiles
  add constraint profiles_preferred_branch_fk foreign key (preferred_branch_id) references public.branches (id) on delete set null;
alter table public.user_roles
  add constraint user_roles_branch_fk foreign key (branch_id) references public.branches (id) on delete cascade;

create table public.branch_hours (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0 = Sunday
  opens time not null,
  closes time not null,
  is_closed boolean not null default false,
  unique (branch_id, day_of_week),
  check (closes > opens)
);

create table public.branch_holidays (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches (id) on delete cascade, -- null = every branch
  on_date date not null,
  name text not null,
  created_at timestamptz not null default now()
);
create index branch_holidays_date_idx on public.branch_holidays (on_date, branch_id);

-- Branch ids on which the caller holds a permission (global grant => all branches).
create or replace function public.permitted_branches(p_permission text)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select b.id from public.branches b where public.has_permission(p_permission, b.id);
$$;

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null, -- staff login mapping, optional
  full_name text not null,
  photo_url text,
  job_title text not null,
  bio text,
  specialties text[] not null default '{}',
  phone text,
  whatsapp text,
  is_active boolean not null default true,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger staff_updated_at before update on public.staff
  for each row execute function public.set_updated_at();

create table public.staff_branches (
  staff_id uuid not null references public.staff (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  primary key (staff_id, branch_id)
);

create table public.staff_working_hours (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  starts time not null,
  ends time not null,
  check (ends > starts),
  unique (staff_id, branch_id, day_of_week, starts)
);
create index staff_working_hours_lookup on public.staff_working_hours (branch_id, day_of_week, staff_id);

create table public.staff_breaks (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,
  day_of_week smallint check (day_of_week between 0 and 6), -- null = every day
  starts time not null,
  ends time not null,
  label text,
  check (ends > starts)
);

create table public.staff_leave (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text,
  check (ends_on >= starts_on)
);
create index staff_leave_lookup on public.staff_leave (staff_id, starts_on, ends_on);

-- ---------------------------------------------------------------------------
-- Settings (key/value). Public settings are readable by the apps; the rest by staff only.
-- ---------------------------------------------------------------------------
create table public.settings (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default false,
  description text not null default '',
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create or replace function public.settings_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end $$;
create trigger settings_touch before insert or update on public.settings
  for each row execute function public.settings_touch();
create trigger audit_settings after insert or update or delete on public.settings
  for each row execute function public.audit_trigger();

create or replace function public.setting_int(p_key text, p_default int)
returns int language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::int from public.settings where key = p_key), p_default);
$$;

insert into public.settings (key, value, is_public, description) values
  ('business.profile', '{"name":"Infinity Luxury Spa & Aesthetics","legal_name":"Infinity Luxury Spa & Aesthetics Limited","tagline":"Where Endless Beauty Begins","established":2009,"support_email":null}', true, 'Brand details shown in the apps.'),
  ('social.links', '{"instagram":"@infinityluxuryspa","facebook":"@infinityluxuryspa","tiktok":"@infinityluxuryspa","youtube":"@infinityluxuryspa"}', true, 'Social profiles.'),
  ('booking.min_notice_hours', '2', true, 'Minimum hours of notice for a new booking.'),
  ('booking.max_window_days', '60', true, 'How far ahead customers may book.'),
  ('booking.slot_step_minutes', '30', true, 'Interval between offered start times.'),
  ('booking.hold_minutes', '10', true, 'How long a pending booking holds its slot awaiting payment.'),
  ('booking.advance_bps', '3333', true, 'UNVERIFIED default: advance payment as basis points of the price (3333 = 33.33%).'),
  ('booking.cancel_free_hours', '24', true, 'Customers may cancel free of charge until this many hours before the start.'),
  ('booking.reschedule_min_hours', '12', true, 'Customers may reschedule until this many hours before the start.'),
  ('payments.providers', '["paystack"]', true, 'Enabled payment providers, in display order.'),
  ('inventory.reservation_minutes', '30', false, 'How long checkout stock reservations are held.'),
  ('maintenance', '{"enabled":false,"message":"We are performing scheduled maintenance. Please check back shortly."}', true, 'Customer-app maintenance mode.');

-- ---------------------------------------------------------------------------
-- Branch seed (contact details supplied by the business). Hours are an UNVERIFIED default and
-- bookings stay disabled until the owner confirms hours (set bookings_enabled in the admin).
-- ---------------------------------------------------------------------------
insert into public.branches (slug, name, is_main, address_line, area, city, state, phone, whatsapp, display_order) values
  ('abuja', 'Abuja', true, 'Shop B14, First Floor, Poly Plaza, Adetokunbo Ademola Crescent', 'Wuse 2', 'Abuja', 'FCT', '08069146781', '08069146781', 1),
  ('kano', 'Kano', false, 'After Cairo School, opposite UDB Road', 'Nasara GRA', 'Kano', 'Kano', '08033357610', null, 2),
  ('kaduna', 'Kaduna', false, 'No. 34 Al-Halal Plaza, Waff Road, behind Murtala Square, opposite Hamdala Hotel', null, 'Kaduna', 'Kaduna', '08033197942', null, 3),
  ('sokoto', 'Sokoto', false, 'Low-Cost Bayan Binji Pharmacy, Gwiwa Low-Cost', 'Gwiwa', 'Sokoto', 'Sokoto', '07043333112', null, 4);

insert into public.branch_hours (branch_id, day_of_week, opens, closes)
select b.id, d, time '09:00', time '19:00' from public.branches b cross join generate_series(0, 6) d;
