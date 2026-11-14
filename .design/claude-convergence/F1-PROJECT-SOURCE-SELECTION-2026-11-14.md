# Retain and verify the project's selected Data Room sources

F1 / W1 / D2. Existing project-to-AnA and project-to-editor handoffs, at
`5a552f142` on canonical `concept2cure-v2`.

## What already exists

The published audit `docs/evidence/F1/2026-11-13-project-source-pin-read-audit/README.md`
describes the confirmed defect and bounded completion contract. Rechecked at
this checkout: `surfaces/ProjectHome.tsx` prunes pins against the visible page
and resolves both handoffs from that page. `surfaces/projectSources.ts` owns
the existing page, eligibility predicate and URL. `editor/SourceAssemblyDialog.tsx`
owns the existing source-driven document start and its five-source limit.
AnA's explicit-selection ceiling is twenty sources; the existing automatic
newest-source fallback remains ten. Original-file availability
and retained readable data are separate facts.

`server/routes/c2c/projects.ts` exposes the existing GET sources route, returning
`projectId`, rows and paging metadata. `data-room-search.ts` parses and projects
the current page. `source-read-access.ts` already admits exact `sourceIds` and
rechecks their current scope. Reuse those owners; no new route, source reader,
editor, selection store, provider or table is needed. The current project/session
and shell-visit helpers already retire delayed reads. Existing project Data Room,
ownership, disposition, route-window and native source tests are the regression
homes. Deleted-history searches found only retired generations, not a replacement.

The old Project-page holder is explicitly described as stale in coordination;
the separate native Quality scope ended on its canonical publication or at
2026-11-14 00:00 UTC. Source-access and unrelated task/Quality files remain read-only.

## Completion contract

Extend GET `/api/c2c/projects/:id/sources` with exact `sourceIds=11,22`:
one to twenty distinct positive decimal PostgreSQL integers, no duplicates,
arrays, blank/malformed values or overflow. Reject combining it with any of
`q,status,kind,from,to,current,scope,project,study,ctd,folder,limit,offset,includeUnscoped`.
Keep the existing page response. Exact reads additionally carry
`selection: { scope: 'verified-accessible-sources', sourceIds: [...] }` containing
the complete admitted set, plus the existing captured `projectId`. Reject any
missing, duplicate, unrelated or wrong-project result. Apply exact IDs to both
canonical admission and SQL projection, retain final scope checks, and never
scan/synchronize the whole Quality catalogue for a small exact selection.

Retain checked identities/checksums across search and page changes in the existing
Data Room owner. Before a pinned AnA or editor action, freshly verify all selected
identities against the exact response, including readability and original checked
checksums. Do not substitute a newer identity/digest or silently truncate explicit
choices. Failed, pending, changed, unverified or retired reads publish no pins,
ask or editor start. Preserve existing explicit lifecycle-withdrawal behavior;
absence from a page is not evidence of withdrawal.

Retained off-page selections also need deliberate recovery when a source is no
longer available to render. Reuse the existing small-button treatment for Clear
selection in the same action row; clear local/global pins and retire the selected
set epoch, without automatically substituting another source or dispatching work.

Actor/access/session, project visit and selected-set changes retire delayed
results/actions, including A-to-B-to-A changes. Use existing guards. Preserve
the twenty-source explicit AnA and five-source assembly limits, the ten-source
automatic fallback and existing refusal wording.
Retained readable data remains usable when its original bytes are unavailable.
The canonical project page, Data Room table, existing controls and single editor
are the UI; no layout or styling change is proposed.

## Ownership and verification

Client worker: only ProjectHome's DataRoom/selected-source actions,
`projectSources.ts`, existing Data Room/source-read/disposition/ownership tests
and a focused selection test if needed; the existing editor entry test's
ProjectHome sources-response fixture also receives the exact attestation,
with its chooser/target assertions preserved. Server worker: only existing sources
GET in `projects.ts`, `data-room-search.ts`, existing route/query/native tests
and focused exact-selection tests. `source-read-access.ts` remains unchanged.
Root owns this design/evidence/coordination, Git and every test/compiler/runtime/
browser job. Workers author red cases first and do not run jobs or Git.

Prove search and pagination separately, exact identities/checksums reaching AnA
and the existing editor chooser, and negative cases for failed/malformed reads,
withdrawal/replacement/hash changes, source-set/actor/project retirement and ABA.
Server cases cover strict parsing, mutual exclusions, exact admission/projection,
wrong/missing/stale sources and final rechecks without whole-catalogue work.
Use the actual local app for the manual selected-source/editor flow. No provider
call, model qualification, scientific approval or submission is part of this repair.
