-- dd18: drop parked Tasks feature tables (UI already removed).
-- Prod had orphan rows only; nothing live references these tables.

DROP TABLE IF EXISTS public.task_items CASCADE;
DROP TABLE IF EXISTS public.tasks CASCADE;
