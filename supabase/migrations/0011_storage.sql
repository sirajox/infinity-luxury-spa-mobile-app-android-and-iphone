-- 0011: Storage buckets and object policies.
-- Public buckets hold assets intentionally published to everyone; writes are permission-gated.
-- Private buckets use owner-scoped paths: <user_id>/<file>. Clients receive signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('treatment-images', 'treatment-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('staff-portraits', 'staff-portraits', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('banners', 'banners', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('review-photos', 'review-photos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Staff-managed public buckets.
create policy "product images write" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.has_permission('products.update'));
create policy "product images update" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.has_permission('products.update'));
create policy "product images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.has_permission('products.update'));

create policy "treatment images write" on storage.objects for insert to authenticated
  with check (bucket_id = 'treatment-images' and public.has_permission('treatments.manage'));
create policy "treatment images update" on storage.objects for update to authenticated
  using (bucket_id = 'treatment-images' and public.has_permission('treatments.manage'));
create policy "treatment images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'treatment-images' and public.has_permission('treatments.manage'));

create policy "staff portraits write" on storage.objects for insert to authenticated
  with check (bucket_id = 'staff-portraits' and public.has_permission('staff.manage'));
create policy "staff portraits update" on storage.objects for update to authenticated
  using (bucket_id = 'staff-portraits' and public.has_permission('staff.manage'));
create policy "staff portraits delete" on storage.objects for delete to authenticated
  using (bucket_id = 'staff-portraits' and public.has_permission('staff.manage'));

create policy "banners write" on storage.objects for insert to authenticated
  with check (bucket_id = 'banners' and public.has_permission('banners.manage'));
create policy "banners update" on storage.objects for update to authenticated
  using (bucket_id = 'banners' and public.has_permission('banners.manage'));
create policy "banners delete" on storage.objects for delete to authenticated
  using (bucket_id = 'banners' and public.has_permission('banners.manage'));

-- Owner-scoped private buckets. The first path segment must be the caller's user id, which also
-- prevents overwriting another user's file.
create policy "avatars owner all" on storage.objects for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars staff read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.has_permission('customers.view'));

create policy "review photos owner all" on storage.objects for all to authenticated
  using (bucket_id = 'review-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'review-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "review photos moderator read" on storage.objects for select to authenticated
  using (bucket_id = 'review-photos' and public.has_permission('reviews.moderate'));
