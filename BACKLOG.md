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

## Monthly visibility cleanup for completed and lost leads

### Goal
At the start of every month, hide completed and lost leads from the active leads list while keeping them accessible for dashboard reporting and historical review.

### Proposed scope
- Add an archive or visibility field to leads, for example `hidden_from_active_at` or `archived_at`.
- Run a scheduled monthly process on the 1st to hide leads with `status` values of `completed` or `lost`.
- Update the Leads page so hidden completed/lost leads no longer appear in normal active lead views.
- Keep hidden leads queryable for manager dashboards, reports, and any historical detail pages.
- Provide a manager-accessible view or filter to find hidden completed/lost leads when needed.

### Acceptance criteria
- On the 1st of each month, completed and lost leads from the previous active period are hidden from the normal leads list.
- Hidden leads remain in the database and are not deleted.
- Managers can still access hidden leads through dashboard/reporting views.
- Active, unassigned, assigned, contact attempted, and booked leads remain visible.
- The monthly cleanup is org-scoped and does not affect another organization's data.

## Monthly manager reporting for agent activity

### Goal
Give managers a monthly overview of agent activity, including bookings made, contact attempts, completed jobs, lost leads, and related lead activity.

### Proposed scope
- Add a reporting dashboard section for managers.
- Aggregate activity by agent, organization, and month.
- Track metrics such as bookings made, contact attempts, assigned leads, completed jobs, lost leads, and conversion rate.
- Use existing lead status changes and `lead_events` where available for audit-backed reporting.
- Include hidden completed/lost leads in reports even after they are removed from active lead visibility.
- Add date filters so managers can review the current month and previous months.

### Acceptance criteria
- Managers can view monthly activity totals across the organization.
- Managers can filter or group reporting by agent.
- Reports include leads hidden by the monthly visibility cleanup.
- Bookings, contact attempts, completed jobs, and lost leads are counted consistently from lead status and event data.
- Employees cannot see organization-wide reporting unless their role permits it.
