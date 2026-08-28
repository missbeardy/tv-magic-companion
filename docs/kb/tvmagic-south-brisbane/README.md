# TV Magic South Brisbane — Messenger knowledge pack

Curated source of truth for the **draft** Gen-AI Facebook Messenger agent.

Upload these markdown files into a **new** Botpress Knowledge Base. Do **not** point Botpress at `tvmagic.com.au` as a live website index — the national site has other franchise phone numbers and at least one page with dollar figures.

## Rollback

This pack is documentation only. Publishing it in Botpress does not change the live Page until you attach the new bot to Messenger.

If the new bot is live and misbehaves: in Botpress, point the Messenger integration back at the **old structured bot**. Leave that old bot unpublished-but-not-deleted. The companion webhook still accepts the old payload.

## Files

| File | Upload to Botpress KB? |
|------|------------------------|
| `identity-and-rules.md` | Yes |
| `services.md` | Yes |
| `south-brisbane.md` | Yes |
| `AGENT_INSTRUCTIONS.md` | No — paste into the Autonomous Agent instructions |
| `README.md` | No |

## Sources (27-08-2026)

- [South Brisbane franchise page](https://www.tvmagic.com.au/south-brisbane-antenna-installation) — Firecrawl scrape (phone **0449 947 247**).
- National service catalogue from the site nav and indexed `/services/*` pages (titles + descriptions). Live fetches of those pages timed out the same day; do not treat this pack as a verbatim dump of every service URL.
- Explicitly **excluded**: other franchise location pages, [Our Services & The Industry](https://www.tvmagic.com.au/content/our-services-the-industry) (contains prices), 1800 / 0438 national call-to-action numbers.

## Refresh

Re-scrape the allowlisted franchise page + `/services/*` URLs, strip `$` amounts and non-South-Brisbane phone numbers, then replace the three KB files. Re-upload in Botpress. No companion deploy required for a KB-only refresh.
