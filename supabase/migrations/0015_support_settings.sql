-- 0015: optional public settings read by the mobile app. Null means "not configured": the app hides the feature.

insert into public.settings (key, value, is_public, description) values
  ('consultation.fee_kobo', 'null', true, 'Consultation fee in kobo shown on treatment lists. Leave null to hide the consultation note.'),
  ('support.contact', '{"email": null, "whatsapp_branch": "abuja"}', true, 'Support email (null hides "Email us") and the branch slug whose WhatsApp number backs "WhatsApp us".')
on conflict (key) do nothing;
