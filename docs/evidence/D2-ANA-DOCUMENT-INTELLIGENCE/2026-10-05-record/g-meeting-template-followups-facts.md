# g-meeting-template-followups — facts relied on

Step: follow-ups F17–F20 from the review of b3-meetings-dsur
(scratchpad `followups.md`; earlier facts in
`docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-04-depth/b3-meetings-dsur-facts.md`).

Checked 2026-10-05 by WebSearch. WebFetch and curl to fda.gov, regulations.gov,
federalregister.gov and govinfo.gov are refused by the egress proxy (curl:
`CONNECT tunnel failed, response 403` for each). So no regulator text was read
directly in this step. Anything seen only as a search engine's synthesis is
labelled **recall**, even when the synthesis cites a regulator URL.

## F18 — Type C meeting package deadline

| Fact | What was seen | Label in code |
|---|---|---|
| A Type C meeting package is due no later than 47 days before the scheduled meeting date (or the written-response date). | Three searches, checked 2026-10-05. An exact-phrase search for "no later than 47 days before the scheduled date" returned https://www.fda.gov/media/172311/download (2023 revised draft, finalized Aug 2026) and https://www.fda.gov/media/109951/download (Dec 2017 draft) as the top hits. The search engine's synthesis gave the sentence. Trade press (rhoworld.com, propharmagroup.com) agrees. The guidance text was not read. | **recall** (`PACKAGE_C`, the `packageDueBasis` of row C) |
| A Type C meeting requested as an early consultation on a new surrogate endpoint takes its package with the meeting request. | Same searches and synthesis. | **recall**. It is in row C's eligibility and in the request-letter guidance, marked recall. |
| If a Type C meeting is scheduled earlier than 75 days from receipt of the request, the package is due no sooner than 7 calendar days after FDA's grant letter. | One search synthesis citing fda.gov/media/172311. | Not encoded. It is unread and needs a third timing rule. |
| The reviewer's note that "regulator extracts disagree": every 2026-10-05 synthesis gave 47 days plus the surrogate-endpoint exception. The disagreement was probably that exception, read as the general rule. | Searches above. | The 47-day value is kept. AnA now says it is recall wherever she states it (`meetingPackageDeadline('C')`). |

Owed read: the Type C paragraph of the final Aug 2026 guidance (FR 2026-16452;
fda.gov/media/172311). Once it is read, row C's `packageDueBasis` becomes
`regulator-text` and the recall note goes away by itself, because the note is
derived from the basis.

## F17 — the generic meeting package

| Fact | Source | Label |
|---|---|---|
| A meeting request names the product (and application number if any), the proposed indication, the meeting type requested and why, the purpose and objectives, a proposed agenda, the questions grouped by discipline, the planned attendees and requested FDA disciplines, the suggested dates and the requested format. A meeting package carries the same identification, a regulatory history summary, the agenda, the questions with the sponsor's positions, and the supporting data organised by discipline. | FDA formal-meetings guidance, from memory. Not re-read on 2026-10-05. | **recall** (`MEETING_CONTENTS_RECALL` on every `FDA_MEETING_PACKAGE_CORE` component) |
| Packages go with the request for Type A, Type D and INTERACT. For Type B, B(EOP) and C the package is a separate, later submission. | `FDA_FORMAL_MEETING_TIMELINES` (b3-meetings-dsur facts: regulator-text for A, B, B(EOP), D, INTERACT; recall for C). The request-letter guidance is generated from the table. | as in the table |
| FDA does not call INTERACT a "Type". | FDA's own naming in the guidance title list ("Type A … Type D, and INTERACT meetings"), from memory | **recall**. It affects wording only (`meetingTypeName`). |

## F20 — per-section word targets

| Fact | Source | Label |
|---|---|---|
| FDA's formal-meetings guidance gives no per-section word or page length for a meeting package. | Search, checked 2026-10-05. The fda.gov results (media/172311, media/182246 workshop Q&A) report no per-section figure. The only figure is a whole-package best practice of about 50–100 pages (CBER, workshop Q&A, search synthesis). | **recall**. It is not encoded: it is not per section, and not in the guidance. |
| ICH E2F gives no per-section length. It asks that the executive summary be "concise". | Search, checked 2026-10-05: https://database.ich.org/sites/default/files/E2F_Guideline.pdf ; the EMA-hosted E2F. The synthesis found no numerical limits. | **recall** |

Decision: no `targetWords` is restored on any meeting or DSUR template section,
because none is sourced. This is pinned by the F20 test, which a mutation shows
failing (see `g-meeting-template-followups-green.txt`).

## F19 — the IND annual report test

There is no regulatory fact here. The red evidence is the replacement check run
against the code before b3-meetings-dsur. Its DSUR `detectionPatterns` at
`1275c890^` were `/\bdsur\b/i`,
`/\bdevelopment\s+safety\s+update\s+(?:report|annual)\b/i`,
`/\bannual\s+(?:safety\s+)?report\s+(?:to\s+fda|for\s+ind)\b/i` and
`/\find\s+annual\s+report\b/i`. The last one begins with a form feed, so it is
dead. The script (`f19-old-red.mjs`, its text at the end of `g-meeting-template-followups-red.txt`) applies the test's predicate
(a pattern is dead if it matches none of the requests written for it,
lower-cased). It reports that one pattern dead and exits 1. The old test passed
on that same code.

Still open, and owned by `g-periodic-chat-copies` (B4): "draft the annual report
for our IND" and "annual safety report to FDA" still reach the DSUR template
through the third pattern. The DSUR instructions say a DSUR may serve 21 CFR
312.33. That step adds the template derived from lifecycle `ind_annual_report`.
