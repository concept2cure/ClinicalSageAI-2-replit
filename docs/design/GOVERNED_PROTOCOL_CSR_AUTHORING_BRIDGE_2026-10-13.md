# Stored protocol and CSR output → governed authoring draft

Proposed next W1/D2 increment after the first verified platform commit. The
bridge uses the existing document editor and `/api/authoring/docs/from-draft`.
It adds no alternate document store, generation engine or signing ceremony.

## Concrete gap

`CsrWorkflow` in `BiopharmaProject.tsx` opens a section by sending an AnA
request. It does not open the persisted `csr_section_outputs` row. Protocol
development has a structured, governed source document and an assembled export,
but no direct path into the common authoring editor. Protocol records are
organization-scoped, optionally bound to a study design, and have no direct
program UUID. The target program therefore needs an explicit selection and
authorization check.

`createDocumentFromDraft` already creates sanitized sections, genesis revisions,
clause lineage and audit rows transactionally. It can also verify Vault source
receipts at save. Its current `source: 'import'` path attributes content to the
importing actor, however. CSR output has an `aiGenerated` flag and content hash;
the current builder stores `model: null` even for AI-generated output. A plain
copy through the current import path would lose that recorded machine origin.

## One API and server-selected content

Extend the existing from-draft API with a stored-output selector, leaving the
current section/body contract unchanged for existing callers:

```ts
{
  programId: string; // explicit regulatory_programs UUID
  workflowSource:
    | { kind: 'protocol'; documentId: number }
    | { kind: 'csr'; jobId: number; sectionNumbers?: string[] };
  previewOnly?: true;
  expectedFingerprint?: string; // required on creation, returned by preview
  reason?: string; // required on creation
}
```

The same endpoint's preview branch returns the source title, version, section
list, deterministic fingerprint and origin/gap disclosures. It writes nothing.
The create branch loads the stored source again inside the authoring transaction
and refuses a changed fingerprint. Browser-provided source prose, model names,
signature IDs, status and fingerprints are never accepted as source facts.

Preview returns `{ success: true, data: { source, fingerprint, sections, gaps,
origin, target } }`. Creation/reuse returns the existing `{ success, data:
{ doc, sections }, governance }` envelope. `doc.id` and each actual section's
`id`/`code` are the editor handoff; workflow provenance records the exact source
version/fingerprint. No title matching or guessed section binding is necessary.

The importer uses the canonical creation service. A source reader/materializer
returns sanitized section inputs plus a server-owned workflow receipt. The
creation service carries this receipt into the document provenance, genesis
revision inputs and audit metadata. A create remains `draft`, regardless of the
source status. Workflow imports explicitly use an unbound editing copy:
`resolveBinding` currently may bind the first authoring document to the project's
filing, which would wrongly couple CSR E3 codes or protocol keys to dossier
section slots. Filing requires the existing explicit governed action.

## Scope and source identity

The target is a live, uniquely anchored program the current actor can use through
the existing project sharing policy. Reuse `readProgramAnchorRow`, current
membership and `canAccessReportProject`/the canonical project policy; never add a
second ownership query or infer private-project access from organization role.

CSR imports require `requireCsrJobAccess` and a job whose recorded project is
the selected program's project. Organization-wide legacy jobs require an
explicit association decision; they cannot silently become the selected
program's data. No output or an incomplete selection is an honest refusal.
Partial persisted sections may be imported as partial drafts with their recorded
gaps; a complete job is still not a reviewed or signed authoring document.

For protocols, verify the organization's source row and any recorded
`study_design_id` through `cdisc_prm_studies.program_id`. A recorded different
program is refused. A source without a program anchor is presented as an
organization-scoped protocol, with explicit target selection and a retained
association reason. No pre-existing program ownership is invented.

The receipt contains source kind, source IDs, recorded version, section hashes,
aggregate fingerprint, capture time, source scope and source-origin facts.
Protocol composition reuses `assembleProtocolExport`; preserve synopsis,
sections, objectives, eligibility and schedule instead of copying only visible
text. CSR section numbering and titles use the existing ICH E3 catalog and
persisted rows. Source finalization may be referenced as a source fact after its
canonical verification, but no signature is copied onto the new draft.

## Provenance and governance

An import describes the operation; it does not establish human authorship.
Retain each section's recorded AI/template/unknown origin. Known AI and
unverifiable origin use the existing machine/unverified lineage controls and
cannot be relabeled as the importing person's prose. A dedicated registered
workflow-machine identity may be necessary because the current registered
machine label is specifically `AnA (AI draft)`; do not invent an AnA conversation
for a CSR worker. Model qualification is read only from retained server evidence;
legacy `model: null` remains unknown. Unverified content may exist as a draft,
with review/signature/filing boundaries held by the canonical controls.

Do not claim generation-source support from a workflow pointer alone. Carry
existing Vault source references only when actual document/hash/span receipts
exist and the canonical verifier accepts them. Otherwise state that generation
source references were not recorded. Keep the workflow snapshot's identity
separate from a verified scientific source or an approved regulatory claim.

Extend the existing saved-source verification/reservation mechanism to check
workflow receipts before new governed renditions or filing, using their current
source versions. A changed, removed or unreadable source produces a reviewable
refusal. Freeze, review assignment, e-signature and filing remain the existing
editor actions, with their current permission and password/signing authority
checks. The source workflow's completeness, signature or approval never grants
the new copy those states.

## Idempotency and UI

One retained source selection/version/fingerprint in one program creates one
draft. Concurrent clicks/retries must converge through a transaction lock and
database uniqueness, not a browser title search. Reopening checks current
document access before returning an existing ID. A changed source creates a new
draft with a successor receipt; it never overwrites a frozen or signed document.

Use the existing button/drawer styles in `ProtocolDevWorkspace.tsx` and the CSR
board: “Open saved draft in editor.” The drawer names the source, target program
and source/gap disclosures, then creates the draft. On success, call
`setEditorTarget({ docId, programId, docType })` and `onNav('document-authoring')`.
Disable repeated submissions while saving; reset and cancel old work when the
program or source changes. No generation call is necessary to open stored output.

## Exact implementation ownership

Backend owner:

- `server/routes/authoring.router.ts`: only from-draft preview/create branch.
- `server/services/authoring/authoring-from-draft.ts` and
  `authoring-documents.ts`: narrow receipt/transaction/idempotency integration.
- New `server/services/authoring/workflow-draft-source.ts`: canonical source
  materialization, current scope checks and immutable receipt.
- `server/services/authoring/draft-source-references.ts`: existing saved-source
  reservation expanded for workflow receipts.
- `server/services/authoring/revision-ledger.ts`: registered workflow identity if
  needed; preserve current AnA verification behavior.
- `server/services/protocol-export/protocol-export-service.ts`: optional query
  executor so assembly can read on the import transaction without duplication.
- One additive migration for workflow import uniqueness, if a canonical alias
  cannot express source selection/version in the target program; canonical set
  entry owned by the control tower. No new table.

UI owner:

- `client/src/concept2cure/v2/surfaces/BiopharmaProject.tsx`: CSR board handoff only.
- `client/src/concept2cure/v2/surfaces/ProtocolDevWorkspace.tsx`: protocol handoff.
- `client/src/concept2cure/v2/authoringHandoff.ts`: extend the existing specialist
  handoff with stored-output selectors, preview and atomic create/reuse; use the
  existing editor target. Do not add a parallel client conversion helper.
- `client/src/concept2cure/v2/editor/provenance.ts`: show retained workflow origin
  and unknown model without asserting human authorship or copied approval.

Tests/evidence owner:

- New server source-materialization and PGlite from-draft import regressions:
  foreign tenant/private project, program mismatch, stale source, forged
  model/signature/body, partial CSR, faithful protocol structure, origin retained,
  same-transaction rollback and concurrent idempotency.
- Native `tests/db/workflow-draft-import.dbtest.ts`: actual RLS runtime,
  machine/unverified release refusal and unchanged review/signature controls.
- New client import-flow tests: real saved ID handoff, correct source/program,
  disclosure, failure state, double-click and stale-program cancellation.
- Existing authoring provenance, source reservation, revision ledger,
  object authorization, protocol signing and source export regressions stay green.

Implementation is pending the control tower's ownership assignment. This
contract was produced through read-only workflow inspection; no workflow code
was changed in this review.
