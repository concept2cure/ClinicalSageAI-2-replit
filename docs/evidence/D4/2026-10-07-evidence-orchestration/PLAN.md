# Evidence-to-application enhancement contract

Base: `16bbf5b070ecfc186d7addaa1b6b96e384d6fe87`. Control tower: Codex.
Workstream: launch validation (D4), existing Projects / Vault / Authoring /
Reporting handoffs. This is not a claim that launch rows D1–D10 are complete.

## Goal and boundaries

Receive client evidence, manage it in the existing Data Room / Data Catalog,
curate it for a stated purpose, preserve deterministic scientific results,
and support expert-reviewed regulatory writing and packaging. Continue on
`concept2cure-v2`, directly, with no new product surface, dependency, parallel
ingestion engine, data store, automatic approval, or claimed agency acceptance.

## Approved parallel contracts

1. **Intake consistency:** reuse the canonical upload and text-extraction
   paths. Shared format declarations must distinguish accepted byte storage
   from actual supported extraction. Projects/chat and Vault retain their
   existing size limits, scanner, tenant/project checks, explicit filing,
   and honest extraction-failure status. Add scientifically useful formats
   only where the canonical extractor actually supports them; do not claim
   legacy DOC/XLS parsing, dataset validation, or Japanese OCR qualification.
2. **Scientific result fidelity:** extend the existing `engineResultToHtml`
   interface with optional structured result tables. Existing callers remain
   compatible. Biostat Authoring handoff must include the same tables shown
   for the actual engine result, escaped as text, with the existing complete
   calculation hash/provenance. Preserve draft status and existing export
   restrictions. No model-generated numbers or new calculation engine.

Workers own disjoint files. Tests demonstrate each defect before its fix;
workers do not commit or push. The control tower reviews, runs shared gates,
and publishes the combined tested tree. Evidence documents separate unit /
component checks from live-provider, staging, and qualification evidence.

## Next bounded work

- **Approved derived-spreadsheet contract:** extend `saveDerivedUpload` with
  optional derivation metadata used by `edit_spreadsheet` only. Persist a
  source-file/hash and edit receipt in the existing chained audit. When a
  valid open program resolves through the canonical ownership resolver,
  capture the new file through `createSource` on the same transaction as its
  upload/audit. Retain originals, do not supersede them, and do not claim
  extraction, scientific qualification, recalculated formulas, or filing.
  Existing authoring-image callers without derivation retain their contract.
  A requested but unresolved project fails before writes; no-project results
  remain conversation uploads with explicit capture status. The source's
  tenant, stored hash and eligibility are checked again before the commit.
- **Approved CSV-cell fidelity:** verify the existing ExcelJS reader does not
  silently turn subject/lot IDs, long numeric identifiers or date-looking
  labels into numbers/dates. Where confirmed, preserve raw CSV field strings
  through reading and untouched cells in edited XLSX; typed scientific mapping
  remains explicit. Keep existing XLSX cell types and explicit edits unchanged.
- Strengthen medical-writing inquiry/review against explicit source and study
  limitations; never label a keyword match or source receipt as scientific
  qualification or client approval.
- Record honest intake capabilities and unavailable bridges so AnA can ask
  for the correct source, mapping, units, study identifiers, and review.

## Broader gaps remain open

Connector search is not canonical source import. Generic inbound SFTP, watched
cloud folders, archive ingestion, raw XPT/Define-XML dataset loading, complete
raw CMC analytical validation, and a unified purpose-qualified curation UI are
not established by these changes. Existing CMC engines/registers and CSR typed
tabulation paths are retained. FDA / EU / Health Canada / PMDA release acceptance
requires region-specific validation and human-controlled submission evidence.

Implementation status and exact test / publication receipts will be recorded
in this directory as work completes.
