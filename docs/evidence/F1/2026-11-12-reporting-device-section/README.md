# F1 · Reporting: the device section under a biotech project (2026-11-12)

**Package:** F1. **Session:** the reporting session (`session_011HLkYC…`, lane L11). **Finding:** S12 biotech sweep,
finding 94 (`docs/evidence/SPINE/S12/2026-11-09-biotech-sweep/defects.json`, by position), routed here by the
coordinating session: "A biotech IND project's Reporting page shows device-only analytics and a wrong module number".
The CSR lane's map of 2026-11-12 reported the same block.

## Re-checked in the running app first

On the rebuilt demo database (seven projects, one of them a device project), with C2C-101 open (a biotech IND):
`before/probes.json`, `before/biotech-1440-light-section.png`, `before/biotech-390-light-section.png`.

1. Below C2C-101's packs and reports, the page showed "Device projects: 1 device project you can open", with nothing
   to say the figures were not C2C-101's.
2. "Submission pace: 0 submitted in the 24 months to 2026-11", then 24 cells of raw `2024-12 0` keys, every zero as
   heavy as a month with a submission would be.
3. The biotech pack was labelled "Nonclinical & CMC readiness". It holds the nonclinical study register and the
   audit assurance pack, for Module 4. No pack holds a CMC report.

## What already exists (RULE 3)

| Piece | Path | What it does | What it did not |
|---|---|---|---|
| The device read | `server/services/report-os/device-portfolio.ts` `readDevicePortfolio` | Counts the device projects the reader can open by recorded status, paces recorded submissions over 24 months, rates AnA drafts. "Device" is the Projects MDX filter's classification | Did not know which project was open |
| The overview | `server/routes/insights-canvas-routes.ts` | Carries the read as `device`, on the request's own connection | — |
| The section | `client/src/concept2cure/v2/surfaces/InsightsDevicePortfolio.tsx` | Draws the payload; a failed read is said; no device project, no section | Printed the month keys as stored |
| Where it sits | `surfaces/Insights.tsx` (`deviceSection`) | On the Report tab's landing, with or without a project open (fold F4, decision P-61 item 3) | — |
| The pack | `surfaces/Insights.tsx` `RO_PRESETS.biotech` | Two reports, purpose "For confirming Module 4 is submission-grade." | Its label named CMC |

Nothing new was added: no screen, route, table or service.

## What changed, and what did not

**The section is not withdrawn under a biotech project.** The sweep (2026-11-09) proposed drawing it only with no
project open or a device project open. Decision P-122 (2026-11-10) came after: no session hides a metric a screen
showed without a founder decision. So the section stays where it was and says whose figures it shows. Whether to
withdraw it under a non-device project is the founder's call, recorded below as open.

1. **It says when the open project is not counted.** The read is told which project leads the canvas and answers
   `openProjectCounted` from the rows it already read, so the claim is the server's and uses the one classification.
   With a project it did not count open, the section adds: "C2C-101 is not counted in these figures, which cover
   device projects only." With a device project open, or none, or a project that does not lead, it adds nothing.
2. **Each month is named.** "Sep 2026" in the grid (the stored key kept in `<time datetime>`), "November 2026" in the
   sentence. A key that is not a month is shown as the record holds it.
3. **All 24 months stay listed.** A month with no submission is set in `--text-300` (5.2:1 light, 6.8:1 dark, measured
   in `after/probes.json`); a month with one keeps `--text-100` and a heavier figure.
4. **The pack is "Nonclinical readiness pack".** The header button reads "Build the Nonclinical readiness pack".

Also in this push, its own commit: two cases of `reportingContextIntegrity.test.tsx` failed on trunk since my catalog
wording change of this morning (`6476548f9`), which gave the Data scope filter the card's words, so "Organization-wide
records" was found twice. I had run the `insights*` files and not the `reporting*` ones. The cases now tell the
card's disclosure from the filter's option, and `green.txt` runs every client test file that reads a Reporting screen
(64 files), found by search, not by name.

## Red first, then green

| File | What it shows |
|---|---|
| `red.txt` | Before the change: 13 of 66 fail across the four files (the month words, the quiet zero months, the not-counted line on the section and on the canvas, the pack label, the read's `openProjectCounted`, the route passing the lead) |
| `green.txt` | After: 64 client files, 694 of 694; 97 Reporting server files, 1,211 of 1,211 |

## In the running app, after (`after/`)

RLS and launch scope enforced, signed in as the demo owner, 1440×900 and 390×844, light and dark (`walk.cjs`;
`after/probes.json` holds what each page read). No page error and no horizontal overflow in any of the twelve.

| Open project | The section |
|---|---|
| C2C-101, a biotech IND | Stays, with "C2C-101 is not counted in these figures, which cover device projects only." (`biotech-*`; the whole page in `biotech-1440-light-page.png`) |
| NEUR, the device project | No such line (`device-1440-light-section.png`) |
| None | No such line (`none-1440-light-section.png`) |
| NEUR, with a submission recorded on 2026-09-14 for the shot and removed after | "1 submitted in the 24 months to November 2026."; Sep 2026 stands out, 23 months are quiet (`device-with-a-submission-*`) |

The server's answer for each, read from `GET /api/insights-canvas/overview`: C2C-101 and LMN-201 `openProjectCounted:
false`; NEUR `true`; no project open, the field absent.

## Open, for the founder

Should the device section be withdrawn from the Reporting landing when the open project is not a device project? It
would still show with no project open and under a device project. P-122 makes that the founder's decision, so it was
not taken here.
