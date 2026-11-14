# Project Data Room selection across search and pages

Plan: F1. Audit and bounded repair of the existing project-to-AnA and editor
source handoffs. The original audit below precedes implementation; dated
continuation receipts distinguish the checks actually completed.

## What already exists

- `client/src/concept2cure/v2/surfaces/ProjectHome.tsx` owns Data Room pins. Its lifecycle-refresh effect intersects every selected ID with the current page's groundable rows. A search or page change therefore silently removes a selected source that simply is not in that response. Its AnA handoff and `DataRoomBuildAction` also resolve selections only against the visible page, so deleting the pruning effect alone would leave off-page actions unusable or relying on stale facts.
- `surfaces/projectSources.ts` owns the existing `SourcesPage`, URL builder and `sourceCanGround` predicate. The list already returns current/data eligibility, retained-data and processing facts. Original-file availability is separate from retained-data eligibility.
- `ProjectHome` keys its workspace by selected project and account/session owner, retires local state on owner change, and clears the cross-surface `C2C_SOURCE_PINS`. `dataConnect.tsx` owns current read visits. Any delayed selection read and action must preserve these owners and the existing shell-project/session guards, including A-to-B-to-A retirement.
- `editor/SourceAssemblyDialog.tsx::SourceAssemblyAction` validates selector identity and the existing five-source assembly limit. `useSourceAssemblyTarget.ts` checks the current target-document inventory; it does not freshly admit the selected sources. Actual source verification occurs in the saved editor's assembly preview/build. A manufactured editable target/template is not an appropriate preflight for ProjectHome.
- `server/routes/c2c/projects.ts` already exposes `GET /api/c2c/projects/:id/sources`. `data-room-search.ts::parseDataRoomQuery` and `searchDataRoom` own its searched/paged projection. There is no exact-ID filter in that HTTP contract. Walking the entire catalogue to validate a few selected IDs would unnecessarily repeat Quality-heavy catalogue admission.
- `source-read-access.ts::getCurrentReadableSourceScope` already accepts `{ organizationId, userId, programId, sourceIds }`. Exact selection requires every requested identity, current recorded-parent admission, native record freshness and a final access-scope check. `requireSourceReadScopeStillCurrent` rechecks the recorded scope. These existing facades should remain the read owners; no parallel source reader is needed.
- Existing authoring exact-source readers in `authoring-assembly-sources.ts` and their assembly preview routes require a saved editable target and template. Workflow import preview is for workflow imports; binary import is a governed write. CSR Vault preview accepts a Vault document and recorded digest, rather than Data Room identities. None supplies a generic project-only exact Data Room read to reuse unchanged.
- Existing tests in `projectHomeDataRoom.test.tsx` cover same-page pin handoff and page display; `projectHomeSourceReadScope.test.tsx`, `projectDocumentDisposition.test.tsx` and `projectHomeOwnershipBoundary.test.tsx` cover read failure, withdrawal, retained data and ownership retirement. They do not prove pin survival across search/page changes. Existing server route/read tests already exercise project access and native-record admission.

Searches covered the current project route, authoring import/assembly routes and transports, source admission/projection helpers, selected-source design ownership and relevant tests. Deleted-history searches found no retired exact project-selection route or alternate pin owner. The old Project surface coordination hold is explicitly marked stale; Tasks/P131 remains outside this audit. Concurrent catalogue receipt work remains owned by the lead's other implementation session.

## Proposed completion contract

Extend the existing `GET /api/c2c/projects/:id/sources` contract with `?sourceIds=11,22`, retaining the same page shape. An explicitly present filter must contain one to twenty distinct, positive decimal PostgreSQL integer IDs (maximum 2147483647); reject blank, repeated/array-shaped, duplicate, malformed or oversized input. Twenty is the existing AnA selected-source admission ceiling; preserve the separate five-source editor assembly refusal. Reject combining exact IDs with `q`, `status`, `kind`, `from`, `to`, `current`, `scope`, `project`, `study`, `ctd`, `folder`, `limit`, `offset` or `includeUnscoped`. Exact mode must never silently widen, truncate or hide lifecycle rows through other list filters.

Pass the exact IDs into both canonical scope admission and the existing SQL projection. Do not enumerate every project source or run whole-project Quality synchronization for this exact read: native selected records must pass their existing currentness admission. Preserve the route's current project and actor checks and its end-of-read scope recheck. Require a verified exact response for the captured project and the entire requested set; no missing, duplicate, unrelated or wrong-project identity qualifies as partial success.

Retain deliberate selections across searches/pages in the existing Data Room owner, carrying the source selectors/checksums the person actually checked rather than silently substituting a newer version. Refresh facts for that exact selected set before an action, compare them with those checked identities, and refuse missing, changed, wrong-scope, ineligible or unverified results. A failed/pending read must deliver neither source pins nor an AnA ask; explicit selection is all-or-nothing. An actor/session, project visit or selected-set change retires every delayed response/action, including A-to-B-to-A transitions. Use the existing read-visit, captured session and shell-project guards; do not persist a second selection channel. Preserve existing action limits and refusal messages rather than silently truncating explicit choices.

The first behavioral red case should select source A, search/page to B, retain A, select B, and verify exact A+B handoff after the current exact read. Repeat search and pagination separately. Green acceptance also requires selecting/unselecting while the exact read is delayed, retained readable data with unavailable original bytes, withdrawal/replacement/hash change, failed or malformed exact responses, actor/session/project retirement and delayed A-to-B-to-A refusal. Verify saved exact selectors reach the existing editor chooser without a borrowed target or a silently changed checksum. Server tests should prove strict filter parsing and all mutual exclusions, exact-ID admission/projection, no unrelated Quality catalogue scan, wrong-project/missing/native-stale refusal and the final access recheck. No provider call is needed.

## Audit outcome

The selection-loss defect is confirmed from current source and independently checked. No production source, existing test, route, rule, plan or gate was changed for this audit; no tests or broad compiler/build were run. This is a static finding, not an executed repair. Implementation is intentionally unclaimed pending the lead's bounded contract and non-overlapping source ownership. This turn's selected implementation remains the separate catalogue native-scope receipt repair.

For the next Copilot/Codex session, start with the existing owners above: `ProjectHome.tsx`, `projectSources.ts`, `projects.ts`, `data-room-search.ts` and `source-read-access.ts`, plus their existing behavioral/route/native-reader tests. Read current coordination first and wait for the catalogue owner to release overlapping server files. Extend those owners within F1; do not change the design plan, its ledger, rules or gates.

## Implementation continuation — 2026-11-13 23:58 UTC

Following source publication `5a552f142`, the founder requested "Fix all".
The latest canonical checkout has no overlapping active hold on the named
selection paths. The preceding proposed completion contract is now the bounded
F1 repair contract. Separate server/client workers own the existing files named
in the coordination record; root owns integration, evidence and publication.
Behavioral regressions must fail before changing runtime source. Implementation,
tests and final acceptance remain unclaimed until their actual receipts below.

### Server completion — 2026-11-14

The existing parser/search owner now admits an exact `sourceIds` request through
the canonical selected-source facade, requires the entire verified identity set,
and projects only those admitted IDs. Native currentness and the final access
recheck remain in place. Exact reads do not synchronize the whole Quality
catalogue. Strict parsing rejects malformed, duplicate, oversized, repeated,
array/bracket/dotted identities and every conflicting list filter. The existing
GET route already returns recorded top-level and row `projectId`, so its source
did not need a change. No reader, route, tool or service was added.

Behavioral RED precedes runtime changes: 41/55 route cases and 14/44 native
projection cases failed; later defensive regressions separately proved 4/4
incomplete-admission failures and 9/9 literal array/dotted-query failures. The
final four-suite set passes **128/128**, zero skips: route64, native projection48,
processing3 and admission13. Strict changed-file lint passes with zero warnings.
[`server-verification.json`](server-verification.json) binds source/log hashes,
commands and counts; `server-*.txt.gz` retain actual failing/passing output.
Client and whole-checkout verification follow separately; no provider call or
hosted-Codespace acceptance is implied by these server checks.

### Client completion — 2026-11-14

The existing Data Room now retains checked IDs and their recorded SHA-256
across searches and pages. AnA and the existing document chooser receive
the complete selection only after its fresh exact response confirms every
recorded parent, checksum and eligible lifecycle. Malformed, partial, changed,
withdrawn and unreadable selections refuse the action. Account/session/project
visits and selection changes retire delayed reads, including A-to-B-to-A and
late JSON bodies. Upload/refresh changes abort the pending attempt and permit
an explicit retry. Successful editor ownership survives intentional navigation
into the existing receiver; pending reads do not.

The original implicit ten-newest action, twenty-source explicit AnA limit and
five-source editor limit remain. Retained readable data does not require the
original binary. The six existing client suites pass **155/155**, no skips,
after the initial three behavioral failures and a later pagination regression.
The latter exposed the old initial/no-op search timer resetting a later page;
the timer now runs only when the trimmed search changes. Existing compatibility
fixtures now return the exact response and await the handoff, preserving their
original outcome assertions. Independent read-only lifecycle review found no
concrete blocker. Root's final validation-helper extraction preserves the
six-warning baseline: lint has zero errors and zero new warnings.

[`client-verification.json`](client-verification.json) binds final source/test
hashes and counts; the adjacent compressed reports retain actual red/green and
lint evidence. The disjoint server/client focused total is **283 passing**.
Whole-checkout build/compiler/publication receipts follow separately.
