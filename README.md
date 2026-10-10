# Infinity Luxury Spa & Aesthetics

Customer mobile app, staff dashboard and Supabase backend for **Infinity Luxury Spa & Aesthetics Limited** (Abuja, Kano, Kaduna, Sokoto).

| Part | Tech | Folder |
|---|---|---|
| Customer app (iOS/Android) | Expo SDK 57, React Native, Expo Router, TypeScript | `apps/mobile` |
| Admin dashboard | Next.js 16 (App Router), Tailwind 4, TypeScript | `apps/admin` |
| Backend | Supabase: Postgres, Auth, Storage, RLS, Edge Functions | `supabase/` |
| Shared logic | Money (kobo), schemas, status machines, permissions, generated DB types | `packages/core` |

Design reference: `docs/design/Infinity-Luxury-Spa-App-UI/Infinity-Luxury-Spa-App-UI.pdf` (29 screens). Names, prices, ratings and photos in that PDF are illustrative; the apps show only what is in the database.

## Quick start

Requires Node 22+ and npm 10+ (npm workspaces; see `CLAUDE.md` for why not pnpm).

```bash
npm install

# 1. Verify the backend logic (runs every migration in an in-process Postgres; no Docker or cloud needed)
npm run test:db

# 2. Shared package and apps
npm test -w @infinity/core
npm test -w @infinity/mobile
npm test -w @infinity/admin
npm run typecheck           # all workspaces
npm run build:admin
```

To run the apps against a real backend you need a Supabase project: follow [docs/deployment.md](docs/deployment.md), then

```bash
cp apps/mobile/.env.example apps/mobile/.env      # Supabase URL + anon key
cp apps/admin/.env.example  apps/admin/.env.local
npm run start -w @infinity/mobile                 # Expo dev server
npm run dev -w @infinity/admin                    # http://localhost:3000
```

## Documentation

| Doc | Contents |
|---|---|
| [architecture.md](docs/architecture.md) | How the pieces fit, data flow, key decisions |
| [database.md](docs/database.md) | Schema, migrations, availability/booking/stock/payment functions |
| [payments.md](docs/payments.md) | Paystack/Flutterwave flow, webhooks, refunds, test mode |
| [security.md](docs/security.md) | Threat model, RLS, RBAC, secrets, audit |
| [deployment.md](docs/deployment.md) | Supabase, Edge Functions, Vercel, EAS, scheduled jobs |
| [testing.md](docs/testing.md) | What is tested, how, and what still needs a live environment |
| [admin-guide.md](docs/admin-guide.md) | Plain-language guide for the business owner and staff |
| [app-store-release.md](docs/app-store-release.md) | iOS / Android release preparation |
| [launch-checklist.md](docs/launch-checklist.md) | Business approvals and technical gates before going live |
| [progress.md](docs/progress.md) | Current status, known limitations, next steps |

## Status

Built and verified locally: schema, RLS, booking/payment/stock logic (69 database tests), shared package (15), mobile unit tests (19), admin unit tests (13), mobile Android bundle, admin production build.

**Not yet verified end-to-end** because it needs accounts that only the business can create: a Supabase project, Paystack/Flutterwave keys and webhooks, Resend, Expo/EAS and Apple/Google developer accounts. See [launch-checklist.md](docs/launch-checklist.md). Nothing has been published to an app store or deployed.
