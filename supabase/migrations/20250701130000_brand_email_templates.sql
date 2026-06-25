-- Brand-level email templates (quote e-sign and future transactional email)

ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS email_templates jsonb NOT NULL DEFAULT '{}'::jsonb;

-- TV Magic default quote email (subject + HTML body with {{placeholders}})
UPDATE public.brands
SET email_templates = email_templates || '{
  "customer_quote_request_subject": "Your quote from {{org.name}}",
  "customer_quote_request_html": "<div style=\"font-family:Inter,Arial,sans-serif;line-height:1.5;color:#1f2937;max-width:560px\"><h2 style=\"color:{{primaryColor}}\">Your Quote Is Ready</h2><p>Hi {{customerName}},</p><p>{{org.name}} has prepared a quote{{serviceTypeLine}} for you to review and sign online.</p><p style=\"margin:24px 0\"><a href=\"{{acceptanceUrl}}\" style=\"background:{{primaryColor}};color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block\">Review &amp; sign quote</a></p><p><strong>Amount:</strong> {{totalAmount}}</p><p><strong>Scope:</strong><br/>{{scopeHtml}}</p>{{termsBlock}}{{senderBlock}}</div>"
}'::jsonb
WHERE slug = 'tv-magic'
  AND NOT (email_templates ? 'customer_quote_request_subject');
