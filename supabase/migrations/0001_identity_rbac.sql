-- 0001: extensions, shared helpers, customer profiles and role-based access control.
create extension if not exists btree_gist;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user). Roles are NOT stored here to prevent self-escalation.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  phone text,
  avatar_url text,
  preferred_branch_id uuid,
  tour_completed boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;
  insert into public.notification_preferences (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RBAC
-- ---------------------------------------------------------------------------
create table public.permissions (
  key text primary key,
  description text not null default ''
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text not null default '',
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_id, permission_key)
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  branch_id uuid, -- null = global scope; FK added once branches exist
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index user_roles_unique_scope
  on public.user_roles (user_id, role_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index user_roles_user_idx on public.user_roles (user_id);

-- Permission check used by RLS policies and privileged functions.
-- A branch-scoped grant only satisfies checks for that branch; a global grant satisfies every check.
create or replace function public.has_permission(p_permission text, p_branch uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid())
      and (ur.branch_id is null or ur.branch_id = p_branch)
      and (
        r.key = 'super_admin'
        or exists (
          select 1 from public.role_permissions rp
          where rp.role_id = ur.role_id and rp.permission_key = p_permission
        )
      )
  );
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = (select auth.uid()));
$$;

-- Prevent privilege escalation: only a super admin may touch super_admin / owner grants,
-- and nobody may change their own roles. Direct SQL (auth.uid() is null) is the bootstrap path.
create or replace function public.guard_user_roles()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_role_key text;
  v_caller uuid := (select auth.uid());
  v_target uuid;
begin
  if v_caller is null then
    return coalesce(new, old);
  end if;
  select key into v_role_key from public.roles where id = coalesce(new.role_id, old.role_id);
  v_target := coalesce(new.user_id, old.user_id);
  if v_target = v_caller then
    raise exception 'You cannot change your own roles' using errcode = '42501';
  end if;
  if v_role_key in ('super_admin', 'business_owner')
     and not exists (
       select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
       where ur.user_id = v_caller and r.key = 'super_admin'
     ) then
    raise exception 'Only a super admin can manage this role' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.granted_by := v_caller;
  end if;
  return coalesce(new, old);
end $$;

create trigger user_roles_guard before insert or update or delete on public.user_roles
  for each row execute function public.guard_user_roles();

-- Roles/permissions themselves are only editable by principals with roles.manage.
create or replace function public.guard_role_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not public.has_permission('roles.manage') then
    raise exception 'roles.manage permission required' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
create trigger role_permissions_guard before insert or update or delete on public.role_permissions
  for each row execute function public.guard_role_changes();

-- First Super Admin: run manually from the SQL editor (never exposed through the API).
create or replace function public.bootstrap_super_admin(p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_role uuid;
begin
  if (select auth.uid()) is not null then
    raise exception 'bootstrap_super_admin can only run from a privileged SQL session';
  end if;
  select id into v_role from public.roles where key = 'super_admin';
  if exists (select 1 from public.user_roles where role_id = v_role) then
    raise exception 'A super admin already exists';
  end if;
  select id into v_user from auth.users where lower(email) = lower(p_email);
  if v_user is null then
    raise exception 'No auth user with email %', p_email;
  end if;
  insert into public.user_roles (user_id, role_id) values (v_user, v_role);
end $$;
revoke all on function public.bootstrap_super_admin(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  action text not null,
  table_name text not null,
  record_id text,
  before_data jsonb,
  after_data jsonb
);
create index audit_logs_table_idx on public.audit_logs (table_name, occurred_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, occurred_at desc);

create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_id text;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_before := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_after := to_jsonb(new); end if;
  v_id := coalesce(v_after ->> 'id', v_before ->> 'id', v_after ->> 'key', v_before ->> 'key');
  insert into public.audit_logs (actor_id, action, table_name, record_id, before_data, after_data)
  values ((select auth.uid()), tg_op, tg_table_name, v_id, v_before, v_after);
  return coalesce(new, old);
end $$;

create or replace function public.audit_logs_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_logs is append-only' using errcode = '42501';
end $$;
create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();

create trigger audit_user_roles after insert or update or delete on public.user_roles
  for each row execute function public.audit_trigger();
create trigger audit_role_permissions after insert or update or delete on public.role_permissions
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- System seed: permissions, roles and the default matrix (editable by roles.manage)
-- ---------------------------------------------------------------------------
insert into public.permissions (key) values
  ('bookings.view'), ('bookings.create'), ('bookings.update'), ('bookings.cancel'),
  ('customers.view'), ('customers.manage'),
  ('payments.view'), ('refunds.create'),
  ('products.view'), ('products.create'), ('products.update'), ('products.delete'),
  ('treatments.manage'), ('categories.manage'),
  ('inventory.view'), ('inventory.adjust'),
  ('orders.view'), ('orders.update'),
  ('staff.manage'), ('branches.manage'),
  ('packages.manage'), ('memberships.manage'), ('coupons.manage'),
  ('reviews.moderate'), ('banners.manage'), ('content.manage'),
  ('notifications.send'), ('support.manage'),
  ('users.manage'), ('roles.manage'), ('settings.manage'),
  ('reports.view'), ('audit.view');

insert into public.roles (key, name, description, is_system) values
  ('super_admin', 'Super Admin', 'Unrestricted access, including role management.', true),
  ('business_owner', 'Business Owner', 'Full business operations except editing role definitions.', true),
  ('branch_manager', 'Branch Manager', 'Runs bookings, orders and stock for assigned branches.', true),
  ('booking_manager', 'Booking Manager', 'Manages appointments and customers.', true),
  ('store_manager', 'Store Manager', 'Manages products, orders and promotions.', true),
  ('inventory_manager', 'Inventory Manager', 'Adjusts and transfers stock.', true),
  ('finance_manager', 'Finance Manager', 'Views payments, issues refunds, reads reports.', true),
  ('customer_support', 'Customer Support', 'Assists customers with bookings and orders.', true),
  ('content_manager', 'Content Manager', 'Manages banners, content and catalogue copy.', true);

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r cross join public.permissions p
where r.key in ('super_admin') or (r.key = 'business_owner' and p.key <> 'roles.manage');

insert into public.role_permissions (role_id, permission_key)
select r.id, m.perm from public.roles r
join (values
  ('branch_manager', 'bookings.view'), ('branch_manager', 'bookings.create'), ('branch_manager', 'bookings.update'),
  ('branch_manager', 'bookings.cancel'), ('branch_manager', 'customers.view'), ('branch_manager', 'orders.view'),
  ('branch_manager', 'orders.update'), ('branch_manager', 'inventory.view'), ('branch_manager', 'inventory.adjust'),
  ('branch_manager', 'staff.manage'), ('branch_manager', 'reports.view'), ('branch_manager', 'reviews.moderate'),
  ('branch_manager', 'support.manage'),
  ('booking_manager', 'bookings.view'), ('booking_manager', 'bookings.create'), ('booking_manager', 'bookings.update'),
  ('booking_manager', 'bookings.cancel'), ('booking_manager', 'customers.view'),
  ('store_manager', 'products.view'), ('store_manager', 'products.create'), ('store_manager', 'products.update'),
  ('store_manager', 'orders.view'), ('store_manager', 'orders.update'), ('store_manager', 'inventory.view'),
  ('store_manager', 'coupons.manage'), ('store_manager', 'reviews.moderate'),
  ('inventory_manager', 'products.view'), ('inventory_manager', 'inventory.view'), ('inventory_manager', 'inventory.adjust'),
  ('finance_manager', 'payments.view'), ('finance_manager', 'refunds.create'), ('finance_manager', 'reports.view'),
  ('finance_manager', 'orders.view'), ('finance_manager', 'bookings.view'), ('finance_manager', 'audit.view'),
  ('customer_support', 'bookings.view'), ('customer_support', 'bookings.update'), ('customer_support', 'customers.view'),
  ('customer_support', 'orders.view'), ('customer_support', 'support.manage'), ('customer_support', 'notifications.send'),
  ('content_manager', 'content.manage'), ('content_manager', 'banners.manage'), ('content_manager', 'notifications.send'),
  ('content_manager', 'treatments.manage'), ('content_manager', 'categories.manage'), ('content_manager', 'products.view')
) as m (role_key, perm) on m.role_key = r.key;
