# Xero live sync

Franchise Settings → **Xero live sync** (feature switch `xero_live_sync`).

## What it does

- OAuth-connect a Xero organisation
- Push **sent** invoices in a date range as tax-inclusive ACCREC sales invoices (contacts nested on the invoice)
- Skip invoices already marked with `xero_invoice_id`
- CSV export (`accounting_export`) still works without connecting

## Test without a Xero account (recommended)

Xero signup is often blocked (region / phone / ABN). Use **mock mode** instead:

1. Set Vercel / local env: `XERO_MOCK=1` (no Client ID/Secret required).
2. Apply migration `20260723120000_xero_live_sync.sql` if not already.
3. Platform Admin → enable `xero_live_sync` for the brand.
4. Franchise Settings → **Connect Xero** → redirects through our mock callback (no Xero login).
5. **Sync invoices** — builds real payloads, writes `xero_invoice_id = mock-<uuid>`, does **not** call Xero.

UI shows “Demo Company (mock)” / “mock mode”. Safe for preview and UAT.

**Unit tests** (`npm run test -- tests/xeroSync.test.ts`) also need no Xero account.

## Live Xero (optional later)

1. Free [Xero signup](https://www.xero.com/) → **Demo Company** (if available in your region).
2. [developer.xero.com](https://developer.xero.com/) → New app → **Web app**.
3. Redirect URI: `https://<your-host>/api/xero-oauth-callback`
4. Env: `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET` (turn **off** `XERO_MOCK` or leave mock only when credentials are absent).
5. Connect → Sync as above.

## Not included (yet)

- Pulling invoices/contacts from Xero
- Pushing payments / marking PAID in Xero (paid notes go in Reference)
- Auto-sync on invoice send (manual date-range sync only)
