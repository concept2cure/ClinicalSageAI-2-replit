# Complete ownership and uncertain-save recovery in source intake

W1 / D2; `concept2cure-v2` only, local/Codespaces only. One existing editor.

## What already exists

- `v2/editor/SourceImportDialog.tsx` renders the existing reason, workflow
  preview, working-copy receipt and explicit Open action. Its private intake
  hook guards only mount lifetime. Source/project props remount it; account,
  session and shell project visits do not retire its state or callbacks.
- `v2/authoringHandoff.ts` already owns workflow preview/create transports and
  source/selection/fingerprint receipt checks. Binary transport and its weaker
  decoder currently live in the dialog. Extend these existing transports and
  consolidate receipt validation there; do not add a writer or endpoint.
- `editor/authoringCurrentRead.ts`, `authoringDraftTransport.ts`, `shellProject.ts`,
  `taskTarget.ts`, `utils/authToken.ts` and the auth service already supply
  canonical session/account, project-visit and captured-actor guards. Ordinary
  adopted bearer refresh preserves a session. Raw storage replacement is not
  canonical refresh. `authoringCreationRecovery.ts` already supplies the
  component-owned attempt ledger and exact typed recovery-identity decoder.
- `AuthoringRecoveryNotice.tsx` is the existing notice/action pattern.
  `useAuthoringCreation.ts` already distinguishes unknown writes, explicit
  scoped inventory checking and identified-document readback. Inventory never
  proves which request created a record; another create is always deliberate.
- POST `/api/authoring/import/source` in `server/routes/authoring.router.ts`
  uses `authoring-source-import.ts` and the shared transactional creator for
  binary and stored workflow sources. It already returns canonical typed 503
  commit/handoff recovery envelopes. The client currently discards them.
- Binary reuse is keyed by tenant/project/source/hash/creator; workflow reuse by
  the corresponding fingerprint. Only eligible editable DRAFT records are
  reused. This is conditional reuse, not durable request idempotency. A lost
  response, changed version or lifecycle cannot justify blindly retrying.
- Existing scoped GET `/docs?programId=…`, `/docs/:id?programId=…` and
  `/docs/:id/sections?programId=…` provide current admitted records, whole versus
  section-only projections and source metadata. No recovery endpoint is needed.
- Existing sourceImportDialog/sourceImportScope/workflowSourceImport,
  workflowImportReuse, specialist recovery, source-import HTTP/PGlite and shared
  creator outcome tests exercise these owners. Several old client fixtures lack
  real document/section UUIDs, tenant/project fields or auth; align fixtures to
  the actual contract rather than admitting anonymous or incomplete receipts.

Root and two read-only reviewers searched client surfaces/callers, routes,
services, shared source contracts, creator/recovery helpers and tests. Deleted
history for SourceImport/source-import/authoringHandoff/creationRecovery found no
competing implementation to restore. Canonical catch-up from `1eca721b1` to
`62a8d5e7f` changes no preliminary intake source pin; incoming MDX/Reporting work
is retained and receives bounded integration review/checks. The existing design
skill, HANDOFF and authoring kit remain authoritative; no new surface or CSS.

## Approved completion

Capture one mounted source/project/account/session visit. Subscribe to existing
auth/shell notifications, but never silently transfer an open intake to a new
account. Guard synchronously before dispatch, after response/body reads, before
state delivery and before Open. Project A-B-A, account/session replacement,
source replacement/mutation and unmount retire old callbacks. Same-session
canonical refresh preserves current work. Refuse anonymous or unadopted bearer
fallback. Preserve the explicit target program; never borrow a new shell ID.

Pin captured actor headers once per operation, including every hop of a recovery
read. `current()` must continue to verify the original session/account/project
visit and the canonically adopted live credentials. A retired dialog masks old
reason, preview, result and recovery actions, offers the existing Close action,
and explains that an already-dispatched save may need inspection in its original
project. Reopening the selected source is an explicit fresh visit.

Consolidate strict binary/workflow receipt decoding in the existing handoff
module. Require document UUID, recorded tenant/project, valid source provenance,
an array of unique UUID sections with exact parent/tenant, nonblank unique codes,
title/content and safe order. The active transport additionally requires the
captured actor/organization. Fresh workflow copies match the preview's section
codes and fingerprint; reused/recovered copies retain legitimate edited section
structure and saved provenance. Do not equate transformed HTML with original
source hashes or infer current source eligibility from a saved copy.

Preview/read failures remain retryable. A create network failure, 408/5xx,
malformed successful response or typed commit/handoff uncertainty enters an
unknown attempt and blocks another create/preview replacement. Reuse the existing
attempt ledger and recovery decoder; no automatic retry or guessed receipt.
Recognized but malformed/foreign recovery identities remain held.

Offer explicit Check working documents using the existing recovery notice.
Read and validate the original scoped inventory. For an exact recovery UUID,
also read the exact header and sections, require whole-document/source metadata,
captured actor/tenant/project and matching recorded import provenance before
offering Open. Retain original workflow fingerprint/selection across the check;
opening uses actual saved section codes and the existing editor handoff.

For generic uncertainty without an identified outcome, scoped inventory checking
does not identify a receipt or open anything. State that limitation and require
inspection before another deliberate create, following existing native creation
recovery. Workflow creation additionally requires a fresh explicit preview.
No read/check issues an import write. All recovery remains component-owned;
closing/reloading is not durable request idempotency and must not be described as
cancelling an earlier server request. Keep Close available after an unknown
outcome so the person can inspect the original project's Author tab.

Open remains a deliberate click, checks the latest `openBlocked` and original
owner, and uses only the verified document/actual selected section. Existing
dirty-work, ceremony, template, source eligibility and filing controls remain
authoritative. No auto-navigation, acceptance, approval or submission.

## File ownership and evidence

- Transport owner: `v2/authoringHandoff.ts`, new focused sourceIntakeTransport
  tests, strict fixture alignment in workflowImportReuse and `transport/`
  evidence. Existing workflow exports stay reachable. Consolidate binary
  transport here, with no duplicate import writer.
- Ownership-test owner: new sourceIntakeOwnership tests; existing
  sourceImportDialog/sourceImportScope/workflowSourceImport fixtures; `ownership/`
  evidence. Real auth/session refresh and shell APIs; synthetic HTTP only.
- Root: SourceImportDialog, extraction of its private hook into
  `editor/useSourceIntake.ts` if needed for maintainability (delete the private
  original in the same change), current native recovery notice reuse, integration,
  human guide, review, compiler/build/gates, canonical Git and publication.

Before production edits retain meaningful behavioral RED, then actual qualified
GREEN, lint results, declared input hashes and raw exits under
`docs/evidence/D2-SOURCE-INTAKE-OWNERSHIP/2026-10-23/`. Root owns Git; workers have
no compiler/build/global scans or dependency changes. Do not run compiler beside
tests/build/lint. No baseline increase, alternate branch/worktree, PR, force,
bypass, deployment or live provider/agency calls. Human checks remain Not run.

Root also extends the existing source-import HTTP/PGlite test owner with controlled
lost-COMMIT-reply and committed-readback faults. It uses verified original bytes,
the shipped import route/shared creator and existing scoped recovery reads; no
backend production changes or new fixture writer are proposed. This qualifies
the already-present typed import-route recovery contract, rather than claiming
that synthetic browser replies prove the server path.

Final independent review retained four additional pre-fix behavioral failures:
two synchronous host-close/hold/callback changes and two legitimate empty edited
source copies. Open rechecks the latest host hold/callback after Close as well as
the original context, and verified reuse/recovery preserves an empty actual
section inventory. Fresh receipts remain nonempty. These are a new evidence
epoch; earlier qualified snapshots remain historical and unchanged.

Canonical combined-test preparation also found one old `sourceUiRules` test
using anonymous intake while asserting governed reason behavior (1 failed,
3 passed; archived as a fixture failure). Root aligns only its adopted
account/project setup; all reason-limit assertions remain unchanged.
