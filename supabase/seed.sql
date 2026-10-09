-- DEVELOPMENT SEED ONLY. Never run against production.
-- Everything here is clearly marked "(Demo)" so it cannot be mistaken for real business data.

-- Enable bookings in development. In production the owner confirms hours, then enables each branch.
update public.branches set bookings_enabled = true;

insert into public.staff (id, full_name, job_title, bio, specialties) values
  ('00000000-0000-0000-0000-00000000a001', 'Demo Therapist A', 'Massage Therapist (Demo)', 'Demo profile for development.', array['Swedish', 'Deep tissue']),
  ('00000000-0000-0000-0000-00000000a002', 'Demo Therapist B', 'Spa Specialist (Demo)', 'Demo profile for development.', array['Facials']);

insert into public.staff_branches (staff_id, branch_id)
select s.id, b.id from public.staff s cross join public.branches b where b.slug = 'abuja' and s.full_name like 'Demo%';

insert into public.staff_working_hours (staff_id, branch_id, day_of_week, starts, ends)
select s.id, b.id, d, time '09:00', time '19:00'
from public.staff s cross join public.branches b cross join generate_series(0, 6) d
where b.slug = 'abuja' and s.full_name like 'Demo%';

insert into public.services (id, slug, category_id, name, short_description, duration_minutes, buffer_minutes, price_type, price_kobo, is_featured)
select '00000000-0000-0000-0000-00000000b001', 'demo-swedish-massage', c.id, 'Swedish Massage (Demo)',
       'Demo treatment for development.', 60, 15, 'fixed', 3000000, true
from public.service_categories c where c.slug = 'massage';
insert into public.services (id, slug, category_id, name, short_description, duration_minutes, price_type, price_kobo)
select '00000000-0000-0000-0000-00000000b002', 'demo-hydrafacial', c.id, 'Hydrafacial (Demo)',
       'Demo treatment for development.', 45, 'from', 2500000
from public.service_categories c where c.slug = 'facials';

insert into public.service_branches (service_id, branch_id)
select s.id, b.id from public.services s cross join public.branches b where s.slug like 'demo-%' and b.slug = 'abuja';
insert into public.staff_services (staff_id, service_id)
select st.id, s.id from public.staff st cross join public.services s where st.full_name like 'Demo%' and s.slug like 'demo-%';

insert into public.product_categories (id, slug, name, display_order) values
  ('00000000-0000-0000-0000-00000000c001', 'skincare', 'Skincare', 1),
  ('00000000-0000-0000-0000-00000000c002', 'facial-care', 'Facial Care', 2),
  ('00000000-0000-0000-0000-00000000c003', 'body-care', 'Body Care', 3),
  ('00000000-0000-0000-0000-00000000c004', 'supplements', 'Supplements', 4),
  ('00000000-0000-0000-0000-00000000c005', 'perfumes', 'Perfumes', 5),
  ('00000000-0000-0000-0000-00000000c006', 'gift-sets', 'Gift Sets', 6);

insert into public.products (id, slug, category_id, name, summary, is_best_seller) values
  ('00000000-0000-0000-0000-00000000d001', 'demo-brightening-serum', '00000000-0000-0000-0000-00000000c001', 'Brightening Face Serum (Demo)', 'Demo product for development.', true);
insert into public.product_variants (id, product_id, name, sku, price_kobo, compare_at_price_kobo) values
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000d001', '30 ml', 'DEMO-SERUM-30', 1850000, 2200000);
insert into public.inventory (branch_id, variant_id, quantity)
select b.id, '00000000-0000-0000-0000-00000000e001', 25 from public.branches b where b.slug = 'abuja';

-- Demo delivery fee so checkout can be exercised locally. Real fees are configured by the business.
insert into public.delivery_fees (state, fee_kobo, estimated_days) values ('FCT', 350000, 2);
