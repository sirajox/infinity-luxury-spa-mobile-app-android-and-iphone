-- 0014: catalogue statistics for list screens (treatment counts and "from" prices).
-- security_invoker views inherit RLS, so guests only ever count active, published treatments.

create view public.service_category_stats with (security_invoker = true) as
  select category_id, count(*)::int as treatment_count, min(price_kobo) as from_price_kobo
  from public.services where is_active group by category_id;

create view public.service_subcategory_stats with (security_invoker = true) as
  select subcategory_id, count(*)::int as treatment_count, min(price_kobo) as from_price_kobo
  from public.services where is_active and subcategory_id is not null group by subcategory_id;

grant select on public.service_category_stats, public.service_subcategory_stats to anon, authenticated;
