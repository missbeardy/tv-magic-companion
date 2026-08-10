-- dd3 follow-up: account deletion was destroying customer bookings.
--
-- `profiles.id -> auth.users.id` is ON DELETE CASCADE, so deleting the auth user hard-deletes
-- the profile row. `events.user_id -> profiles.id` was ALSO cascade, so the chain
-- (delete account -> profile removed -> events removed) silently deleted every calendar
-- booking assigned to that technician. Those are the org's customer appointments, not the
-- individual's personal data — and the privacy policy explicitly promises the business's
-- records survive an individual's account deletion.
--
-- Every other staff reference in the schema already does the right thing here
-- (leads.assigned_to, lead_events.created_by/actor_id, quotes.created_by, invoices.created_by,
-- lead_photos.uploaded_by are all SET NULL). `events.user_id` was the outlier. It is nullable,
-- so SET NULL is a straight swap: the booking survives, unassigned.
--
-- Deliberately left as CASCADE: notifications, push_subscriptions (genuinely personal to the
-- deleted user), and tasks (dead feature, slated for removal in dd18).

alter table events drop constraint if exists events_user_id_fkey;

alter table events
  add constraint events_user_id_fkey
  foreign key (user_id) references profiles(id) on delete set null;
