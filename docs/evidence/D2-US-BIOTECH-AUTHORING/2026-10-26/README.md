# US biotech authoring completion

W1 / D2. Contract: `docs/design/US_BIOTECH_AUTHORING_COMPLETION_2026-10-26.md`. Local/Codespaces only. Canonical direct normal publication, no PR/deployment/provider/agency action.

## What already exists

- Canonical filing registry and blueprint/task owners: `shared/regulatory/global-document-registry.ts`, `filing-catalog.ts`, `project-bootstrap.ts`, dedicated blueprint catalogs. No second registry.
- Existing outline/metadata/editor projection owners: `server/services/market-specs/document-template-library.ts`, `lifecycle-record-outlines.ts`, `ind/ctd/lifecycle-document-types.ts`, `regulatory/templateCatalog.ts`, `authoring/builtin-authoring-templates.ts`. Core clinical outlines are present but exact metadata omissions disable AnA in those starts; detailed lifecycle subtypes lack starts. Whole filings retain preparation policy.
- Existing CMC contentType policy in the CTD record is lost by `ctd-component-outlines.ts`; exact standalone components can expose source-supported narrative while original data stays manual. Existing PLR section records and seven-part nonclinical working-report records can be reached in the same library, with US label applicability/original SPL and original GLP/signature/tabulation limits. Their separate legacy PI/unretained-job stores are not claimed as verified project source lineage.
- Existing IND deliverable selection in `authoring/ind-authoring-templates.ts` maps the early protocol outline to a broad study-report/CSR tree and SAP to one heading despite detailed protocol/SAP owners. Correct selection, not duplicate outlines.
- ProjectPlan, AuthoringCreateExport and AuthoringTemplatePicker own project-to-editor starts. Non-IND/device plans and filing-guided suggestions are incomplete. DocumentWorkbench remains the sole editor.
- Existing workflow-copy/source admission and governed authoring writers own provenance, drift, current access and saved versions. Respond/AgencyResponses plus response-service own questions/answer revisions/signatures/packages; complete their same-editor bridge without another answer writer.
- `registryCoverage.ts` and `regulatory-coverage-report.ts` own measurement. `docs/biotech/BIOTECH_DOCUMENT_COMPLETION_MATRIX.md` withdrew lexical claims; extend it with current facts/evidence. Existing competitive analysis has unsupported claims and is corrected against current public vendor/FDA sources.
- Existing Pino logger stdout diagnostics interfere with larger machine-readable report output. Retained report failures/diagnostic captures show truncation, interleaving and a failed synchronous-pipe approach. An explicit CLI stderr destination in the same logger preserves diagnostics/redaction and normal server behavior; no assertion is relaxed.

Full discovery paths, limits, deleted-name search, cross-segment vaccine-EUA/RFD gaps and contracts are in the design. Template presence, blueprint readiness, an editable working copy and actual filing readiness are different facts. All human/live-provider/agency results remain unqualified unless separately recorded.

## Status

Discovery and interface contracts published before production changes. Original failures and source pins will be retained by each owned scope. Root owns integration and publication; no claim of Weave parity or complete biotech product readiness is made from this record alone.
