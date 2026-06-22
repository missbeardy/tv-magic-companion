# AGENTS.md

## Cursor Cloud specific instructions

### What this project is
`tv-magic-companion` is a **Vite + React 19 + TypeScript PWA** frontend (a field-service CRM). The backend is **Supabase** (Postgres + Auth + Storage). In production the app points at a hosted Supabase project; that project's schema/migrations are **not** in this repo.

Other code that is **not** part of `npm run dev`:
- `api/*.ts` — Vercel serverless functions (Twilio/Resend/Anthropic/OneSignal/Supabase webhooks). They run on Vercel, not under Vite.
- `supabase/functions/push-notify` — a Deno Supabase Edge Function.

### Required environment variables
The frontend reads these via `import.meta.env` and **throws `Missing Supabase environment variables` at module load** if the first two are absent (`src/lib/supabase.ts`), so the app will not render without them:
- `VITE_SUPABASE_URL` (required)
- `VITE_SUPABASE_ANON_KEY` (required)
- `VITE_VAPID_PUBLIC_KEY`, `VITE_CLAUDE_MODEL` (optional)

Put them in `.env.local` (git-ignored via `*.local`). This file is not committed, so each fresh VM must recreate it.

### Commands
- Dev server: `npm run dev` (Vite, http://localhost:5173). Use `npm run dev -- --host` to expose on the network.
- Build: `npm run build` (runs `vite build`; succeeds).
- Lint: there is **no `lint` npm script** — run `npx eslint .`. Note: the repo currently has **pre-existing** ESLint errors (unused vars, `no-explicit-any`, `react-hooks/set-state-in-effect`); a non-zero exit is expected and is not caused by env setup.

### Running fully locally (no production credentials)
To exercise auth/data locally you need a Supabase backend. The repo's `supabase/config.toml` only configures the edge function, not a full local stack, and **no DB migrations exist**, so tables must be created by hand.

One working approach used during setup:
1. Requires Docker + the `supabase` CLI (neither is in the update script; install once per VM if needed).
2. Run a standalone stack from a scratch dir (avoids editing the repo's `supabase/`): `cd /tmp/sb-local && supabase init && supabase start`, then `supabase status -o env` for the URL + `ANON_KEY` (legacy JWT) + `SERVICE_ROLE_KEY`.
3. Write those into `/workspace/.env.local` as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
4. Create the schema the app expects (at minimum `orgs`, `profiles`, `leads`, `notifications`) and a user. New `public` tables have RLS disabled locally, so anon/authenticated can read/write without policies. Create an auth user via `POST /auth/v1/admin/users` (with the service-role key, `email_confirm: true`) and insert a matching `profiles` row whose `role` is `manager` or `employee` and `org_id` points at an `orgs` row.
5. Log in at `/login`; a `manager` profile lands on the Manager Dashboard, otherwise the Employee Dashboard.

Gotcha: `vite` only reads `.env.local` at startup — restart `npm run dev` after changing it.
