# FDA forms implementation audit — 2026-07-29

## Scope and verdict

This audit covers commits `cb50c6f`, `efd5aad`, and `312a7a2`: the FDA registry,
priority form builders/PDF service, IND routes/QC, AnA tools, and Document Studio
handoff. **Verdict: partially implemented; not release-ready as an “all FDA
forms” capability.** The canonical registry and seven priority builder paths are
useful foundations, but the registry is not a complete snapshot of the FDA
catalog and no reviewed official FDA PDF assets are installed.

## Duplicate/reuse investigation

Before further implementation, the repository was searched by filename, symbol,
route mount, tool registry, template registry, and artifact writer. The following
existing components were found and are now the required integration points:

| Existing component | Responsibility | Decision |
|---|---|---|
| `server/config/FDAFormsRegistry.ts` | Canonical FDA form metadata | Reuse; no second catalog |
| `server/services/FDAFormGenerator.ts` | Existing universal registry-driven form generator | Extended in place for editable drafts and validation |
| `server/routes/fda-forms.routes.ts` | Existing project form generation/version storage | Preserve; do not create a parallel project route |
| `server/services/fda/index.ts` | Existing unified FDA service facade | Preserve; it already delegates to `FDAFormGenerator` |
| `server/services/ind-forms/*` | Existing specialized official-template/fallback PDF path for priority IND forms | Reuse only for priority PDF fidelity; do not generalize by fabrication |
| `fetch_template_and_fill` | Existing tenant-scoped DOCX template tool | Preserve for document templates; FDA structured drafts are not DOCX template IDs |
| AnA `artifact_draft` + `artifactVersionStore` | Existing single-editor handoff and durable versions | Reuse; no FDA-specific editor/canvas store |

The initial implementation added `fda-forms-tools.ts`,
`fda-forms-tool-defs.ts`, and a standalone FDA tool test. That split duplicated
responsibilities already owned by `FDAFormGenerator`, `AnaToolDefinitions`, and
the existing AnA handler tests. Those three files have been removed. Their logic
now extends the existing generator and registries in place.

The investigation also found two pre-existing generator defects relevant to
client use: universal HTML values were interpolated without escaping, and falsy
values were collapsed with `value || ''`. Both are remediated in the existing
generator rather than wrapped in another service.

## Verified working

1. One registry supplies governed metadata to both HTTP and AnA discovery.
2. Forms 1571, 1572, 1574, 3454, 3455, 356h, and 3674 have deterministic field
   builders and draft PDF paths; 1572 expands per investigator.
3. Required fields and selected semantic rules feed fail-closed QC.
4. AnA can list every *registered* form and prepare/amend it into the existing
   `artifact_draft` envelope. No second editor or FDA-specific UI was added.
5. Amendments require a reason. This audit fixed the handoff so that reason is
   passed into `upsertDocumentArtifactVersion`, rather than being discarded by
   stream collection.
6. Structured form values are embedded in each immutable document-version
   content as base64-encoded `FDA_FORM_DATA`, preserving the exact field map alongside the
   human-editable rendering.

## Findings

### F-01 — Critical — “Every FDA form” is not delivered

`FDAFormsRegistry` contains a small curated set, not every form on FDA’s current
catalog page. `list_fda_forms` correctly lists the canonical registry, but it
must not be described externally as the complete FDA catalog. FDA catalog
retrieval was blocked in this environment, so completeness and currency could
not be established.

**Release gate:** blocked until a reviewed catalog snapshot/import, source URL,
edition/expiration metadata, checksum, and reconciliation report exist.

**Remediation applied:** the canonical registry now owns a pure snapshot
reconciliation gate that reports missing forms, duplicate form numbers,
registry-only entries, and invalid/non-FDA source URLs. An empty or discrepant
snapshot cannot report `reconciled: true`. The actual FDA snapshot remains
blocked on network-enabled reviewed ingestion.

### F-02 — Critical — official form fidelity is not established

No reviewed AcroForm assets or complete AcroForm field-name mappings are
installed. The PDF service therefore produces labeled, watermarked draft PDFs.
These are not official forms and must not pass approval, signature, export, or
submission gates.

**Release gate:** blocked until official assets and mappings are independently
verified against golden filled-form fixtures.

**Remediation applied:** the existing IND PDF engine now refuses every asset
without a reviewed FDA-source sidecar manifest, matching SHA-256, and complete
canonical-to-AcroForm field map. This secures future ingestion but does not make
the currently absent official assets complete.

### F-03 — High — “full” is an implementation tier, not regulatory verification

Priority definitions deliberately use version `unverified`. The word `full`
only means that a builder and draft PDF path exist. API and AnA consumers must
show both attributes and must never translate `full` into “current” or
“FDA-verified.”

**Remediation applied:** AnA now returns a machine-readable release-readiness
gate. `pdfAvailable` remains false for unverified editions; `draftPdfAvailable`
separately reports the implemented watermarked renderer.

### F-04 — Remediated — generic conditional required rules

The registry now uses a typed, non-executable conditional-rule structure. The
generic AnA validator evaluates conditional `required` rules; Form 356h uses it
to require `application_number` for supplements. Complex investigator financial
logic remains in the dedicated 3454/3455 builders rather than an unsafe string
expression evaluator.

### F-05 — High — AnA preparation is not equivalent to official PDF generation

`prepare_fda_form` and `amend_fda_form` create editable Document Studio drafts.
They do not call the AcroForm renderer, approve, sign, export, or submit.
`draftPdfAvailable` communicates renderer capability; `pdfAvailable` remains
false until official assets are verified.

### F-06 — Medium — persistence depends on complete AnA context

The stream persists a draft only when organization, project, and thread context
are present. Without those values, the client still receives an editable draft,
but no durable artifact version is created. This is existing Document Studio
behavior and should be surfaced by the consuming experience.

### F-07 — Medium — structured data is versioned inside content, not columns

The artifact-version schema has no JSON metadata column. Exact structured form
values are now preserved in the immutable version content via the base64-encoded
`FDA_FORM_DATA` envelope,
but downstream analytics must parse that envelope. A future schema change may
add version-level JSON without rewriting historical versions.

### F-08 — Medium — no end-to-end browser proof

Unit, contract, registry, and tool-wiring tests pass, but there is no authenticated
browser test proving that an AnA-generated FDA form opens, saves, reloads, and
amends in Document Studio. No UI was built in this workstream, as instructed.

## Required release work

1. Import and reconcile the complete FDA catalog using a network-enabled,
   reviewed ingestion job; do not hand-copy or duplicate definitions.
2. Install official assets once by canonical ID and record URL, retrieval time,
   edition/expiration, SHA-256, and reviewer.
3. Map and golden-test every field for the seven priority PDFs.
4. Extend the typed conditional-rule evaluator only as additional reviewed forms
   require new operators; never evaluate registry strings as code.
5. Add project/thread-required persistence telemetry and an authenticated
   Document Studio round-trip test.
6. Keep all metadata-only forms fail-closed for PDF, approval, and submission.

## Audit evidence

- Registry and AnA contract tests cover canonical reuse and tool reachability.
- Builder, AcroForm fallback, QC, and route contract tests cover the priority
  service paths.
- TypeScript compilation and security-pattern checks remain required gates.
