-- 0012: scheduled maintenance via pg_cron (when available). All jobs are idempotent and safe to retry.
-- The notification dispatcher is an Edge Function; schedule it with pg_net as described in docs/deployment.md
-- because it needs a project URL and secret that must not live in a migration.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('release-expired-booking-holds', '* * * * *', 'select public.expire_stale_bookings()');
    perform cron.schedule('release-expired-order-stock', '*/5 * * * *', 'select public.expire_stale_orders()');
    perform cron.schedule('abandon-stale-payments', '*/15 * * * *', 'select public.expire_abandoned_payments()');
    perform cron.schedule('enqueue-booking-reminders', '*/15 * * * *', 'select public.enqueue_booking_reminders()');
    perform cron.schedule('expire-memberships', '0 1 * * *', 'select public.expire_memberships()');
  else
    raise notice 'pg_cron is not available; schedule the maintenance functions externally (see docs/deployment.md).';
  end if;
end $$;
