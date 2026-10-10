# App Store & Google Play preparation

Nothing has been submitted or published. This is the preparation guide.

## Accounts and identifiers (business to provide)

- Apple Developer Program (organisation) and Google Play Console accounts.
- Final **bundle identifier / package name** (placeholder today: `com.infinityluxuryspa.app`). Update `apps/mobile/app.config.ts`.
- App icon (current one is generated from a low-resolution crop of the logo in the design PDF: **supply the original vector/PNG logo** and regenerate `apps/mobile/assets/images/*`).
- Screenshots (6.9", 6.5", 5.5" iPhone; phone + 7"/10" tablets for Android), short and full descriptions, keywords, support URL, marketing URL, privacy policy URL (publish the Privacy Policy and expose it at a public URL, e.g. a page on the admin domain or the website).

## Platform configuration already in place

- Deep-link scheme `infinityspa://`; auth callback, password reset and payment return routes.
- iOS: Sign in with Apple enabled (required because Google sign-in is offered); calendar usage strings; `ITSAppUsesNonExemptEncryption=false` (standard HTTPS only; confirm with your counsel).
- Android: calendar permissions; adaptive icon; notification icon/colour.
- Push: Expo notifications with Android channel; token registration only after the user opts in.

## Permission explanations (store review answers)

| Permission | Why |
|---|---|
| Calendar | Adds the customer's confirmed appointment on request ("Add to Calendar") |
| Notifications | Appointment reminders, order updates, optional offers |
| Photos | Choosing a profile picture; images are resized and re-encoded before upload |
| Internet | Booking, shopping, payments |

## Privacy declarations (draft: verify with counsel)

Data collected: name, email, phone, saved addresses, order/booking history, push token, optional profile photo, crash diagnostics (Sentry, scrubbed). Purposes: app functionality, account management, support, fraud/payment processing (by Paystack/Flutterwave). Not used for tracking across apps. Users can export and delete their data in-app (Profile → Privacy & account). Financial records are retained without personal contact details as legally required. Apple "Data Linked to You" and Google "Data safety" forms must match the final analytics/crash tools you enable.

## Review-ready checklist

- [ ] Real logo/icon/splash; screenshots; descriptions.
- [ ] Policies published and linked (privacy, terms, delete-account instructions).
- [ ] Demo reviewer account (a customer with bookings) and test payment instructions in review notes; payments in the review build point at **test** keys or a clearly labelled flow.
- [ ] Account deletion works in-app (required by both stores).
- [ ] Sign in with Apple works on a real device.
- [ ] Production build via `eas build --profile production`, submitted with `eas submit`.
- [ ] Crash-free smoke test on a low-end Android and an older iPhone.
