-- FOUNDER REVIEW REQUIRED before production apply.
-- Spec C (Customer Linking, Phase A): one-off historical backfill.
-- Applied to the DEV Supabase project only until founder approves production.
--
-- For each org, for every lead with customer_id IS NULL and a non-empty phone
-- or email: match to an existing customer by email (case-insensitive) first,
-- then by phone (last 9 digits, so +61 / 0 / 61 formats all match); create a
-- customer from the lead's own fields when there is no match; set customer_id.
--
-- IDEMPOTENT: only touches leads where customer_id IS NULL, so a re-run
-- processes zero rows and creates zero duplicate customers. Matching against
-- the live customers table each iteration means two leads sharing a phone/email
-- within one run collapse onto the same (possibly just-created) customer.
--
-- No PII in output: RAISE NOTICE reports counts only.

DO $$
DECLARE
  r RECORD;
  v_customer_id uuid;
  v_email text;
  v_phone_key text;
  matched_count int := 0;
  created_count int := 0;
BEGIN
  FOR r IN
    SELECT id, org_id, name, phone, email, address
    FROM public.leads
    WHERE customer_id IS NULL
      AND org_id IS NOT NULL
      AND (coalesce(trim(phone), '') <> '' OR coalesce(trim(email), '') <> '')
    ORDER BY created_at ASC
  LOOP
    v_customer_id := NULL;
    v_email := nullif(trim(r.email), '');
    -- Last 9 digits: invariant across AU +61 / 0 / 61 phone formats.
    v_phone_key := nullif(right(regexp_replace(coalesce(r.phone, ''), '\D', '', 'g'), 9), '');

    -- 1. Match by email (case-insensitive), most recent wins.
    IF v_email IS NOT NULL THEN
      SELECT c.id INTO v_customer_id
      FROM public.customers c
      WHERE c.org_id = r.org_id
        AND lower(c.email) = lower(v_email)
      ORDER BY c.created_at DESC
      LIMIT 1;
    END IF;

    -- 2. Then by phone (last 9 digits), most recent wins.
    IF v_customer_id IS NULL AND v_phone_key IS NOT NULL AND length(v_phone_key) = 9 THEN
      SELECT c.id INTO v_customer_id
      FROM public.customers c
      WHERE c.org_id = r.org_id
        AND right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 9) = v_phone_key
      ORDER BY c.created_at DESC
      LIMIT 1;
    END IF;

    -- 3. No match → create from the lead's own fields.
    IF v_customer_id IS NULL THEN
      INSERT INTO public.customers (org_id, name, phone, email, address)
      VALUES (
        r.org_id,
        coalesce(nullif(trim(r.name), ''), ''),
        nullif(trim(r.phone), ''),
        v_email,
        nullif(trim(r.address), '')
      )
      RETURNING id INTO v_customer_id;
      created_count := created_count + 1;
    ELSE
      matched_count := matched_count + 1;
    END IF;

    UPDATE public.leads SET customer_id = v_customer_id WHERE id = r.id;
  END LOOP;

  RAISE NOTICE 'customer_linking backfill: % leads matched to existing customers, % new customers created',
    matched_count, created_count;
END $$;
