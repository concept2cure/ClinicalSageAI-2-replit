# Stored protocol and CSR output → governed authoring draft

Revised after incoming editor integration `30e80b571` (remote merge
`22c0c85b2`). This is the next bounded workflow increment, pending the control
tower's implementation trigger. It extends the new canonical verified source
intake, `/api/authoring/import/source`, and its existing dialog and receipts.
`/api/authoring/docs/from-draft` remains the internal document creation engine;
it is not a second public workflow-selector endpoint.

## Concrete gap and existing implementation

`CsrWorkflow` in `BiopharmaProject.tsx` opens a section by sending an AnA request.
It does not open the persisted `csr_section_outputs` row. Protocol development
has governed structured source records and an assembled export, but no direct
path into the common authoring editor. Protocol records are organization-scoped,
optionally bound to a study design, and have no direct program UUID.

Incoming `authoring-source-import.ts` already selects exact Vault/data-room
records on the server, reads and verifies stored bytes, converts them, and calls
`createDocumentFromDraft` with an internal `verifiedImport` receipt and
reservation callback. The existing transaction writes sanitized sections,
genesis revisions, clause lineage, and CREATE audit metadata. The importer locks
the exact source/version and reuses the actor's existing draft without replacing
its edits. `import-source-references.ts` rechecks the saved receipt before new
renditions or filing. Extend these mechanisms; add no parallel import store,
conversion route, editor, or signing ceremony.

The incoming source-intake project-access repair checks verified numeric actor
identity, fresh active organization membership, one existing program/project
anchor, and the canonical sharing policy before source reads or bytes. It repeats
the check on the canonical creation transaction. Workflow preview and create
must use the same boundary. The distinct pre-existing direct from-draft
source-reference access issue is recorded in the incoming source-intake evidence;
it must not become a workflow bypass.

## Public contract and server-selected content

Extend `AuthoringImportSource` in `shared/authoring/source-import.ts` and the
existing `/api/authoring/import/source` request parser:

```ts
{
  programId: string; // explicitly selected regulatory_programs UUID
  source:
    | { kind: 'vault'; documentId: string }
    | { kind: 'data-room'; sourceId: number }
    | { kind: 'protocol'; documentId: number }
    | { kind: 'csr'; jobId: number; sectionNumbers?: string[] };
  previewOnly?: true; // workflow variants: read-only, no document/reservation write
  expectedFingerprint?: string; // workflow create: mandatory preview fingerprint
  reason?: string; // mandatory on creation; existing file imports retain their contract
}
```

Preview returns `{success:true,data:{origin,fingerprint,sections,gaps,warnings,
target,association}}`. Sections have their actual source keys/codes and titles.
The origin states the recorded source scope, version, per-section hashes and
AI/template/unknown origin; model-knownness is explicit. Association states
whether the target is already recorded or an explicit new association is needed.
The preview writes no authoring document, review, signature, alias or receipt.

Workflow create materializes those same stored rows, checks the selected target,
and rechecks the expected fingerprint inside the canonical authoring creation
transaction. Browser-supplied prose, titles, source scope, model names, signature
IDs and status cannot supply source facts. Stale, missing, unauthorized, malformed
or incomplete selections return a specific refusal without authoring evidence.

Creation/reuse preserves the incoming envelope:
`{success:true,data:{doc,sections,origin,warnings,reused}}`. `doc.id`, the actual
section `id`/`code`, and `origin.programId` are the editor handoff. No guessed
title or section binding is necessary. An exact workflow origin also contains
the verified source fingerprint and source selection so the client can reject a
response for a different source or target program.

Extend `AuthoringImportOrigin` as a discriminated union. Existing binary origins
retain their verified file SHA-256, filename, MIME type and conversion facts.
Workflow origins have a structured-record fingerprint and composition method;
they must not invent original file bytes, filenames or MIME types. Reuse the
same `provenance.importSource` receipt, CREATE audit metadata, reservation and
saved-origin verification path with kind-aware validation. Do not duplicate the
receipt in a new workflow-specific store. Existing byte and section limits stay
effective; structured workflow materialization also respects editor limits.

## Scope, composition and source identity

The target is a live, uniquely anchored program the current actor can use
through the existing project sharing policy. Reuse `programInOrganization`,
`readProgramAnchorRow`, fresh membership and `canAccessReportProject`. Source
ownership and sharing are checked before reading source records or composing
content, and again in the transaction. Failure to read access is not permission.

CSR imports use `requireCsrJobAccess` plus current access to the job's recorded
project. That project must be the selected program's project. Organization-wide
legacy jobs require an explicit association decision; their scope cannot silently
be relabeled. Preserve ICH E3 section numbers/titles from the existing catalog and
persisted output hashes. Missing selected output refuses; partial available output
may be imported only as a partial draft with its retained gaps. A completed CSR
job is not a reviewed or signed authoring document.

Protocol imports verify the organization's source row and any recorded
`study_design_id` through `cdisc_prm_studies.program_id`, then current sharing on
that source project. A recorded different program refuses. A source without a
recorded program is disclosed as an organization-scoped protocol, with explicit
target selection and a retained association reason. No prior program link is
invented. Reuse `assembleProtocolExport` with the import transaction executor to
preserve synopsis, sections, objectives, eligibility and schedule; do not compose
a second, reduced protocol from visible editor text.

The fingerprint covers source IDs, recorded version, selected section hashes,
composition-relevant structured rows and original scope. Imported copies always
start as unbound drafts. `resolveBinding` may otherwise attach a first authoring
document to the project's filing, coupling CSR E3/protocol keys to dossier slots.
Add only an internal verified-import option to force unbound creation for these
workflow variants; public callers cannot forge it. Filing remains the existing
explicit governed action.

## Provenance and governance

An import describes the operation; it does not establish human authorship. The
CSR builder records `aiGenerated` but currently stores `model:null` even for
generated output. Preserve that fact. Do not invent model/provider/PQ receipts,
AnA turns, scientific source support, or human authorship for machine/unknown
content.

The plain current `source:'import'` creation path attributes prose to the importing
actor. Extend its internal verified workflow options so known AI and unknown
authorship receive canonical unverified machine lineage. Register a truthful
workflow machine identity if needed; the existing `AnA (AI draft)` identity must
not imply an AnA conversation for a CSR worker. Section origin facts go into the
same document/genesis/audit receipt. Unknown model remains unknown. Verify the
actual freeze/release/export boundaries hold unverified machine content; do not
assume a displayed provenance warning supplies a release control.

Generation source references are retained only when actual document/hash/span
receipts exist and the canonical source verifier accepts them. Otherwise disclose
that generation source support was not recorded. A workflow fingerprint proves
snapshot identity, not an approved scientific or regulatory claim.

Extend `import-source-references.ts` to verify/reserve workflow origins before new
governed renditions or filing. Changed, removed or unreadable sources cause a
reviewable refusal. Preserve existing binary disposition/version checks. The copy
uses the existing review assignments, signing authority, password ceremony and
filing controls. Source completeness, finalization, approval or signatures may be
retained as verified source facts; none becomes the copy's signature or status.

## Idempotency and existing UI

Extend the existing creator/program/source/version advisory reservation and draft
reuse logic with the workflow selection fingerprint. Concurrent retries converge
on one actor's draft; current project and authoring object permissions are checked
before returning it. Edited drafts are retained. A changed source makes a new
draft and receipt; signed or frozen content is not overwritten. Reuse the current
receipt store rather than adding a workflow table or a second uniqueness scheme.

The existing `SourceImportDialog.tsx` displays protocol/CSR selectors, preview,
exact source/target and gaps. `authoringHandoff.ts` orchestrates calls to the same
verified-intake route. CSR and protocol buttons use existing drawer/button styles:
“Open saved draft in editor.” After create/reuse, use the existing exact-ID helper
and `setEditorTarget({docId,programId,docType:null,code?,label?})`; only pass a filing
type if the server has established one. Keep `DocumentWorkbench.requestLeave` and
its unsaved-work refusal. Source/program changes invalidate pending responses;
do not remount a dirty editor or use an AnA generation request to open saved text.

The incoming UI repair and extension points are documented in
[incoming-editor-review.md](../evidence/D2-PLATFORM-COMPLETION/2026-10-13/ui/incoming-editor-review.md).

## Exact bounded ownership and verification

Backend scope:

- `shared/authoring/source-import.ts`: source/origin union and workflow preview DTO.
- `server/services/authoring/authoring-source-import.ts`: parser/materialization
  dispatch, current access, existing receipt/reservation/reuse extension.
- New `server/services/authoring/workflow-source-import.ts`: canonical stored
  protocol/CSR materializer, fingerprint and origin facts; no new store.
- `server/routes/authoring.router.ts`: only existing `/import/source` preview/create
  response handling; no alternate from-draft selector route.
- `server/services/authoring/authoring-from-draft.ts` and, only if required,
  `authoring-documents.ts`: internal unbound-copy and per-section origin integration.
- `server/services/authoring/import-source-references.ts`: kind-aware saved-origin
  verification/reservation consumed by existing `draft-source-references.ts`.
- `server/services/authoring/revision-ledger.ts` plus canonical lineage adapter only
  if required for a registered unverified workflow identity; preserve AnA proof rules.
- `server/services/protocol-export/protocol-export-service.ts`: optional caller
  executor for canonical composition on the import transaction.

UI scope:

- `client/src/concept2cure/v2/editor/SourceImportDialog.tsx`: extend the current dialog
  and exact saved-ID handoff; preserve incoming stale-response repair.
- `client/src/concept2cure/v2/authoringHandoff.ts`: preview/create orchestration.
- `client/src/concept2cure/v2/surfaces/BiopharmaProject.tsx` and
  `ProtocolDevWorkspace.tsx`: exact saved workflow selection and handoff only.
- `client/src/concept2cure/v2/editor/provenance.ts`: retained workflow origin/gaps.
- `DocumentAuthoring.tsx`: only separately assigned current-shell-project/stale-read
  hardening if still required; never discard a dirty editor on scope changes.

Meaningful tests extend the existing source-import/source-reference suites and
add stored workflow fixtures: foreign tenant/private source and target, mismatched
program, changed fingerprint between preview/save, forged prose/model/signature,
faithful protocol structure, partial CSR/gaps, retained AI/unknown origin, forced
unbound draft, unchanged originals, same-transaction rollback and exact edited
draft reuse. Native runtime-role/RLS tests must prove concurrent idempotence and
unverified machine release refusal through the actual review/signature/file
paths. UI tests prove exact saved ID/code, source/program response matching, stale
preview/create cancellation, failure recovery and the existing unsaved-work guard.
Binary import, machine-claim, source reservation/export, object authorization and
protocol signing regressions remain green.

The workflow bridge remains unimplemented. Incoming canonical source intake and
its narrow project-access repair are the current implementation, not proof that
protocol or CSR selectors have shipped.
