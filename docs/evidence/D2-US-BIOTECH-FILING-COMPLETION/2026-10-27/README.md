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

## Integration increment (2026-10-29): contract item 1 and the wiring of item 2

Extends the existing owners only; no second registry, no copied heading tree, no new editor.

- Registry (`shared/regulatory/global-document-registry.ts`): the 16 identities beside their neighbours, US / FDA / `pharma_biotech`. Letters and forms state `dossierStandard: 'none'`. Expanded access and the drug or biologic EUA state `regional` and do not assert eCTD. BLA-licence filings name `US_BLA` as parent. The device `US_EUA` stays separate.
- Records: the four `ind/ctd/us-biotech-*-sources.ts` modules are appended into `LIFECYCLE_DOCUMENT_TYPES` (37 records, no id collision, no circular initialization). One map, `US_BIOTECH_LIFECYCLE_RECORD_BY_REGISTRY_ID`, feeds both the outline map and the project sections. `US_BLA_SUPP` now reads `us_bla_pas` (601.12(b)), not `nda_pas`. The BLA PAS, CBE-30 and CBE-0 records name the Module 1/2.3/3 sections a change updates, as their NDA counterparts do.
- Exact project structures: `sectionBlueprintCatalog.ts` projects each record (`registry/blueprints/usLifecycleRecordBlueprints.ts`), with the blueprint id equal to the entry's `defaultSectionBlueprint`. `project-bootstrap.ts` adds six task plans. Type D and INTERACT submit their package with the request. Every new identity names its plan.
- Live create (`POST /api/c2c/projects`): 17 filing document classes. `bla_pas` takes `US_BLA_SUPP` out of `pas`. Their packs are generated into `migrations/20261029_us_biotech_filing_class_packs.sql`, which is on the applier after `20261020`. `project-intake.ts` refuses a class filing sent under another program type, so a subtype never becomes the initial IND/NDA/BLA.
- Meeting consumers: the outline map, AnA drafting, the agency-meetings skill, the template starts and `filing-document-classes` (own classes, not `briefing`).
- Annual planner (`post-approval-knowledge.ts` `planAnnualReport`): a licensed biologic gets the 601.12(d) record's parts, citations and separate-report guidance, not NDA sections with a note. The new `biologicLicense` input is also on the AnA tool.

Receipts (raw output in `integration/`):

| Run | Result |
|---|---|
| RED: intake guard and exact blueprints removed | 25 failed / 64 (`identity-red-output.txt.gz`) |
| GREEN: identity tests and real-router PGlite create (one identity per family, real scaffold, real pack migrations) | 64 / 64 (`identity-green-output.txt.gz`) |
| Affected registry, bootstrap, lifecycle, pack-contract and route suites | 2253 passed, 5 failed (`affected-suites-output.txt.gz`) |
| Client wizard and registry suites | 229 / 229 (`client-suites-output.txt.gz`) |
| `tsc --noEmit -p .` | 0 errors |
| Six migration gates | OK |

The 5 failures also fail on a clean `git archive HEAD` export. Four are CSR-outline pins (`csr-e3-overlay`, `template-library-truth`, `document-template-description`). The fifth is the 392-object builtin pin, which HEAD already reports as 413.

This change does lengthen the `get_document_template` description, from 1461 characters at HEAD to 2070, against a 1024 cap that HEAD already exceeded. Only the trailing "kept by hand" clause grows. That clause also mislabels the lifecycle-component starts as hand-kept; that mislabel predates this change.

Not done here: every new basis is recall, because eCFR and fda.gov are refused by egress, so no regulator text was re-read. Form FDA 3926 has no registry entry, asset or field map. The NDA annual report entry keeps its "NDA/BLA" display name. No human or agency acceptance is inferred.
