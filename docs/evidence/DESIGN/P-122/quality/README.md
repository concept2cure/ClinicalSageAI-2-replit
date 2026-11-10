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
