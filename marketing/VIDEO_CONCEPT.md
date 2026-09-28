# FieldBourne: 30-second ad, review, concepts and script

| Field | Value |
|---|---|
| **Product / company** | FieldBourne (app) · Fieldbourne Digital (company) |
| **Audience** | Aussie trade businesses, 2–5 people |
| **Pains targeted** | Missed leads and callbacks · admin eating into nights and weekends |
| **Placement** | Website hero + social ads (9:16 master, 29.5s, sound-off safe) |
| **Built asset** | `marketing/video/fieldbourne-30s.mp4` (rendered from `fieldbourne-30s.html`) |
| **Claims check** | Every on-screen beat maps to a shipped feature (see `docs/MARKETING.md` § Claims discipline) |

---

## Part 1: App value and UX review

### The strongest hook
**"The job you missed while you were on the tools, caught and booked before you're down the ladder."**
ServiceM8 and Tradify manage jobs you've *already won*. FieldBourne wins the ones you're *currently losing*. A missed call becomes an auto text-back, then a structured lead, then a quote, a booking and an invoice. The tradie types almost nothing. One saved $300–$1,500 job pays for the year.

### Top 3 "aha" moments
1. **The phone answers for you.** A missed call triggers an SMS from *your* business within seconds. The customer waits for you instead of ringing the next number.
2. **The lead card is already filled in.** Their messy text ("burst pipe under the sink, 12 Smith St") arrives as name, mobile, address and job, with a callback timer running. No sticky notes and no "who was that?".
3. **Quote to booked without typing.** You tap a price-list chip, they e-sign on their phone, you book the slot, and confirmation, calendar invite and day-before reminder go out automatically.

*Architecture, translated for tradies (don't name vendors in the ad):*
- The database and auth work means "every lead is saved, even if the AI hiccups", and each business's data stays locked to its own team.
- Push notifications mean "your phone pings the second a lead lands".
- The offline queue means "works in a black spot, syncs when you're back in signal".
- Monitoring means "we see bugs before you do".

### Immediate UI/UX and messaging refinements
Based on `docs/ux-review-2026-08-19/09-leads-mobile.png`:
1. **Shell still wears TV Magic purple.** Ship the FieldBourne teal/sunrise shell (ROADMAP T2.3) before any ad drives traffic. A prospect who clicks through should see the same brand the ad showed.
2. **Lead cards read "Unknown" with "228h 2m" timers.**
   - On real or demo data, fall back to the phone number or job type instead of "Unknown".
   - Once a timer has lapsed, show it as "Overdue · 9 days" instead of a raw hour count that looks broken.
   - Seed the demo org with clean, recent leads before screen-recording anything.
3. **Lead with outcomes, not features.**
   - Swap "Manage and track all leads across every stage" for **"Every enquiry answered. Every job chased to paid."**
   - Keep onboarding tips (like the Contact rounds tip) to one line plus "Got it". Tradies skim.

---

## Part 2: Video concepts

### Concept A: "Down the Ladder" (product-led, animated) ✅ built
One phone, one job, start to finish in 30 seconds: missed call → text-back → lead card → quote → booking → paid. Kinetic captions carry the story so it works muted in a feed. The day-to-dusk background with the logo's sunrise at the end pays off "get your nights back".
- **Why it wins:** Every claim is shown, not told. It's cheap to update. It's honest (it's the real demo flow).
- **The hook:** It opens on the pain (a buzzing phone, then "Missed.") rather than a logo.

### Concept B: "Smoko" (narrative, user-led, live action)
Open on a real 3-person crew at smoko on a rural job site.
- The boss's phone buzzes in his hi-vis while his hands are full, and he lets it ring out. Cut to his wife at the kitchen table at 9pm, chasing quotes.
- Rewind with FieldBourne: the same missed call is texted back, booked by the apprentice from the ute, and invoiced before they pack up.
- Final shot: the boss at the footy on Saturday, phone face-down.
- **Trade-off:** It has more emotional pull, but needs a shoot, talent and releases. Best made once a real customer case study (TV Magic) can be the hero.

---

## Script: Concept A (29.5s, 9:16)

Tone: dry, warm, matter-of-fact Aussie (a mate who's been there, not a salesman). VO is optional because the captions tell the whole story.

| Time | Visual / B-roll | Voiceover (pace/tone) | Sound design |
|---|---|---|---|
| **0:00–0:02** | Cream field, teal hills, sunrise. A phone rises into frame buzzing: **Incoming call · 0412 555 018 · Frankston**. Caption: *On the tools. / Phone rings.* | *(quick, a little tense)* "On the tools. Phone rings." | Silence under a vibration buzz ×3. No music yet. |
| **0:02–0:05** | Call flips to **Missed call**. Red **"Missed."** slams in with a shake. Badge counts up: *1 → 2 → 3 missed calls today*. Caption: *Next tradie gets the job.* | *(flat, lets it land)* "Missed. And the next tradie gets the job." | Two-note falling "bloop"; soft ticks as the counter climbs. |
| **0:05–0:09** | Whoosh to the SMS thread. A teal bubble pops in: *"G'day! Sorry we missed your call, we're on a job…"* Tag: **⚡ Sent automatically · 8 sec**. Typing dots, then the customer replies: *"Burst pipe under the kitchen sink! 12 Smith St, Frankston."* Caption: *FieldBourne texts them back **in seconds.*** | *(relief, warmer)* "FieldBourne texts them back in seconds, so they wait for you." | Plucked acoustic guitar kicks in (C–G–Am–F, ~100bpm). Bright "sent" ping, then reply ping. |
| **0:09–0:14** | Push banner drops: **New lead: burst pipe**. The lead card fills row by row (customer, mobile, address, job, source) and a red **URGENT** pill pops. A **Call back within 29:52** ring ticks down. Caption: *No notes. No typing. / The lead fills **itself in.*** | "Their text becomes a lead: name, address, the job. Callback timer already running." | Notification triad; soft click per row. |
| **0:14–0:19** | Quote screen. A finger taps the **Emergency call-out · $220** chip, the line items and GST appear, then **Send quote by SMS → Quote sent ✓**. A card slides up: **Quote accepted · Signed by Sarah on her phone**. Caption: *Price list, one tap. / Quoted & **signed.*** | "One tap from your price list. They sign it on their phone." | Two taps; rising four-note success chime. |
| **0:19–0:23** | Tomorrow's calendar. The 8:00am **Sarah M. · Burst pipe** block drops in with a bounce. Ticks: **Confirmation SMS + calendar invite** and **Reminder the day before**. Caption: *Reminders sent for you. / **Booked.*** | *(beat)* "Booked. Confirmation and reminder sent for you." | Soft thud on the drop; two pings on the ticks. |
| **0:23–0:26** | The sky warms to dusk and the sun sinks behind the hill (clock 4:58). **Tax Invoice #1042** (ABN, GST incl.). Tap **Pay Now**, a green **PAID** stamp lands, and the button turns **Paid · $220.00 ✓**. Caption: *Invoiced & paid on site. / No admin at **9pm.*** | *(grin in the voice)* "Invoiced and paid on site. No admin at nine at night." | Tap, stamp thump, "ka-ching" shimmer. |
| **0:26–0:29.5** | The phone drops away. The logo's sun rises over the hill, and the **FieldBourne** wordmark pops. *Never miss a lead. Get your nights back.* Pulsing CTA: **Book a free 15-min demo**. Small: *by Fieldbourne Digital · built for Aussie tradies.* | *(warm, unhurried)* "FieldBourne. Never miss a lead. Get your nights back. Book a free demo." | Music resolves into a warm major chord swell with a final guitar strum. |

**Word count:** about 75 words, which fits 29.5s at a relaxed pace. Record the VO in a quiet room on a phone. A genuine local voice beats a polished announcer.

---

## Producing and editing the video

```bash
# one-off deps (not added to package.json)
npm i --no-save playwright-core ffmpeg-static
node marketing/video/render.cjs                 # → marketing/video/fieldbourne-30s.mp4
node marketing/video/render.cjs --stills 2.4,13.5  # PNG stills for review
```

- **Watch live:** open `marketing/video/fieldbourne-30s.html` in a browser. It loops, and a click restarts it.
- **Change copy, names or prices:** edit the HTML text. Scene timings live in `CAPS` and `renderPhone()`, and sound cues in `soundtrack.cjs`.
- **Audio:** `mix.cjs` builds the soundtrack from two files.
  - The voiceover is `audio/voiceover-blake.mp3` (ElevenLabs, "Blake"). It is cut into its 19 lines, sped up 7% with pitch kept, and each line is placed on its scene.
  - The music is `audio/music-sunshine-stomp.mp3` (Suno, 125 bpm). Its drop lands at 0:05, right after "Missed.", and it ducks under the voice.
  - The master is -14 LUFS.
  - To swap either file, keep the file name. If the new VO's pauses differ, update `LINES`.
- **Visual timing:** `WARP` in the HTML maps video time to scene time, so scene changes land on downbeats. The phone pulses on each beat and there's a white flash on the drop.
- **Licensing:** the Suno track needs to have been made on a paid Suno plan, and the VO on a paid ElevenLabs plan, for use in ads.
- **Before publishing:**
  - Swap in the real CTA URL.
  - Make sure the live app shell matches the ad's teal and sunrise (refinement 1).
