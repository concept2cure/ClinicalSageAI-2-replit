# Shared document-render snapshot — F1 repair

Repository: `concept2cure/ClinicalSageAI-2-replit`  
Branch: `concept2cure-v2`  
Baseline: `b72c0f274e7a988e6976be7d091652084e8a42e1`  
Workstream: D2/W1, existing shared document authoring and rendering.

## Scope: all document classes using the shared Authoring renderer

The user explicitly required this protection for all documents, not just a
clinical study report. The repair therefore belongs in the established
`renderAuthoringExport` boundary, with no CSR-only condition. It applies to
ordinary Authoring documents, working copies, Vault renditions, company
correspondence and QMS controlled copies that call that renderer. Document
labels such as protocol, IND summary, CMC, investigator brochure, device
clinical evaluation, SOP, agency response or CSR do not select different
snapshot rules.

This does NOT certify a specialist export path that does not call this
renderer. It also does not impose CSR-specific clinical rules on a quality
procedure, manufacturing document or regulatory correspondence.

## What already exists

| Existing path | Responsibility retained |
|---|---|
| `server/services/authoring/authoring-export.ts` | Common DOCX/PDF/XML rendering, signature manifestation, source checks and artifact SHA-256 |
| `server/services/authoring/authoring-file-to-vault.ts` | Uses the same renderer; governs Vault admission, source reservations, final current-record checks and compensation |
| `server/services/qms/controlled-copy.ts` | Controlled-copy orchestration using the same renderer, with recorded approval manifest and copy label |
| `server/services/company-documents/correspondence-rendering.ts` | Resolves the retained company revision instead of trusting current/caller branding |
| `server/services/authoring/draft-source-references.ts` | Revalidates saved source identities; reserves sources in the caller's governed transaction |
| `server/services/authoring/peer-review.ts` | Full-document saved snapshots and independent review decisions |
| `server/services/authoring/authoring-content-digests.ts` | Existing persisted signature/review digest framing, reused unchanged |

No new service, screen, route, table, integration, production dependency,
model approval or digest version is introduced.

## Confirmed defect

`renderAuthoringExport` shallow-copied the argument object around its first
asynchronous read but kept the caller's mutable nested objects. Its document,
section array and rows, provenance, actor, supplied signatures (including
Date instances), and working/controlled-copy metadata could change while
source, image, citation, branding or conversion work was pending.

The signature manifestation is computed before image/citation work. A later
mutation could therefore produce a different body under the earlier
signature verdict. Titles, filenames, section order, controlled-copy
manifests and warning labels could also describe different input revisions.

The deterministic regression deliberately changes input objects at these
boundaries. It proves a callable shared-renderer defect; no claim is made
that this exact mechanism caused a reported live customer incident.

## Repair

1. Capture a private deep copy of all render data synchronously, before the
   first await. Retain exact strings, nulls, dates, section order, nested
   provenance and supplied signature/copy metadata.
2. Keep the live database executor as a resource rather than cloning it.
3. Continue ignoring a caller-supplied company presentation. Capture the
   internally resolved retained company revision after its existing lookup.
4. Reject unsupported formats and contradictory working/controlled-copy
   modes instead of allowing an unexpected format to fall through to PDF.
5. Refuse data that cannot be captured with the safe service-level
   `EXPORT_SNAPSHOT_UNAVAILABLE` error, without echoing provenance or private
   cloning diagnostics.

Source admission, workflow-release checks, signature wording, content-digest
formats, strict PDF conversion and uncontrolled-copy warnings remain in
place. This is an operation-owned input snapshot, NOT a new database
snapshot, human review, signature, or scientific qualification. Existing
callers must still reserve/recheck the saved record before recording and
serving an export. This change does not replace those checks.

The copy adds memory proportional to already loaded render data. Large-report
memory/performance is not benchmarked in this increment. HTTP mapping of the
new service refusal is not qualified by the isolated suite.

## Exact changes

- `server/services/authoring/authoring-export.ts` — only production file.
- `server/services/authoring/__tests__/authoring-export-snapshot.test.ts`.
- This evidence directory.

## Executed before/after evidence

Node 22.16.0, TypeScript 5.8.3. `offline-runner.cjs` executes the exact
TypeScript regression suite and actual renderer under `node:test` with the
test's declared collaborator substitutes. Actual XML serialization,
manifest wording, content digests and artifact hashing execute. Source,
asset and governance collaborators are controlled test boundaries, not
certifications of their production behavior. DOCX and PDF libraries are
explicit adapters exposing render inputs; they do NOT produce real Office
or PDF files and do not establish formatting fidelity.

| Same executed suite | Tests | Pass | Fail | Skip |
|---|---:|---:|---:|---:|
| Original hash-verified renderer | 25 | 4 | 21 | 0 |
| Patched renderer | 25 | 25 | 0 | 0 |

Eight cases use different document labels through the identical shared
function. They demonstrate category-independent handling, not eight native
end-to-end template or regulatory-pathway approvals. Other cases cover
mutable section arrays, body/manifest consistency, headings/order, nested
provenance and actor context, signature dates, QMS manifests, working-copy
labels, retained company presentation, concurrent exports, invalid formats,
uncopyable data and existing source/converter refusals.

`execution.json` records individual outcomes, raw-log SHA-256 values, tested
Git blob identities and zero syntax/transpilation diagnostics for the two
changed TypeScript files. Transpilation is NOT a full semantic type-check.
The unchanged digest collaborator was copied from the same inspected commit
and verified as Git blob `00dcac697f3c76b0478cacd863efc3bf2543b5af`.

Reproduce with Node 22 and the repository's existing TypeScript dependency:

```sh
node --test docs/evidence/D2-DOCUMENTS/2026-11-04-render-snapshot/offline-runner.cjs
DOC_EXPORT_BASELINE=1 node --test docs/evidence/D2-DOCUMENTS/2026-11-04-render-snapshot/offline-runner.cjs
```

The baseline command intentionally fails 21 cases. A shallow clone needs the
baseline commit. The local run supplied a connector-retrieved baseline via
`DOC_EXPORT_BASELINE_FILE`; the adapter checks its Git blob identity before
using it. This changes only the test source, not application behavior.

## Native and live acceptance still required — not passed here

The workspace had Node/TypeScript but not installed repository test and
rendering dependencies; GitHub/npm DNS access was unavailable. Native Vitest,
whole-repository TypeScript/build/pre-push, actual Word/PDF opening and layout,
HTTP export/source-change refusals, Vault filing compensation, QMS copy
issuance, tenant authorization, signature ceremony and browser qualification
remain open. No Neon credentials, live customer data, model settings or
deployment were changed. Queued CI is not a pass.

```sh
npx vitest run server/services/authoring/__tests__/authoring-export-snapshot.test.ts
npx vitest run server/services/authoring/__tests__/ordinary-authoring-pdf.test.ts server/services/company-documents/__tests__/correspondence-rendering.test.ts
NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p .
npm run ci:one-design-plan
```

Continue the broader all-document acceptance inventory through generic save,
review, signature, historical-version reading and the specialist exporters.
The existing product already has those paths; extend and verify them rather
than creating parallel document machinery. This repair establishes one
shared input-consistency protection, not that every document workflow is
finished or commercially qualified.

## Rollback

Revert this single repair commit through normal change control; there is no
schema or data backfill. Reverting restores the demonstrated mutable-input
export risk and does not qualify the previous behavior.
