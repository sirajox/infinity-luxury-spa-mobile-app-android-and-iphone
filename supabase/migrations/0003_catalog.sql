-- 0003: treatment catalogue. Prices are loaded from here; nothing is hard-coded in the apps.

create type public.price_type as enum ('fixed', 'from', 'quote');

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  icon text, -- icon key understood by the apps
  image_url text,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger service_categories_updated_at before update on public.service_categories
  for each row execute function public.set_updated_at();

create table public.service_subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.service_categories (id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  image_url text,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, slug)
);
create trigger service_subcategories_updated_at before update on public.service_subcategories
  for each row execute function public.set_updated_at();

create table public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category_id uuid not null references public.service_categories (id) on delete restrict,
  subcategory_id uuid references public.service_subcategories (id) on delete set null,
  name text not null,
  short_description text,
  description text,
  thumbnail_url text,
  gallery_urls text[] not null default '{}',
  duration_minutes int not null check (duration_minutes between 5 and 600),
  buffer_minutes int not null default 0 check (buffer_minutes between 0 and 240),
  price_type public.price_type not null default 'quote',
  price_kobo bigint check (price_kobo is null or price_kobo >= 0),
  currency char(3) not null default 'NGN',
  session_count int check (session_count is null or session_count > 0),
  package_info text,
  is_featured boolean not null default false,
  is_active boolean not null default true,
  display_order int not null default 0,
  search_text tsvector generated always as (
    to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(short_description, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A priced treatment needs a price; a quote-only treatment must not carry one.
  check ((price_type = 'quote' and price_kobo is null) or (price_type <> 'quote' and price_kobo is not null))
);
create index services_category_idx on public.services (category_id, display_order) where is_active;
create index services_subcategory_idx on public.services (subcategory_id, display_order) where is_active;
create index services_search_idx on public.services using gin (search_text);
create index services_featured_idx on public.services (display_order) where is_active and is_featured;
create trigger services_updated_at before update on public.services
  for each row execute function public.set_updated_at();
create trigger audit_services after insert or update or delete on public.services
  for each row execute function public.audit_trigger();

create table public.service_branches (
  service_id uuid not null references public.services (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  primary key (service_id, branch_id)
);
create index service_branches_branch_idx on public.service_branches (branch_id);

create table public.staff_services (
  staff_id uuid not null references public.staff (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  primary key (staff_id, service_id)
);
create index staff_services_service_idx on public.staff_services (service_id);

-- Category structure taken from the supplied design. Counts shown in the design are illustrative;
-- treatments and prices must be entered by the business in the admin dashboard.
insert into public.service_categories (slug, name, icon, display_order) values
  ('facials', 'Facials', 'face', 1),
  ('skin-repair', 'Skin Repair', 'drop', 2),
  ('laser-regenerative', 'Laser & Regenerative', 'sparkle', 3),
  ('body-sculpting', 'Body Sculpting', 'body', 4),
  ('iv-therapy', 'IV Therapy', 'drip', 5),
  ('massage', 'Massage', 'stones', 6),
  ('body-polish-baths', 'Body Polish & Baths', 'bath', 7),
  ('feminine-care', 'Feminine Care', 'lotus', 8);

insert into public.service_subcategories (category_id, slug, name, display_order)
select c.id, s.slug, s.name, s.ord
from public.service_categories c
join (values
  ('skin-repair', 'stretch-mark-methods', 'Stretch Mark Methods', 1),
  ('skin-repair', 'skin-tag-body-tag-removal', 'Skin Tag & Body Tag Removal', 2),
  ('skin-repair', 'pigmentation-dark-knuckles', 'Pigmentation & Dark Knuckles', 3),
  ('skin-repair', 'tribal-mark-tattoo-removal', 'Tribal Mark & Tattoo Removal', 4),
  ('skin-repair', 'acne-scar-removal', 'Acne Scar Removal', 5)
) as s (cat_slug, slug, name, ord) on s.cat_slug = c.slug;
