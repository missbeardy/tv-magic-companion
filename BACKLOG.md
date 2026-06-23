# Backlog

## Facebook Messenger chatbot lead capture

### Goal
Capture customer details from Facebook Messenger conversations and create assigned leads in the TV Magic web app.

### Proposed scope
- Add a Meta Messenger webhook endpoint, for example `api/inbound-messenger.ts`.
- Verify Meta webhook signatures before processing inbound messages.
- Map each Facebook Page ID to an organization with a new database mapping table, similar to the existing phone-number-to-org routing.
- Store conversation state while the chatbot collects name, phone, email, address, service type, and job details.
- Create a `leads` row with `source = 'messenger'`, `lead_source = 'Facebook Messenger'`, and the resolved `org_id`.
- Either create the lead as `unassigned` for manager review or auto-assign it by setting `assigned_to`, `assigned_at`, `timer_expires_at`, and `status = 'assigned'`.
- Notify managers or assigned technicians using the existing notification/SMS patterns.

### Database considerations
- Add `org_facebook_pages` to map Meta Page IDs to `orgs.id`.
- Add `messenger_conversations` for PSID, page ID, org ID, collected fields, chatbot state, and optional `lead_id`.
- Add `messenger_messages` or use `lead_events` to preserve transcript/audit history.
- Confirm the production Supabase `leads` table supports any new source or raw payload fields needed for Messenger.

### Acceptance criteria
- A valid Messenger conversation can collect enough customer details to create a lead.
- The lead appears in the existing Leads page for the correct organization.
- If auto-assignment is enabled, the lead is assigned using the same fields as the current assignment flow.
- Managers or technicians receive the expected notification when the Messenger lead is created or assigned.
- Duplicate or repeated Messenger messages do not create duplicate active leads.
