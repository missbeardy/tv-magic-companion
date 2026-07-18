# Tier 1 — Preview Testing Checklist

**Preview URL:** https://tv-magic-companion-exsn2wkey-missbeardys-projects.vercel.app
**Version:** v1.1.138 · **Database:** DEV Supabase (use throwaway test leads — nothing here touches production)
**Date built:** 18-07-2026

Tick each box as you go. Anything that fails: note the item number (e.g. "T1.2 case 3") and what you saw.

---

## Setup (do once)

- [ ] Open the preview URL on **desktop Chrome** (for DevTools) **and** on a **real phone** (the dialer/SMS app and one-hand feel only work on a phone)
- [ ] Log in with a **dev** account. Do most tests as a **manager**; repeat the call/complete ones as an **employee**
- [ ] Make sure you have: one **unassigned** lead, one **assigned to you**, one **booked** lead. Use *Add Lead* if needed
- [ ] Learn the DevTools controls (Network tab): **Offline** checkbox · throttle → **Slow 3G** · block one call → right-click a request → **Block request URL**
- [ ] To reset the offline cache test later: DevTools → Application → IndexedDB → delete `tvm-offline-queue`

> Note: none of this is behind a feature switch — there's nothing to turn on.

---

## T1.1 — Reliable job completion

- [ ] **Online:** complete a booked lead through the checklist → confetti, lead moves to Completed, activity shows a "completed" event
- [ ] **Offline (the important one):** DevTools **Offline** → complete a booked lead → it finishes with no error and leaves the booked column; top banner shows a queued action → turn **Offline off** → within seconds the lead shows **Completed** and its activity event is tagged `offline_queue`
  - ❌ Fail if you saw confetti but the lead silently stayed booked
- [ ] **Server failure:** Block the leads update request → complete a job → an error shows and the checklist **stays open** (no confetti) → unblock → retry works
- [ ] **Contact note offline:** Offline → open a lead → add a contact note → shows "Saved — will sync" → go online → note appears in activity

## T1.2 — Weak-signal write resilience

- [ ] **Status change fails:** Block the leads update → change a lead's status via the status pill → red **Retry** toast appears (status not silently lost) → remove block → tap **Retry** → saves
- [ ] **Unassign fails:** Block the update → unassign a lead → Retry toast → retry works
- [ ] **Call on Slow 3G + blocked update:** tap call → either "call logged offline — will sync" or a retry toast; the status change is never silently dropped
- [ ] **Invoice send hang:** Offline (or block the send) → send an invoice → within ~10s a plain "couldn't reach the server" message (NOT an endless "Sending…" or a raw "Failed to fetch"); the dialog stays usable
- [ ] **Quote send** and **Review send:** same — friendly timeout message, no hang

## T1.3 — Job photos

- [ ] **Before-photo on an active job:** open a **booked** (not completed) lead → a **Photos** section is present → add a photo → it appears. Repeat on an **assigned** lead
- [ ] **Failed upload isn't lost:** Offline (or block the storage upload) → add a photo → amber "saved and will sync" note + a **Queued** thumbnail (not a silent drop) → go online → it uploads
- [ ] **Touch controls (phone):** **Share** and **Delete** are visible without hovering and tappable one-thumbed; Delete asks "Delete this photo?"
- [ ] **Cap of 10:** add photos up to 10 → the add button disappears / an "at limit" message shows on the 11th
- [ ] **Compression:** add a full-res phone photo → in the Network tab the uploaded file is much smaller than the original (or simply uploads quickly on Slow 3G)

## T1.4 — See jobs with no signal (offline cache)

- [ ] **Leads offline:** load the leads list online (fills the cache) → DevTools **Offline** → **reload the app** → today's leads still show with **names, phone numbers, addresses**; an amber "**Showing your saved copy from HH:MM**" note; top banner reads "showing your last saved leads & schedule"
- [ ] **Calendar offline:** with the cache warm, go offline → open Calendar → events still visible
- [ ] **Call still works offline:** from the cached list, tap call → dialer opens + the attempt queues
- [ ] **No-cache case (optional):** delete the `tvm-offline-queue` IndexedDB → go offline → reload → friendly "you're offline and there's no saved copy yet" message (not "please refresh")

## T1.5 — Frictionless calling

- [ ] **No confirm:** tap a lead's call button → the dialer opens **immediately**, with **no** "Call this customer?" pop-up
- [ ] **Optimistic status + Undo:** after calling, the lead auto-moves to **Contact Attempted** and an **Undo** toast appears → tap **Undo** → it reverts to the prior status
- [ ] **Pool lead:** call an unassigned pool lead → it auto-assigns to you **and** marks Contact Attempted; **Undo** reverts both
- [ ] **Offline call:** Offline → tap call → dialer opens + a passive "Offline — call logged" toast, with **no** confirm/alert pop-ups
- [ ] **Touch (phone):** call and SMS buttons are easy to hit one-thumbed

## T1.6 — Resume an interrupted completion *(partial — see note at bottom)*

- [ ] **Resume:** start completing a job, tick a couple of checklist items (or advance to the invoice step), then **reload the browser tab** → the app reopens the checklist for that lead **where you left off** (same step, same ticks)
- [ ] **Cleared on finish:** finish the job → reload → the checklist does **not** reappear
- [ ] **Cleared on cancel:** start a completion, cancel it → reload → the checklist does **not** reappear
- [ ] **Wording:** the checklist items read trade-neutrally ("Work completed to standard", etc.), not TV-specific

## T1.7 — Booking saves faster

- [ ] **Fast close:** on **Slow 3G**, book an appointment → the window closes quickly after saving (doesn't sit on "Saving…" waiting for the customer SMS)
- [ ] **Background confirm:** the customer still gets a confirmation SMS/email shortly after; if it fails you get a small passive toast, not a blocking pop-up
- [ ] **No hang:** book with the request blocked → the app doesn't freeze on "Saving…" indefinitely
- [ ] **Phone layout:** on a phone the Book window slides up from the bottom and its ✕ close button is easy to tap

## T1.8 — Easier to tap

- [ ] **Status pill + menu:** the status pill and each row in its dropdown are comfortably tappable one-thumbed (no tiny targets)
- [ ] **Destructive confirm:** from the status menu, choosing **Lost** or **Booking Cancelled** now asks to confirm first
- [ ] **Card button:** the action button on a lead card is a full-size target
- [ ] **Close buttons:** the ✕ on the Book and Add Lead windows are easy to tap

## T1.9 — Completed/Lost push actually sends

- [ ] Assign a lead to a second test user (who has notifications enabled) → mark it **Completed** (or **Lost**) → that user receives the push notification
  - (Previously this silently did nothing. If pushes aren't set up on your test devices, skip — no code path other than the notification changed.)

## Regression sweep (make sure nothing broke)

- [ ] Add a lead, assign it, book it, send a quote, complete → invoice → review — the normal happy paths still work online
- [ ] The leads kanban drag (desktop) still changes status
- [ ] No red errors in the browser console on load; the PWA still installs/updates

---

### Notes / known limits
- `tel:` and SMS-app opening are **phone-only** — on desktop the dialer won't launch, but the status/undo/queue logic is still checkable.
- **T1.6 is partial:** the *resume* + neutral wording shipped. Two sub-parts are deferred to their own change: (b) editing the checklist items per business in Franchise Settings, and (c) sending an invoice by SMS when the customer has no email.
- **T1.10** (turning on the instant customer acknowledgement SMS/email + manager alert for the live client) is **not** in this preview — it's a production settings change that needs you to confirm which brand it applies to. Flag when you're ready and I'll do it against production.

---

## Updates for Notion

Copy these into Notion (one row each). Fields: **Feature · Reason · What was done · Date**.

**1. Reliable job completion**
- **Reason:** Completing a job with no signal silently failed — confetti said "done" but the job stayed open and was lost. This is the #1 churn risk for a tradie in the field.
- **What was done:** Job completions (and contact notes) now save for real or queue offline and sync automatically; the celebration only fires once it's safely saved; a completion queued on one device can't overwrite a job already finished elsewhere.
- **Date:** 18-07-2026

**2. Weak-signal safety net**
- **Reason:** On one bar of signal, status changes / unassign / call updates were fired and forgotten — failures vanished, and invoice/quote sends could hang forever.
- **What was done:** Every lead write now confirms it saved (queues the call/SMS ones, shows a Retry on the rest); invoice, quote and review sends time out after 10s with a plain-language message instead of hanging.
- **Date:** 18-07-2026

**3. Job photos overhaul**
- **Reason:** Photos (a tradie's dispute evidence) only existed after completion, failed uploads vanished silently, the controls were hover-only, and big photos choked on mobile data.
- **What was done:** Photos can be added on any active job (before/on-site shots); failed uploads are kept and retried; Share/Delete are always tappable; the limit is 3→10; photos are auto-shrunk before upload.
- **Date:** 18-07-2026

**4. See your jobs with no signal**
- **Reason:** Offline, the app showed "couldn't load — please refresh" instead of the day's jobs, so a tradie couldn't even see the customer's address at the door.
- **What was done:** The leads list and calendar keep a saved copy of the last load and show it offline (names, phones, addresses) with a "showing saved copy from HH:MM" note.
- **Date:** 18-07-2026

**5. Frictionless calling**
- **Reason:** Every call was gated by a "Call this customer?" pop-up explaining CRM mechanics — pure friction on the most frequent action of the day — and the call button was too small.
- **What was done:** The dialer opens immediately with no pop-up; the status still updates automatically, with an Undo if tapped by mistake; call/SMS buttons enlarged for one-handed use.
- **Date:** 18-07-2026

**6. Resume an interrupted completion**
- **Reason:** Closing a job is a multi-step flow with no draft protection — a mid-job phone call that reloaded the app made you start the whole checklist over.
- **What was done:** Completion progress is saved as you go and the app reopens the checklist exactly where you left off; checklist wording made trade-neutral. (Per-business checklist editing and SMS-invoice-without-email to follow.)
- **Date:** 18-07-2026

**7. Booking saves faster and never hangs**
- **Reason:** After booking, the window sat on "Saving…" while it waited on customer-confirmation messages, and could freeze on a slow connection.
- **What was done:** The booking saves and the window closes straight away; the customer confirmation sends in the background and can no longer hang the screen; on phones the booking window is now a bottom sheet with a bigger close button.
- **Date:** 18-07-2026

**8. Easier to tap**
- **Reason:** The highest-use controls (status pill and menu, card action button, window close buttons) were smaller than a fingertip, and a mis-tap could silently mark a lead Lost.
- **What was done:** Those controls are now full-size touch targets, and marking a lead Lost or Booking Cancelled from the menu asks for confirmation first.
- **Date:** 18-07-2026
