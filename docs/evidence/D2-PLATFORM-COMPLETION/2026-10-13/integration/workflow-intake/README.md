# Canonical workflow intake and direct from-draft private access

Implemented in the authorized worktree after verified branch publication
`a64d422ac14c5eb177734c18f4224e0517bc50b4`. This packet covers intake, creation,
source receipts and copy fidelity. The separate materializer/governance/native/UI
packets supply their own evidence; these tests do not establish deployment.

The existing `/api/authoring/import/source` now previews and imports exact saved
protocol/CSR selections. Server materialization supplies source scope, normalized
selection, fingerprint, gaps and original machine/template/unknown authorship.
Creation checks the preview fingerprint on its canonical transaction, requires a
stated import reason and a separate association reason for organization-scoped
sources, and always creates an unbound draft with `module:null` (unassigned).
No CTD Module 2 or dossier location is inferred; legacy from-draft defaults stay
unchanged. Existing advisory draft reservation
and edited-copy reuse are retained; no source or signature is copied as a new
approval. Copies use the registered deterministic `workflow_import` compositor,
not a fabricated AnA turn or importing-human authorship. Original model:null
remains unknown in document, genesis lineage and CREATE audit evidence.

The shared `authorizeAuthoringProgram` now also guards direct from-draft before
source text and again before writes. A real HTTP/JWT/PGlite private-program test
supplies valid stored Vault identity/hash/span references, proves 403 before the
Vault text SELECT, and proves no new document/section/revision/audit evidence.
Existing source and provenance behavior stays intact for authorized projects.

Coherent preview snapshots use REPEATABLE READ; internal workflow creation uses
SERIALIZABLE and retries an actual 40001 once with fresh access and fingerprint
checks. Receipts describe their MVCC snapshot, not a current-at-commit guarantee.
Current source fingerprint verification applies before later governed use. There
are no global source-table SHARE locks. Failed rollbacks discard the checked-out
connection. New child section creation locks/rechecks the parent document before
insertion through the canonical `reserveWritableDocument` helper. It rechecks
seal state and changes the parent MVCC version so a waiting coherent sealing
snapshot must retry after another child mutation.

Copy fidelity uses the installed deterministic Markdown parser plus the canonical
sanitizer. Tests prove real headings, list items and matrix cells remain editor
HTML, scientific `<LOQ` / `<critical>` and `R&D` remain readable, executable code
is removed, and an unverified copied image has a named gap. Original source
hashes remain original hashes; sanitized copy bytes have their own genesis/spans.

Verification:

- Six existing intake/from-draft/contributor suites: **84/84 passed**.
- Latest nine intake/private source/source reservation/copy suites: **92/92
  passed**, 107.36 seconds, including five initial HTTP workflow cases plus the
  real workflow audit-failure rollback case.
- HTTP workflow tests prove read-only preview, unbound draft/no copied signatures,
  stored AI/null model preservation, compositor spans/genesis/audits, forged
  browser body/model/status ignored, edited-copy reuse, stale fingerprint/private
  source/mismatched program refusal, and atomic rollback with original source
  unchanged.
- After bounded helper extraction: seven affected suites **76/76 passed**.
- Genesis receipt addition: two affected source/copy suites **18/18 passed**,
  with atomic rollback intact. A focused real HTTP case proves the genesis
  original source hash/model:null and the separate sanitized copy hash.
- Null/unassigned workflow module and unchanged legacy from-draft behavior:
  **19/19 passed** in two actual HTTP suites.
- Parent lock/version-touch change: existing section placement/duplicate
  regression suite **8/8 passed**; its thin fixture now includes the actual
  canonical parent `updated_at` and `locked_at` columns. Native wait-race proof is separate.
- ESLint: **0 errors, 0 warnings** after removing all introduced warnings.
  HEAD baseline comparison for the touched existing files was also zero;
  no baseline was raised.

PGlite proves actual SQL and canonical rollback. Native PostgreSQL runtime/RLS,
concurrent identical imports, source insertion snapshots, review adoption and
qualification holds are independently exercised by the native governance owner.
No live model call is required to import stored output. Final typecheck/build and
publication remain control-tower gates. Sanitized logs preserve development audit
key warnings; they do not claim production key configuration.
