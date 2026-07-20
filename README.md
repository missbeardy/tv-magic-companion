# FieldBourne

Multi-tenant field-service CRM PWA for Australian trade businesses.
Repo folder is still `tv-magic-companion` (rename deferred — see ROADMAP T2.3).

## Stack

- React 19 + Vite + Tailwind + installable PWA
- Supabase (Postgres + RLS) + Vercel serverless (`api/`)
- Twilio SMS, Resend email, Stripe (SaaS billing + Connect invoice pay), OneSignal push

## Docs map

| Doc | Purpose |
|-----|---------|
| [ROADMAP.md](ROADMAP.md) | **Governing** build order — read before coding |
| [docs/PROJECT.md](docs/PROJECT.md) | Tech overview |
| [docs/SALES_PIPELINE_WORKFLOW.md](docs/SALES_PIPELINE_WORKFLOW.md) | Pipeline behaviour (versioned) |
| [docs/DEMO_RUNBOOK.md](docs/DEMO_RUNBOOK.md) | 60-second sales demo |
| [docs/ONBOARDING_RUNBOOK.md](docs/ONBOARDING_RUNBOOK.md) | Founder-led new-org setup |
| [DEV_SETUP.md](DEV_SETUP.md) | Local / preview env |
| [supabase/RECONCILIATION.md](supabase/RECONCILIATION.md) | Prod schema reconcile |
| [supabase/MIGRATION_ORDER.md](supabase/MIGRATION_ORDER.md) | Migration timestamp hazard |

## Develop

```bash
npm install
npm run dev
```

```bash
npm test
npm run typecheck
npm run build
```

Preview: `vercel deploy --yes`. Prod: `vercel deploy --prod` from `main` only after owner approval.

## Conventions

1. Anything not on ROADMAP → confirm with owner and add it first.
2. Feature switches gate **server** endpoints, not just UI.
3. Bump `src/lib/changelog.ts` + `package.json` together.
4. Pipeline behaviour changes bump `docs/SALES_PIPELINE_WORKFLOW.md`.
5. Never add a new file under `api/` root (Vercel Hobby 12-function cap) — add `?action=` on an existing hub.
