---
id: "dd18-delete-the-dead-code-t28-missed-2026-08-06"
status: "done"
priority: "medium"
assignee: null
dueDate: null
created: "2026-08-06T16:00:00.000Z"
modified: "2026-08-11T03:30:00.000Z"
completedAt: "2026-08-11T03:30:00.000Z"
labels: ["due-diligence", "tech-debt", "subtraction"]
order: "ZD"
---

# DD18 Delete the dead code T2.8 missed

**Done** (v1.1.170). Remaining dead surfaces removed; item 7 deferred as live architecture debt.

## Completed

1. **~~Tasks~~** — UI already gone. Dropped `tasks` + `task_items` on prod + dev (`20260811032416_drop_tasks_tables.sql`). Stripped types + `useOrgSupabase` allowlist.
2. **~~`api/_rateLimit.js`~~** — already deleted by dd4.
3. **~~`public/tvmagic-logo.png`~~** — already deleted by dd6. Fixed leftover SW refs (`fieldbourne-logo.png` → `/icon-192.png` in `public/sw.js` + `web-push-handler.js`).
4. **~~Duplicate manifests~~** — already resolved by dd6 (`manifest: false`, single `public/manifest.json`).
5. **~~`push-notify`~~** — deleted from repo + undeployed from prod (`abnheynzugpicikxwwmv`). `config.toml` block removed.
6. **~~Social posting~~** — done via t36 (v1.1.168).
7. **Legacy `FEATURES` tier map** — **NOT deleted.** Still live for nav/billing tier gates (`leads`/`calendar`/`reports`/`ai_parsing`/`api_access`). Collapsing it into the switch catalog is a separate product change, not dead-code removal.

## Out of scope / follow-ups
- Item 7 → leave as known debt (or a future card if worth merging systems).
- Historical audit docs may still mention these paths.
