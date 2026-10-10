# Payments

Providers: **Paystack** (primary) and **Flutterwave** (optional). Both implement `PaymentProvider` in `supabase/functions/_shared/providers.ts` (initialize / verify / refund). Raw card data never touches the app or our servers: customers pay on the provider's hosted page.

## Flow

1. App calls `payment-init` with `{ purpose, targetId, provider }` and the user's JWT.
2. `create_payment_intent` (as the user) validates ownership and state and **computes the amount from the database** (`bookings.due_now_kobo`, `total − paid`, `orders.total_kobo`, plan/package price). A pending `payments` row with a unique reference `PAY-<32 hex>` is created; earlier pending attempts for the same target are marked abandoned.
3. The function initialises the provider (secret key from Edge secrets) and returns the checkout URL; `record_payment_initialized` stores it.
4. The app opens it with `WebBrowser.openAuthSessionAsync`. The provider redirects to `PAYMENT_CALLBACK_URL` (`<admin site>/pay/return`), which deep-links back (`infinityspa://payment-return`).
5. The app calls `payment-verify`; separately the provider sends a webhook. **Both** call `settleByVerification`: ask the provider's verify API, then `apply_payment_success`.
6. `apply_payment_success` (service role only) locks the payment, checks amount and currency, then atomically: confirms the booking (adds `paid_kobo`) / marks the order paid and consumes stock reservations, redeems the coupon and clears the cart / activates the membership or package. It is idempotent: replays return the stored result.

## Safety rules (all covered by tests)

- A client claim or callback is never trusted; only the provider's API (after signature check for webhooks).
- Amount or currency mismatch → payment marked `failed` with `amount_mismatch`; nothing is fulfilled.
- Duplicate payment, late payment after the hold lapsed with the slot taken, payment for a cancelled/expired order → payment recorded and a **refund request is queued automatically** instead of double-fulfilling.
- Webhook events are stored with `unique(provider, event_id)`; replays are acknowledged without reprocessing. If processing fails the stored event is removed so the provider's retry is processed.
- Signatures: Paystack `x-paystack-signature` (HMAC-SHA512 of the raw body, constant-time compare); Flutterwave `verif-hash` header (constant-time compare). Helpers: `_shared/signature.ts`, tested against Node's crypto.

## Refunds

Created by: customer cancellation inside the free window, staff cancellation, account deletion, duplicate/late payments, or staff (`create_refund_request`, requires `refunds.create`). Staff then **Process** (calls `process-refund` → provider refund API → `finalize_refund`) or **Decline** (`reject_refund`). Refunds are partial-aware; payment status becomes `partially_refunded`/`refunded`.

## Branch payments

Cash/POS taken in person is recorded with `record_manual_payment` (provider `manual`), limited to the outstanding balance and to staff with `bookings.update` + `payments.view` for the branch.

## Configuration

Edge Function secrets (never in apps): `PAYSTACK_SECRET_KEY`, `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_HASH`, `PAYMENT_CALLBACK_URL`. Enabled providers: Settings → Payments (`payments.providers`).

Webhook URLs to register: `https://<project>.supabase.co/functions/v1/paystack-webhook` and `.../flutterwave-webhook`.

## Test mode first

Use Paystack/Flutterwave **test keys** until the end-to-end checklist in [launch-checklist.md](launch-checklist.md) passes with real test transactions (card success, card failure, abandoned, transfer, webhook replay, refund). The repository tests exercise the settlement logic and signature code with controlled inputs; they do not call the live providers, so **live payment integration is unverified until keys exist**.
