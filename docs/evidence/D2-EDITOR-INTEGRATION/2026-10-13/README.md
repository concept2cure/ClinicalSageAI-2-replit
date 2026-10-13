# Existing editor: source integration and AnA oversight

W1 / launch row D2, with D5 evidence for attributed AnA fixes. Implemented on
`concept2cure-v2` from `cd0140cb`. No new editor, authoring store, model provider,
production dependency or database migration.

## What changed

DocumentAuthoring and DocumentCanvas continue to mount DocumentWorkbench and
RichSectionEditor. The existing project-files rail now offers Vault, Data room /
catalogue and IND document work. Projects and Vault use the same source intake
dialog. Every successful handoff carries the exact returned authoring document
id and project; the editor preserves its existing unsaved-work guard.

Source intake reads the exact current eligible source from the project,
verifies original bytes against their recorded SHA-256, and creates a draft
through createDocumentFromDraft. The canonical transaction records source
provenance, genesis revisions, document lineage and audit events. Repeated intake
reopens the creator's existing editable draft instead of replacing its edits.
Word structure and supported figures are retained. Other readable formats
become escaped extracted text with explicit conversion warnings. The original
source identity, checksum and limits remain visible in the working copy.

Imported source dependencies are rechecked for export and filing. Filing stores
the original dependency in the canonical export-history receipt. A source's
data withdrawal or supersession is blocked while an eligible, different-byte
Vault rendition would permit its data to be reused. Existing keep-data and
approval controls remain in force.

The IND reference derives all eight phases, 102 non-module section entries and
93 task/subtask deliverables from the existing canonical definitions. It
provides source lookup, exact existing-document opens and AnA preparation.
Official forms, signatures, datasets and agency receipts retain their manual
or deterministic preparation limits. IND task bindings also hand off to the
same editor; document work does not silently change task status.

AnA's existing requirements tool can page through this complete catalogue with
`document="ind_pyramid"`; no new tool identity is registered. The editor offers
section review, document review, evidence reconciliation and targeted fixes,
using real saved-section identity/version and source context in both hosts.
Versioned fixes are explicit, bounded proposals applied through the existing
governed tracked-change door. Wrong sections, stale versions, frozen content,
unqualified models, ambiguous quotes and overlapping suggestions are refused.
Applying a proposal does not save, accept, approve or file it. Recorded JSON
replacement text preserves AnA attribution through the existing turn verifier.

## Verification

- Final combined targeted regression: **241 tests passed in 23 suites**.
  Includes native TipTap application in both hosts, retained machine
  attribution, source UI paging and exact-id handoffs, full IND catalogue/tool
  paging and official-form limits, existing viewer/data-room/pyramid behavior,
  and the source/filing suites listed below.
- Real PGlite and canonical services prove native DOCX intake from verified
  local Vault bytes, data-room intake, exact edited-draft reuse, scope/hash/
  role/reason refusals, and complete transaction rollback on audit failure.
- Real filing orchestration with PGlite proves the import → authoring → filed
  rendition dependency and source-withdrawal refusal while that rendition is
  still eligible. Existing snapshot and compensation cases pass.
- Production client and server build: **passed**. Vite reports a bundle-size
  advisory; it does not fail the build.
- Scoped ESLint on all changed TypeScript files: **passed with no errors**.
- Full TypeScript: **zero errors**, matching the zero baseline. The complete
  repository pre-push checks passed. The changed-file warning ratchet reports
  **no increase across 50 lintable files**. New helper complexity was reduced
  without lint suppressions or baseline increases; the affected root, source
  and AnA regression runs passed 52, 36 and 52 checks respectively.
- Single-editor path gate and its failure-injection self-test: **passed**.
  Single native canvas, AnA surface context, source-alias, tenant entry,
  authenticated fetch, artifact provenance and lineage-save checks passed.
- The SQL interpolation scanner admits six fixed, canonical eligibility
  fragments in two new source files. Aliases are literals; all source ids,
  project ids, tenant ids, checksums and reasons remain bound parameters.

The two review findings concerning stored-title prompt injection and official
form drafting offers were fixed and covered by regression tests. The filed
rendition source-dependency finding was also fixed and tested. No unresolved
material review finding remains within this change.

## Evidence and implementation contracts

- [Source backend and lifecycle checks](source-integration.md)
- [AnA oversight and remedy checks](ANA_OVERSIGHT.md)
- [Implementation contract](../../../design/EDITOR_INTEGRATION_2026-10-13.md)

## Limits of this evidence

UI model responses are scripted test streams. This session did not run a live
provider, qualify model performance, deploy the app or run staging acceptance.
Original official forms, signatures, spreadsheet formulas and unsupported
binary datasets are not reconstructed from extracted text. AnA's review reads
saved records; unsaved editor text is explicitly excluded. This evidence does
not declare the overall D2 or D5 staging launch rows green.
