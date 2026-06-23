-- DEV: add remaining app tables if you started with minimal orgs/profiles only.

CREATE TABLE IF NOT EXISTS public.customers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid REFERENCES public.orgs(id) ON DELETE CASCADE,
  name        text NOT NULL DEFAULT '',
  phone       text,
  email       text,
  address     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.leads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid REFERENCES public.orgs(id) ON DELETE CASCADE,
  customer_id       uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  name              text NOT NULL,
  phone             text,
  email             text,
  address           text,
  service_type      text NOT NULL DEFAULT 'General Enquiry',
  details           text,
  status            text NOT NULL DEFAULT 'unassigned',
  source            text,
  lead_source       text,
  assigned_to       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at       timestamptz,
  timer_expires_at  timestamptz,
  demo_mode         boolean NOT NULL DEFAULT false,
  email_hash        text,
  raw_email         text,
  raw_sms           text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  org_id      uuid REFERENCES public.orgs(id) ON DELETE CASCADE,
  event_type  text NOT NULL,
  note        text,
  payload     jsonb,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  org_id        uuid REFERENCES public.orgs(id) ON DELETE CASCADE,
  uploaded_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  storage_path  text NOT NULL,
  public_url    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id        uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_id        uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  title          text NOT NULL,
  description    text,
  notes          text,
  start_time     timestamptz NOT NULL,
  end_time       timestamptz NOT NULL,
  client_name    text,
  client_phone   text,
  client_email   text,
  client_address text,
  client_job     text,
  job_quote      numeric,
  color          text,
  category       text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid REFERENCES public.orgs(id) ON DELETE CASCADE,
  title        text NOT NULL,
  visibility   text NOT NULL DEFAULT 'everyone',
  is_completed boolean NOT NULL DEFAULT false,
  created_by   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.task_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  label      text NOT NULL,
  is_checked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id     uuid REFERENCES public.orgs(id) ON DELETE CASCADE,
  lead_id    uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  title      text NOT NULL,
  message    text NOT NULL,
  type       text NOT NULL,
  read       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.org_phone_numbers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  phone_number text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.orgs(id) ON DELETE SET NULL;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.orgs(id) ON DELETE CASCADE;
