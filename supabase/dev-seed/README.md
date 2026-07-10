# Dev-only seed / fixes

These scripts are **not** part of the migration history and are **not** applied
by `supabase db push`. They were one-off dev-environment fixes (seed a demo org,
unblock localhost login, patch a dev RLS white-screen) and must never run against
production.

Run them manually in the **dev** Supabase SQL editor if you need to rebuild a
local/dev database:

- `20250622130000_dev_seed.sql` — seed a demo org and link existing auth users as managers
- `20250623100000_fix_dev_login.sql` — unblock localhost login
- `20250624120000_fix_dev_rls_white_screen.sql` — fix post-login white screen in dev

Anything that should reach production belongs in `supabase/migrations/` instead.
