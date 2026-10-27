# US biotech filing completion

W1 / D2. Contract: docs/design/US_BIOTECH_FILING_COMPLETION_2026-10-27.md. Direct canonical/local-only continuation after ef8d6e8b1.

## What already exists

- `shared/regulatory/global-document-registry.ts` is the single filing registry. Current US selection has32medicinal entries plus cross-segment EUA/RFD; the retained CLI inventory and actual HTTP probe are in the preceding packet. Many entries remain preparation-only;351K/505B2/accelerated/rolling read generic16-part CTD, and PMR reads a protocol rather than a requirement/status submission.
- `project-bootstrap.ts`, `sectionBlueprintCatalog.ts`, `taskBlueprintCatalog.ts` and `projectBootstrapFromRegistry.ts` own project work structures. Dedicated and lifecycle sources already exist; extend their exact resolution rather than adding a second registry or project engine.
- `ind/ctd/lifecycle-document-types.ts` owns detailed document records, FDA meeting timelines and package core; `us-biotech-lifecycle-templates.ts` projects12existing component records. D/INTERACT are in the reference core, absent from canonical starts and several meeting consumers. `post-approval-knowledge.ts` classifies biologic changes, but its annual planner emits NDA sections with a biologic note. Existing BLA supplement outline borrows NDA PAS.
- Expanded-access references already distinguish312.310/315/320 and emergency individual access. `FDAFormsRegistry.ts`, `ind-forms/*`, `forms/fill-official-pdf.ts` and reviewed PDF/XFA assets own official forms; no3926 asset/field map is admitted. Reuse those engines and their original-asset/review gates.
- The sole `DocumentWorkbench`, library/templateCatalog/builtin projection, source intake/assembly, saved-source drafts, AnA tools, revision/review/signature/export and response writer are already implemented. Exact source/role/version protections from the preceding work remain authoritative; no alternate editor, answer writer or template bank.
- `company-documents/designs.ts`, `history.ts`, `readPublishedCompanyVariant`, `company_document_revisions` and `correspondence-rendering.ts` already stage/review/publish scoped company formats and export exact retained variants. Ordinary editor does not bind them. `tpl_*` extraction store is separate from UUID structural templates and independent company-design publication; a verified toggle or chat request is not actual application of a format.
- Existing ordinary rich DOCX/PDF exporter preserves structured blocks; mapping a format currently omits some heading/paragraph/table settings. Complete existing rendering, not a new exporter or arbitrary Word fidelity claim. `BIOTECH_DOCUMENT_COMPLETION_MATRIX.md` and the existing coverage CLI remain the single coverage record/report; no parallel readiness ledger.

## Status

Discovery and interfaces published before production edits. Source/template/project/form/company-format completion remains in progress. No complete-filing, clinical correctness, provider/human or live-agency acceptance verdict is inferred from the prior inventory. Root owns global jobs and Git; implementation scopes do not overlap.
