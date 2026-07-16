-- GST-aware quotes/invoices + ABN on tax invoices

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS abn text,
  ADD COLUMN IF NOT EXISTS gst_registered boolean NOT NULL DEFAULT true;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS gst_amount numeric(12,2);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS gst_amount numeric(12,2);
