# Supabase Migrations

Run these against your **dev** Supabase project first. Do **not** apply to production (`abnheynzugpicikxwwmv`) until Phase 5 cutover.

## Apply to dev

**Dashboard:** SQL Editor → paste each file in order → Run.

**CLI:**

```bash
npx supabase link --project-ref YOUR_DEV_PROJECT_REF
npx supabase db push
```

## Rollback (dev only)

```sql
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS test_profile_owner_id,
  DROP COLUMN IF EXISTS is_hidden_test_profile;
```
