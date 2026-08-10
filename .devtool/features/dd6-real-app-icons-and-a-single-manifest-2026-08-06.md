---
id: "dd6-real-app-icons-and-a-single-manifest-2026-08-06"
status: "in-progress"
priority: "critical"
assignee: null
dueDate: null
created: "2026-08-06T16:00:00.000Z"
modified: "2026-08-06T20:45:00.000Z"
completedAt: null
labels: ["due-diligence", "pwa", "branding", "play-store"]
order: "Z5"
---

# DD6 Real app icons and a single manifest

Verified by reading the bytes:

```
public/fieldbourne-logo.png  sig ffd8ffe0 (JPEG/JFIF)  24,949 bytes  md5 25e189f5…
public/tvmagic-logo.png      sig ffd8ffe0 (JPEG/JFIF)  24,949 bytes  md5 25e189f5…
```

**Three problems in one file:**

1. **It is a JPEG named `.png`**, declared `"type": "image/png"` in the manifest.
2. **It is byte-identical to the TV Magic logo** — same md5. The T2.3 "FieldBourne rebrand" copied the file. **Your FieldBourne PWA installs with your client's logo.**
3. **It is declared at both 192×192 and 512×512** from one 24 KB file, one entry marked `purpose: "maskable"` — Android applies the maskable safe-zone crop to a logo never designed for it and chops it.

**Plus:** two competing manifests ship. `index.html` links `/manifest.json` (static); vite-plugin-pwa generates `/manifest.webmanifest` from a **duplicate config block** in `vite.config.ts` that nothing references. Both land in `dist/`. Guaranteed to drift.

**Blocks:** Bubblewrap/TWA packaging requires a genuine ≥512×512 PNG (`dd17`). Also fails a Lighthouse PWA audit today.

**Spec:**
- Commission/produce a real FieldBourne icon: true PNG, 512×512 and 192×192 as separate files, **plus a separate maskable variant** with correct safe-zone padding (the maskable and `any` purposes should not share a file).
- Update `public/manifest.json` with correct per-size entries.
- Delete `public/tvmagic-logo.png` (brand assets belong in the `brands` table, not the shell).
- Pick **one** manifest source of truth: either drop the static `public/manifest.json` and link the generated `manifest.webmanifest`, or strip the `manifest` block from `vite.config.ts`. Not both.
- Fix `apple-touch-icon` and the favicon link while in `index.html`.

**Feature switch:** none.

**Done when:** a fresh PWA install on Android shows a correctly-cropped FieldBourne icon; Lighthouse PWA audit passes on installability and maskable icon; only one manifest exists in `dist/`; no TV Magic asset remains in the shell.

**Difficulty:** Easy in code — needs an actual designed icon, which cannot be coded around.

Source: DUE_DILIGENCE_REVIEW.md — Phase 5 + Phase 2, I6.

## Build status (06-08-2026) — genuinely blocked, only the hygiene half is codeable

**Done today (v1.1.158, uncommitted pending owner review):**
- Deleted `public/tvmagic-logo.png` (the byte-identical copy of the client's logo — confirmed
  nothing in the live app referenced it, only an unrelated `.stitch/login.html` design mockup).
- Picked one manifest source of truth: `public/manifest.json` (already what `index.html` links).
  `vite.config.ts`'s `VitePWA(...)` now has `manifest: false` — it was duplicating
  `manifest.json` verbatim into a second, unreferenced `manifest.webmanifest`. Confirmed via
  `vite build`: only `dist/manifest.json` exists now (omitting the `manifest` key alone wasn't
  enough — the plugin still emitted an empty default manifest until set explicitly to `false`).

**Not done — cannot be coded around, per the card's own difficulty note:**
- The actual icon. `fieldbourne-logo.png` is still the exact same file — a JPEG mislabeled
  `.png`, and it's your client's real logo (TV Magic), not a FieldBourne asset. Deleting the
  *duplicate* doesn't touch this; the manifest, favicon, and apple-touch-icon in `index.html`
  all still point at it. This needs a genuine designed FieldBourne icon (true PNG, 512×512 +
  192×192, plus a separately-designed maskable variant with proper safe-zone padding) —
  something only you (or a designer) can produce, not something I can fabricate as placeholder
  "final" art for a real business's public-facing icon.
- Once a real icon file exists: update `public/manifest.json`'s icon entries (correct per-size,
  separate `any`/`maskable` files) and the `favicon`/`apple-touch-icon` links in `index.html` —
  both are quick once the asset lands.

**Left to close this card out:** you (or a designer) produce the real icon set; I wire it into
`manifest.json` + `index.html` and re-verify with Lighthouse. Leaving this in `in-progress`, not
`review` — it's not close to done, only the drift/duplication risk is fixed.
