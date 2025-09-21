# Coin Toss Session Tracker

Next.js 15 (App Router) app for running a classroom coin toss experiment backed by Supabase Realtime.

## Local Development

1. Install dependencies: `npm install`
2. Copy environment variables: `cp .env.example .env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Apply SQL in `supabase/sql/schema.sql` and `supabase/sql/policies.sql` to your Supabase project (via the SQL editor)
4. Start the dev server: `npm run dev`

Linting, type checking, and build commands:

- `npm run lint` – ESLint against the whole repo
- `npm run typecheck` – TypeScript `--noEmit`
- `npm run build` – production build with Turbopack
- `npm run build:ci` – lint + typecheck + build (CI parity)

## Supabase Setup Tips

- Realtime is enabled per table; ensure `results` has Realtime enabled in the Supabase dashboard
- API keys live under **Project Settings ? API**; the public anon key works for this client-only MVP
- The `realtime` channel unsubscribes automatically when components unmount to avoid ghost listeners

## Deploying on Vercel

1. Create a new Vercel project from this repo (App Router, Node 18+ runtime)
2. In **Project ? Settings ? Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Trigger a redeploy; Vercel will run `npm run build:ci`
4. The `/host` page uses live Realtime subscriptions, so keep the project on a hobby/pro plan that allows them

## Troubleshooting

- **Suspense / useSearchParams errors**: `/join/page.tsx` is a server wrapper that forces dynamic rendering and wraps the client component in `Suspense`
- **Chart.js SSR warning**: charts are dynamically imported with `ssr: false`; only client components reference the window
- **Lint / type errors**: run `npm run lint` or `npm run typecheck`; the CI build command combines them with the production build
- **Supabase auth**: ensure the anon key is correct and that Row Level Security policies from `supabase/sql/policies.sql` are applied

## Feature Notes

- `/host` shows a normalized histogram with the expected Binomial(20, 0.5) overlay, CSV export, and real-time updates
- `/join` blocks duplicate submissions per browser (localStorage) and adds a light flip animation plus a thank-you summary