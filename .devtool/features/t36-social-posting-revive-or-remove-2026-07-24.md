---
id: "t3-6-social-revive-or-remove-2026-07-24"
status: "review"
priority: "low"
assignee: null
dueDate: "2026-07-24"
created: "2026-07-24T12:00:00.000Z"
modified: "2026-08-06T17:00:00.000Z"
completedAt: null
labels: ["roadmap", "t3"]
order: "a5"
---
# T3.6 Social posting: revive or remove

Decide on parked SocialPage / Zernio; removal frees a Vercel function slot.

---

## Board review 06-08-2026 — DECISION OVERDUE; the answer is REMOVE

This card asks a question. The review answers it: **remove.**

`SocialPage.tsx` (512 lines), `LeadSocialModal.tsx`, `api/social-post.ts`, `src/lib/generateCaption.ts` and the Zernio integration are fully built, parked, and the server gate was **never UAT'd**. Social posting has nothing to do with "never lose a lead" — it is the clearest single instance of feature creep in the product.

Removing it frees a Vercel function slot, deletes ~700 lines, shrinks the bundle (`dd7`) and removes one caller from the LLM-proxy migration (`dd5`).

**Verdict: this card is now redundant with `dd18`, which executes the removal.** It stays in Review only because the decision is yours, not a session's. Say the word and `dd18` does the work; then close this.
