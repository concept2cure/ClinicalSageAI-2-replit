# P-122 · Quality: what was hidden comes back, and what was built is reached (2026-11-10)

Founder decision P-122 (`docs/LAUNCH_DEFINITION_OF_DONE.md`), item 3.6 ("then Vault, Submission Center, Quality and
Reporting, from theirs"). The findings come from the inventory `docs/evidence/DESIGN/P-122/inventory/qms-reporting-device.md`
(headline 1, 2, 4 and 5; capability table Q1–Q4 and D8; §3 Quality/QMS). Packages: D7 (Quality's own files) and R1
(reach: the server and the device screen). Each item was red first; its red and green output is filed here.

## What already exists (RULE 3)

| Piece | Path | What it does today | What it does not do |
|---|---|---|---|
| Quality's scope | `client/src/concept2cure/quality/registerContext.ts` (`useQualityScope`, `setQualityWide`, `scopedPath`) | Since `e39cc0d59` (C14, 08:42 today, session `01GyGhjgjrNv…`, the Quality/training lane), a project open in the shell narrows documents, changes, CAPA and nonconformances to `?program_id=`; "Show the whole organisation" widens. | Read the organisation by default: with a project open (the shell keeps one for the session) the SOP register showed only that project's documents. |
| The server's project admission | `server/routes/mdx-qms-context.ts` `queryProject`, `capaMdr.service.ts` `visibleCapaPrograms` | Admits `?program_id=` only for this organisation's live project: 404 for another's, 422 for a malformed id. | — (unchanged here) |
| The register rows | `quality/SopRegisterRow.tsx` (`nextStepOf`, `actionsOf`, `RegisterBody`), `quality/QmsRecords.tsx`, `quality/ChangeControl.tsx` | Each row shows one next step and "More"; every action and its handler is kept behind More (`606a9a302`, `ea1d59957`, `33682ac65`). | Show the governed actions that fit the row's state where a person sees them. |
| Quality's figures | `GET /api/mdx/qms/readiness` (`server/routes/mdx-qms.ts:236`), `GET /api/mdx/qms/changes/summary`, `GET /api/mdx/qms/documents/review-due`, `GET /api/capa-mdr/triage` | Server-computed counts: documents in force and overdue for review, suppliers, expired acknowledgements, open audits, undispositioned nonconformances; the change summary; the review schedule; the open CAPA/complaint/MDR queue with server-computed overdue. | `/qms/readiness` has had no caller since `4aa204390` and is refused in production (`LAUNCH_EXCLUDED_API`, "DEAD"). Each register says its own figures as a sentence; nothing says the system's at a glance. |
| Post-market surveillance | `server/routes/mdx-postmarket.ts`, `client/src/concept2cure/mdx/surfaces/PostmarketSurface.tsx`, `mdx/hooks/usePostmarket.ts` | Reads signals (`vigilance_events`) and CAPAs for the whole organisation. The screen hides its signal, CAPA-board, trend and PMS panels (`SURVEILLANCE_KEYED_TO_PROJECT = false`, since `10bbeeeea`). | Take a project. |
| Complaints, MDR events, vigilance | `server/routes/capa-mdr.ts` (`/complaints`, `/mdr-events`, `/vigilance`), `server/services/capa-mdr/capaMdr.service.ts` | Intake, lifecycle and reporting clocks, tenant- and project-access-checked, audited. Claimed by `device-postmarket` (`shared/constants/ui-surface-registry.ui-v2.ts:476`), so launch scope admits them in production. Reached only by AnA (`server/services/ana/capaMdrTools.ts`) and the CER's read-only complaint list. | Any Quality screen. |

Searches run: `registerContext`, `quality=organisation`, `useQualityScope`; `nextStepOf`, `RegisterBody`, `primary=`;
`qms/readiness`, `changes/summary`, `review-due`, `triage`, `Kpi`, `figures`; `SURVEILLANCE_KEYED_TO_PROJECT`,
`/api/mdx/postmarket`, `usePostmarket`, `meta.scopes`; `/api/capa-mdr/complaints`, `mdr-events`, `vigilance`,
`useCerPmsFeeds`, `capaMdrTools`; `git log --all --diff-filter=D` on `Kpi.tsx`, `Complaint*`, `Mdr*`, `Vigilance*`.

## Item 1 — Quality reads the organisation by default

**Who made `e39cc0d59`, and why.** A Claude session of the Quality/training lane (`01GyGhjgjrNv…`, D7 sweep item C14,
QP3 of `docs/design/QMS_IN_PROJECTS_2026-10-30.md`). Its reason: with a project open, Quality listed the whole
organisation's records "under no word of whose they were", and AnA was told counts with no owner. It added no server
access or tenant check: the four list routes already admitted `program_id` through `queryProject` (404 for another
organisation's project). It also defaulted a new nonconformance to the open project.

**What changed.** `registerContext.ts` inverts the default: Quality reads the organisation, with a project open or not.
`?quality=project` narrows the four project-kept registers to the open project; the header's one quiet ghost button
("Show {project} only" / "Show the whole organisation") toggles it, and a reload keeps it. A link written under C14
(`?quality=organisation`) still reads the organisation.

**Kept from C14.** The header says whose records it lists ("The whole organisation's quality records." with a project
open); a narrowed register's empty state names the project; AnA is told the scope; the server's `queryProject`
admission is unchanged and still the only door to `program_id`; a new nonconformance still defaults to the open project.

- Red (`item1-red.txt`): 2 of 19 fail at HEAD — the new default reads `program_id` and the header names the project.
- Green (`item1-green.txt`): Quality's 28 suites and AnA's wave-4 suite, 29 files, 374 tests. Five existing cases that
  encoded the project default now narrow first (`?quality=project`); their assertions are otherwise unchanged.

## Item 2 — each row's governed actions are inline

**What changed.** A row shows, inline, the two governed actions that fit its state, then Ask AnA as a quiet 16 px spark
icon (its name, "Ask AnA about this document/change/record", for assistive technology), then "More" for the rest. All
are §2 ghost buttons (`btn ghost small`: 8 px radius, 32 px). The handlers are the register's own, unchanged; More
still reveals the rest in the row, not in a menu.

| Register | State | Inline | Under More |
|---|---|---|---|
| Controlled documents (`SopRegisterRow.tsx` `inlineOf`) | Draft | Send for review, Open | Training, History |
| | Under review, the approver's turn | Approve, Review route | Open, Training, Revise, History |
| | Under review, its author | Review route, Open | Training, Revise, History |
| | Effective, review overdue | Record review, then Read and acknowledge (or Revise) | the rest |
| | Effective, with training | Read and acknowledge, Revise | Open, Training, Record review, Retire, Controlled copy, History |
| | Effective, no training (a form) | Revise, Controlled copy | Open, Record review, Retire, History |
| | Superseded or retired | History, then Controlled copy of a version in force, or Revise | Open |
| Change log (`ChangeControl.tsx`) | any | the first two of Approve, Advance, Edit assessment, Link a record that apply | the others |
| CAPA and the record registers (`QmsRecords.tsx`) | any | the first two acts the configuration shows for the row's state | the others (no More when none) |

Retire stays under More on purpose: it is the terminal state, signed, and rare; a row's inline actions are the ones a
person takes in that state.

- Red (`item2-red.txt`): 11 of 61 fail at HEAD (the new `registerRowInline.test.tsx`, 8, and the three register
  contract tests, rewritten to the new contract).
- Green (`item2-green.txt`): Quality's suites, AnA wave-4 and the SOP read-honesty suite, 31 files, 385 tests. Three
  cases that clicked an action through More were scoped to their row or opened More first.

## Item 3 — the register figures, one quiet line of the server's numbers

**What changed.** `quality/QualityFigures.tsx` puts one line of text directly under Quality's header, on every tab, in
the register sentences' style (`p.sec-sub`): no tiles, no cards (§2's no-tile rule stands). A number takes a status
colour only when it is overdue or unapproved. Every number is computed by the server, from four reads:

| Figure | Server source |
|---|---|
| documents in force | `GET /api/mdx/qms/readiness` → `documents.effective` (the version in force, `in-force-release.ts`) |
| due for review within 120 days (n overdue) | `GET /api/mdx/qms/documents/review-due?within=120`: the server's review schedule and its `overdue` flag (the Periodic review section's window) |
| open changes (n past their implementation date) | `GET /api/mdx/qms/changes/summary` → `open`, `overdueImplementation` |
| open CAPAs (n past target close) · open complaints · MDR reports overdue | `GET /api/capa-mdr/triage?open_only=true&limit=500`: the server's open queue and its `overdue` flags; at the 500 cap each count is said as a floor ("500+") and a zero is not said |
| nonconformances awaiting disposition · critical suppliers not approved · open internal audits (n major findings) · lapsed acknowledgements | `GET /api/mdx/qms/readiness` → `nonconforming`, `suppliers`, `audits`, `training` |

**Left out, because no server read computes them:** documents under review (readiness counts in force, under
revision, overdue and draft, and its "draft" is everything not in force); open deviations; management reviews; and
acknowledgement coverage, which the SOP register's training section already states from the server's summary.

**Honest states.** While nothing has answered: "Reading the quality figures…", no number. A read that fails, or a
readiness block the server marks `available: false`, is named ("Not read: change control; CAPA, complaints and MDR
reports.") with "Read the figures again", and none of its figures is shown, never as zero. Narrowed to a project, the
line begins "Organisation-wide · ".

**Reached (R1).** `GET /api/mdx/qms/readiness` had no caller since `4aa204390` and production refused it as dead
(`LAUNCH_EXCLUDED_API`). It is now served under Quality's existing claim on `/api/mdx/qms`, unchanged: the request's
RLS executor (`qmsClient(req)`) and `organization_id = $1`, as every Quality read. The other three reads were already
served (`device-postmarket` claims `/api/capa-mdr`). Its tenant isolation with RLS on is in item 4's DB test.

- Red (`item3-red.txt`): the figure-line suite cannot load (no `QualityFigures.tsx`), the header test finds no line,
  and the launch-scope test finds readiness excluded as dead.
- Green (`item3-green.txt`): 55 files, 997 tests (Quality, entitlements, the readiness route); `ci:launch-scope-api`
  reports nothing of Quality's (its one finding, `/api/cmc-changes`, is the CMC lane's); `ci:sql-interpolation` OK.
