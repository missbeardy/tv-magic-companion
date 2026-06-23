-- DEV ONLY: initial schema inferred from application code.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE public.orgs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,
  slug                    text NOT NULL UNIQUE,
  logo_url                text,
  primary_color           text NOT NULL DEFAULT '#004B93',
  secondary_color         text NOT NULL DEFAULT '#00B4C5',
  support_phone           text,
  support_email           text,
  subscription_tier       text NOT NULL DEFAULT 'basic'
    CHECK (subscription_tier IN ('basic', 'pro', 'enterprise')),
  subscription_expires_at timestamptz,
  lead_count_this_month   integer NOT NULL DEFAULT 0,
  avg_job_value           numeric NOT NULL DEFAULT 180,
  upsell_items            jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id                      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                   text NOT NULL,
  full_name               text,
  first_name              text,
  last_name               text,
  role                    text NOT NULL DEFAULT 'employee'
    CHECK (role IN ('manager', 'employee', 'platform_admin')),
  org_id                  uuid REFERENCES public.orgs(id) ON DELETE SET NULL,
  manager_id              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  avatar_url              text,
  phone                   text,
  suburb                  text,
  lat                     double precision,
  lng                     double precision,
  location_enabled        boolean NOT NULL DEFAULT false,
  location_updated_at     timestamptz,
  push_enabled            boolean NOT NULL DEFAULT false,
  test_profile_owner_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_hidden_test_profile  boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profiles_org_id_idx ON public.profiles(org_id);

CREATE TABLE public.customers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid REFERENCES public.orgs(id) ON DELETE CASCADE,
  name        text NOT NULL DEFAULT '',
  phone       text,
  email       text,
  address     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customers_org_id_idx ON public.customers(org_id);

CREATE TABLE public.leads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid REFERENCES public.orgs(id) ON DELETE CASCADE,
  customer_id       uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  name              text NOT NULL,
  phone             text,
  email             text,
  address           text,
  service_type      text NOT NULL DEFAULT 'General Enquiry',
  details           text,
  status            text NOT NULL DEFAULT 'unassigned'
    CHECK (status IN (
      'unassigned', 'assigned', 'contact_attempted',
      'booked', 'lost', 'completed', 'expired'
    )),
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

CREATE INDEX leads_org_id_idx ON public.leads(org_id);
CREATE INDEX leads_email_hash_idx ON public.leads(org_id, email_hash);

CREATE TABLE public.lead_events (
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

CREATE TABLE public.lead_photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  org_id        uuid REFERENCES public.orgs(id) ON DELETE CASCADE,
  uploaded_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  storage_path  text NOT NULL,
  public_url    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.events (
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

CREATE TABLE public.tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid REFERENCES public.orgs(id) ON DELETE CASCADE,
  title        text NOT NULL,
  visibility   text NOT NULL DEFAULT 'everyone'
    CHECK (visibility IN ('me', 'me_and_nick', 'everyone')),
  is_completed boolean NOT NULL DEFAULT false,
  created_by   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.task_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  label      text NOT NULL,
  is_checked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notifications (
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

CREATE TABLE public.org_phone_numbers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  phone_number text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$;

ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (
    org_id = public.current_user_org_id()
    OR id = auth.uid()
    OR (is_hidden_test_profile = true AND test_profile_owner_id = auth.uid())
  );

CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());

CREATE POLICY orgs_select_own ON public.orgs FOR SELECT TO authenticated
  USING (id = public.current_user_org_id());

CREATE POLICY orgs_update_manager ON public.orgs FOR UPDATE TO authenticated
  USING (
    id = public.current_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'manager' AND p.org_id = orgs.id
    )
  );

CREATE POLICY leads_org ON public.leads FOR ALL TO authenticated
  USING (org_id = public.current_user_org_id())
  WITH CHECK (org_id = public.current_user_org_id());

CREATE POLICY lead_events_org ON public.lead_events FOR ALL TO authenticated
  USING (org_id = public.current_user_org_id())
  WITH CHECK (org_id = public.current_user_org_id());

CREATE POLICY lead_photos_org ON public.lead_photos FOR ALL TO authenticated
  USING (org_id = public.current_user_org_id())
  WITH CHECK (org_id = public.current_user_org_id());

CREATE POLICY customers_org ON public.customers FOR ALL TO authenticated
  USING (org_id = public.current_user_org_id())
  WITH CHECK (org_id = public.current_user_org_id());

CREATE POLICY events_org ON public.events FOR ALL TO authenticated
  USING (org_id = public.current_user_org_id())
  WITH CHECK (org_id = public.current_user_org_id());

CREATE POLICY tasks_org ON public.tasks FOR ALL TO authenticated
  USING (org_id = public.current_user_org_id())
  WITH CHECK (org_id = public.current_user_org_id());

CREATE POLICY task_items_via_task ON public.task_items FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_items.task_id AND t.org_id = public.current_user_org_id()
    )
  );

CREATE POLICY notifications_own ON public.notifications FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY push_subscriptions_own ON public.push_subscriptions FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
