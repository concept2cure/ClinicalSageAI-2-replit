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

## Item 4 — the Post-market surveillance panels, read for the project

**What changed, server (`server/routes/mdx-postmarket.ts`).** `GET /api/mdx/postmarket` takes `?program_id=`. A named
project is admitted as Engineering admits one (P-60, `mdx-engineering.ts`): `getCurrentAccessibleProgramScope` on the
request's RLS executor, then `requireProgramScopeStillCurrent` after the reads. So:

| Request | Answer |
|---|---|
| a member, their organisation's project | 200, that project's signals and CAPAs only, `meta.scope: 'program'` |
| another organisation's project (either way round) | 404, no body data |
| a private project the member is not shared on | 403, no body data; its owner reads it (200) |
| a malformed id | 422, nothing read |
| no `program_id` | 200, `meta.scope: 'organization'`: the projects the caller can open, never another organisation's |

The last row also closes a gap the DB test found: without a project the read returned every project of the
organisation, a private project's signals and CAPAs included, to any member. It now returns the projects the caller
can open, as Engineering's and the CAPA register's reads do.

**What changed, client.** `usePostmarket(programId)` asks for the open project and reports the server's `scope`.
`PostmarketSurface.tsx` drops `SURVEILLANCE_KEYED_TO_PROJECT = false` (since `10bbeeeea`): the signal triage queue,
the CAPA board, vigilance trending and PMS plan execution are drawn when, and only when, the server says the rows are
this project's. Each panel's DataGate says loading, a failure with Try again, or empty; an answer that does not say
`program` keeps the old "Shown once this screen reads this project's records" notes. Trends and PMS plan execution
still have no store, and their panels say so ("not yet computed", "not yet tracked"), not that the project has none.
The host's banner (`MdxSurfaceHost.tsx`) says the clocks, signals and CAPA board are this project's.

- Red (`item4-red.txt`): the DB test, 5 of 11 fail at HEAD (no `meta.scope`; another organisation's project, a private
  project and a malformed id all answered 200 with the whole organisation's rows); the client suite, 3 of 4 fail (no
  `program_id` asked; panels hidden; a failed read not said).
- Green (`item4-green.txt`): the DB test 11/11 as `app_service` with `RLS_ENFORCE=on` on a provisioned database
  (`c2c_p122q`); the MDX client suites and the route unit test, 106 files, 1,046 tests; `ci:sql-interpolation`,
  `ci:tenant-resolvers`, `ci:unkeyed-request-tables` OK.

The same DB test proves the reads items 3 and 5 rely on: `GET /api/mdx/qms/readiness` answers each organisation's
member with that organisation's counts only, and refuses no session (401); `GET /api/capa-mdr/complaints`,
`/mdr-events` and `/vigilance` answer a member with their organisation's records only, and refuse another
organisation's project (404).

## Item 5 — a Complaints and MDR tab in Quality

**What changed.** Quality gains one tab, "Complaints and MDR", beside CAPA, over the existing `/api/capa-mdr` routes.
It is a tab of the existing Quality screen (`QMS_RECORD_TABS`), not a screen: no `UI_SURFACES` id, no `SURFACE_VIEWS`
entry, no mount, no table; `ci:one-design-plan` agrees (below). It renders two registers from the existing register
kit (`qmsRegisterKit.tsx`), configured in `quality/qmsComplaintRegisters.tsx`:

| Register | Reads | Writes (each the server's audited route) | Row detail |
|---|---|---|---|
| Complaints | `GET /api/capa-mdr/complaints` (the organisation's; `program_id` when narrowed) | Record complaint (`POST /complaints`, in the open project, every event fact chosen, never defaulted, since the server refuses an unstated one); Move (`POST /complaints/:id/transition`, only the server's next states, with a reason); Record MDR decision (`POST /mdr-events`, in the complaint's project, linked to it) | its vigilance timeline (`GET /vigilance?program_id=&entity_type=complaint&entity_id=`) |
| MDR and vigilance reports | `GET /api/capa-mdr/mdr-events` | Record MDR decision; Move (`POST /mdr-events/:id/transition`, with report numbers when filed) | its vigilance timeline |

The preliminary reportability column is the rules engine's, computed at intake ("FDA: reportable · EU: not
determined"): an unstated fact is said as not determined, never read as no. "Overdue" on an MDR report is the server's
rule (due day passed, not filed). AnA is told both registers as one context, and a failure of either read as a
failure. `quality.open-tab` (`shared/navigation/surface-actions.ts`) takes `complaints`, so AnA and a notice can open it.

**One lifecycle copy.** The complaint and MDR lifecycles moved from `server/services/capa-mdr/stateMachine.ts` to
`shared/constants/capa-lifecycle.ts`, as the CAPA lifecycle did; the server enforces, and the register offers, the same
map.

**Production.** The routes were not refused: `device-postmarket` claims `/api/capa-mdr`
(`ui-surface-registry.ui-v2.ts:476`) and is a launch surface, so the verdict for `/complaints`, `/mdr-events` and
`/vigilance` is `launch` (checked with `launchScopeApiVerdict`). Nothing was admitted. Item 4's DB test proves, as
`app_service` with RLS on, that a member reads their organisation's complaints, MDR events and vigilance timeline (200)
and that another organisation's project is refused (404) with no rows.

- Red (`item5-red.txt`): 10 of 10 fail at HEAD.
- Green (`item5-green.txt`).
