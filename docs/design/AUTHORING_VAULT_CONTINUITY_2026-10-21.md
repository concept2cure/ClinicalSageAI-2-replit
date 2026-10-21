# Complete continuity in the existing authoring-to-Vault filing

W1 / D2; `concept2cure-v2` only; local/Codespaces human testing. This is a
continuation of the existing editor, File to vault dialog, filing service and
Vault version services. No new editor, UI pattern, provider or transport.

## What already exists

- `client/src/concept2cure/v2/editor/FileToVaultDialog.tsx` already posts the
  chosen PDF/DOCX format to the existing authoring route, reports approval
  carryover, and opens the returned document in the existing Vault using
  `vaultTarget.ts`. Its result parser requires only a nonempty document ID;
  missing/malformed response identity is accepted or treated as definite failure.
  Network errors and malformed successful responses claim nothing was written.
  The attempt can then be repeated. The dialog does not capture a filing session
  across document/project changes while a request is in flight.
- `DocumentCanvas.tsx` and `DocumentWorkbench.tsx` already host that dialog. The
  Vault's `VaultPlaceIntoSubmission.tsx`, `filingTarget.tsx`,
  `submissionScopedRead.ts` and `placeIntoFilingCopy.ts` already handle downstream
  placement, current-context boundaries and ambiguous write outcomes. Reuse their
  established behavior; do not introduce another placement surface.
- `server/routes/authoring.router.ts` already authorizes
  `POST /docs/:docId/file-to-vault` and calls
  `server/services/authoring/authoring-file-to-vault.ts`. That service renders
  saved sections, ingests bytes, places the admitted version, rechecks saved
  sections inside its recording transaction, audits the export and attempts
  byte-bound approval carryover. It refuses a plain-text PDF fallback. The
  recording transaction rechecks document status, but the captured document and
  project identity must be examined for other changes during export/admission.
- `vault-ingest.service.ts`, `vault-version-checkin.ts`,
  `vault-version-family.ts` and the existing lineage migration already own Vault
  version identity, current-head checks, server-assigned version numbers,
  successor locks, inherited filing and same-family rules. Authoring currently
  gives ingest a hash-suffixed version and no `supersedesDocumentId`.
- `placement-vault-leaf-parity.pglite.test.ts` already exercises actual
  authoring/Vault/leaf services and retains two TODOs for an approved Vault leaf
  path and re-filing lineage. The current File to vault → Open in Vault handoff
  must be verified before treating the first TODO as an absent product path.
- `authoring-file-to-vault-snapshot.pglite.integration.test.ts` already verifies
  saved-section drift and compensation. The canonical Vault check-in tests
  already verify stale heads, duplicates and races. Extend these fixtures and
  invariants rather than create another ingest/version implementation.

Searches covered authoring/Vault/placement/filing/template references in client,
routes, services, schemas, migrations, design and work orders. Deleted-history
searches for file-to-vault, placement, assembly and saved template review found
legacy cleanup/editor deletions, not a retired competing authoring Vault filer
or check-in service to restore. No deeper `AGENTS.md` was found in the searched
implementation roots. See the evidence README for the recorded catch-up.

## Discovery and ownership contract

Root owns canonical synchronization, this contract, evidence, final scope,
combined verification and all Git operations. Before implementation, one focused
read-only audit follows the existing client receipt/context/handoff and one
follows server filing identity, compensation and existing version admission.
Workers do not change files, run tests or mutate Git until root records the exact
implementation boundary and assigns disjoint ownership below.

The immediate confirmed gap is ambiguous filing-outcome handling. A transport or
receipt failure cannot establish that nothing was written and must not permit an
automatic replay. A successful result must be bound to the actual captured
document/project/format and must not navigate another project to an old result.
Keep existing controls, labels, classes and dialog structure; reuse current
context/session and reconciliation patterns.

The server audit determines whether a bounded correction can use the canonical
version/check-in path without inventing lineage for historical hash versions,
choosing a predecessor from a title, weakening approval, or changing a pinned
leaf. No historic version renumbering, schema migration or lineage policy change
is authorized by this discovery contract. Any version or snapshot correction
must preserve the existing compensation, audit and byte-bound approval gates.

## Verification requirements

Retain meaningful RED before fixes, actual GREEN commands, exit codes and source
pins. Cover ambiguous POST outcomes, malformed/mismatched success receipts,
captured document/project changes, duplicate clicks and unchanged existing
navigation. Server changes require real transaction/identity refusal and positive
fixtures, not tests of a copied algorithm. Run appropriate merged editor/Vault
and placement regressions, compiler/build, strict changed-file lint, warning
comparison and existing design/single-editor/safety gates before direct push.

No provider calls, agency delivery, fresh full PostgreSQL installation or human
acceptance can be inferred from deterministic fixtures. Evidence belongs under
`docs/evidence/D2-AUTHORING-VAULT-CONTINUITY/2026-10-21/`.

## Approved bounded implementation

The read-only audits confirmed the existing Open in Vault → Vault placement
chain. Its returned UUID survives through the Vault selection and the existing
`vault_documents` leaf write. Qualify that chain with a composed mounted test;
do not add another placement action. The older first parity TODO is stale as a
description of product reachability. Historical hash-version check-in and the
second lineage TODO remain outside this bounded correction.

Client ownership: `editor/FileToVaultDialog.tsx`, narrow dialog-host call sites
in `DocumentWorkbench.tsx` and `DocumentCanvas.tsx`, existing
`__tests__/workbenchFileToVault.test.tsx`, and focused
`fileToVaultContinuity.test.tsx` / `authoringVaultPlacementFlow.test.tsx` tests.
Reuse `mutateVerbatim` / `mutationUnconfirmed`, `useSubmissionReadSession` and
the existing keyed/current-request guards. Validate the returned Vault UUID,
captured project UUID, SHA-256 and requested PDF/DOCX format; explicit false
success, bodyless/unreadable or contradictory receipts are not confirmation.
Do not invent approval when the receipt omits it. Retain the captured project
for navigation and suppress obsolete callbacks/toasts. A pending latch prevents
duplicate clicks. Keep this existing dialog mounted through ordinary close and
reopen using an optional `open` prop and existing `useDialog` enablement, so an
unconfirmed outcome cannot silently reset into another POST. No CSS, controls or
layout changes. Definite refusal remains a refusal; an ambiguous result requires
review of current Vault records rather than automatic replay. A file-local
presentational extraction may group the identical existing dialog JSX to avoid
new function-size warnings; all mutation/current/reconciliation decisions stay
in the existing controller.
The merged regression fixture `documentCanvasFilingBinding.test.tsx` must
preserve the auth module's actual exports while stubbing its existing `useAuth`
hook. Keeping the closed dialog mounted now legitimately uses the real session
guard; a partial mock must not remove or fabricate that guard.

Server ownership: `authoring-file-to-vault.ts`, the narrow canonical
`vault-ingest.service.ts` admission receipt, existing authoring snapshot PGlite
fixture, ingest storage tests and relevant existing placement parity fixture.
Its existing exported type declarations may be mechanically moved to
`vault-ingest-types.ts` and re-exported unchanged from the service, avoiding a
new file-length warning while keeping every runtime operation in the service.
The existing approval-carry route fixture may add its missing organization
settings JSON column to its explicit prerequisites; this updates only that
fixture to the current legal-document reader and adds no production schema.
Additional directly affected filing-fixture receipt updates must be coordinated
with root; no broad unrelated refactor.

1. Reuse one fixed, parameterized locked document-header query for capture and
   recording. Compare every captured field that drives bytes, scope, source
   release, placement or approval (including real timestamp values and optional
   template/governed binding) before export/history and carryover. Retain the
   existing saved-section check. No dynamic lock interpolation or SQL allowance.
   Remove the former single SQL interpolation allowance from the ratchet;
   the fixed projection now needs zero. Root also corrects only the route's
   stale comments promising universal atomicity, without changing its handler.
2. Canonical ingest mints an explicit candidate row UUID in its existing INSERT,
   appending the bind parameter so existing indices remain stable. Its returned
   `admission.created` is true only when the returned row ID equals that
   candidate. A pre-read or `reupload` alone cannot prove creation: a concurrent
   winner can be returned by ON CONFLICT after an empty pre-read. No schema or
   second ingest/version engine.
3. Authoring accepts only verified creation for subsequent placement, export
   recording and approval carryover. A reused version is retained and returns a
   named existing-version reconciliation refusal before those actions. An
   unverified admission is an unknown outcome. Neither may be compensated as an
   operation-created row. Coordinate exact refusal code with the client so a
   known existing-version result also requires review rather than replay.
4. Compensation of a verified operation-created row returns a confirmed result;
   scope it to the captured tenant/project and check its actual row/audit
   outcome. Rollback, audit or cleanup failure yields `OUTCOME_UNKNOWN` and a
   reconciliation sentence, never “nothing was kept/filed.” Preserve the current
   tombstone and chained-audit policy. This correction does not qualify every
   possible third-party use race during the already-existing admission/record
   interval; it must not claim to do so.
5. An uncertain recording COMMIT or rollback must not trigger destructive
   compensation. An uncertain canonical-ingest COMMIT must also preserve the
   possibly recorded provider bytes and return `OUTCOME_UNKNOWN`. A database
   commit followed by a lost reply cannot prove that a row or its bytes are
   unheld. Extend the existing real PGlite transaction fixtures with explicit
   commit/rollback acknowledgement-loss seams. A raced reused admission must
   discard its own unheld upload through the existing storage cleanup helper;
   a copy held by the returned row remains protected.

Root owns human-checklist updates, evidence, independent integration review and
combined verification. The two workers own disjoint client/server files, retain
RED before source edits, and do not run compiler/build/global scans or mutate
Git. No legacy renumbering, guessed predecessor, approval weakening, provider,
transport or migration is included.
