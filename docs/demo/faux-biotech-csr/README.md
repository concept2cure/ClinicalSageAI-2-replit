# Faux Biotech demonstration — one project flow, CSR selected, synthetic revision 2

**Current data: revision 2. Hosted provisioning and ingestion: NOT PERFORMED.**
This package is entirely fictional. It is not clinical evidence, a completed CSR,
a regulatory submission, or proof of a working hosted demonstration.

## Project map: one system configured by document type

Founder clarification, 2026-11-02: **CSR is a document type selected in Project
Management. It is not a separate module, application, workspace or editor.** IND,
BLA and CTD likewise configure the shared project/document/filing flow rather than
creating separate applications. The selected definition determines the choices,
questions, evidence requirements and document-building behavior that follow.

Existing references, not another architecture plan:
- `shared/regulatory/project-map.ts`: document-type-derived milestones and capability metadata, now with this clarification.
- `.design/client-journey/INFORMATION_ARCHITECTURE.md`: existing capability placement and shared UI owners.
- `docs/design/ONE_DESIGN_PLAN.md`: the project, Data Room, evidence, AnA, one editor and governed lifecycle.

| Shared step | What the person does | What varies with the selected definition |
|---|---|---|
| Project Management | Define the project, goal, hypothesis, trial/protocol, team and history; select the intended document/filing type. | Applicable project facts and requirements. For this demonstration, select CSR for FBT-201. |
| Accompanying choices and questions | Answer contextual prompts, confirm information found in supplied records, and resolve missing facts. Reuse known answers. | For example, relevant study/protocol version, report scope, source data cut, analysis plan and review responsibilities; not an identical questionnaire for every type. |
| Project uploads and Data Room | Upload through the existing project. Catalog originals, versions, classifications, processing status, provenance and relationships in its existing Data Room. | Applicable dataset/document organization, supported mappings and validation findings. Uploading does not itself establish conformance or approval. |
| Evidence and readiness | Use the existing applicable engines and source-review controls on that project's authorized records. | Required analyses, tables, checks and evidence gaps; actual run/source/version references remain attached. |
| Canvas and the one editor, with AnA | Open the same document-building environment. Draft directly, use existing drafting controls, or direct AnA; edit and save the same document. | Outline, templates, sections, evidence context and applicable tools. No separate CSR generator, document store or editor. |
| Shared review and delivery | Use linked tasks, messages, comments, versions, review and authorized signatures; export or file where appropriate. | Required reviewers, checks and delivery format. A CSR project need not pretend to be a complete agency submission. |

This is the required journey and acceptance map, **not a claim that each UI
connection is already working**. Existing backend organization/client identifiers
continue to serve access and scoping. They must not be described as new customer
workspaces or exposed as a second document-type-specific product journey.

## Applying the map to the example

**Faux Biotech Therapeutics** is the fictional client/organization name, not an
application module. **FBT-201** is the project in the existing Project Management
module, with **CSR** as its selected document type and the study facts and history
recorded there. The synthetic files belong in that project's Data Room and feed
its existing canvas, editor and AnA. No separate "Biotech workspace" or "CSR
workspace" is part of this demonstration.

Use the existing authorized organization/membership and project-creation paths.
Where existing APIs require a client identifier, resolve it through their existing
scope controls without inventing another user-facing setup module. FBT-102
(nonclinical/IND planning) and FBT-202 (Phase 3 planning) remain optional proposed
project examples; neither is required to build FBT-201's report. These are still
proposed names, not confirmed application records.

Retain actual returned file IDs/hashes, complete applicable source review, and
use the existing preview/freeze and drafting controls inside the shared authoring
flow. Preserve unknown exposure, lab-range classification, vital signs, source
approval and provider/model readiness as unresolved. A saved JSON file does not
create a Vault document, clinical table, CSR build, review task, signature or
filing. No NCT number or agency identifier is invented.

## Current operational seed and shared-editor handoff (2026-11-02)

The existing API-only demonstration seeder now includes `--pack faux`. **This is a data pack, not a CSR module or a second product workflow.** It runs under a separately authorized and explicitly identified Faux Biotech organization, and its seed records are created only through the application's existing Project Management, Data Room, Authoring and Tasking APIs.

The seed first verifies the revision-2 compressed and decompressed SHA-256 against `REVISION_PROVENANCE_v2.json`, verifies the original synthetic CSV bundle checksum, and reconciles raw ADSL/ADEFF/ADAE/ADLB records plus the QC index and efficacy/safety TLFs before writing any data. and the current canonical authoring template `component:clinical_study_report`. It refuses either condition **before creating client/project/source records**. A real operator must provide the numeric tenant through `--organization-id` or `DEMO_EXPECTED_ORGANIZATION_ID`; `--pack all` never includes this customer.

The intended FBT-201 journey is now: Project Management project with document type **CSR** and recorded objective → **ten** original, fictional supporting sources in that project's Data Room (CSR JSON, protocol, SAP, subject QC index, two reconciled TLFs, and four raw ADaM-inspired subject/efficacy/AE/ALT CSVs) → **one existing Authoring editor** with the canonical ICH E3 component template and seeded empty sections → an explicitly **pending** review task with `sourceEntityType: authoring_document` and the exact authoring document UUID. This task uses the existing Tasking-to-editor navigation, not a parallel CSR surface.

The seed reopens the document through the existing `GET /api/authoring/docs?status=all&programId=...` read and verifies project, template and section count; it fails on duplicate titles, wrong template binding, mismatched source hashes or unrelated organizations. None of these steps applies source approval, generates an AnA narrative, completes review, signs electronically, or files a dossier. Those steps require the real governed user journey and its evidence.

**Operator command and verified boundaries:** [Faux demo seed runbook](../../evidence/DEMO/faux/README.md). The full app's native `node --test scripts/demo/launch-demo/faux-demo.test.mjs`, TypeScript/build and hosted browser validation remain required; focused source-level tests against controlled API doubles do not qualify a deployment.

## Current files

- `FBT201_CSR_SOURCE_SYNTHETIC_v2.json.gz` retains the complete structured source
  in GitHub. Decompress it and upload the resulting `.json` through the existing
  project/Data Room/Vault ingestion path. Do not upload the gzip file as if it
  were supported clinical-source JSON.
- `FBT201_ADAM_INSPIRED_SOURCE_CSV_BUNDLE_v2.json.gz` preserves the **four complete** original synthetic ADaM-inspired analysis CSV files (ADSL 160, ADEFF 320, ADAE 79, ADLB 320 rows) with independent SHA-256 receipts. The seed decompresses them and uploads each CSV separately. **These are not official CDISC ADaM XPT datasets** and have not undergone scientific or regulatory qualification.
- `ADSL_160_SUBJECT_QC_INDEX.csv` is the corrected 160-row index; placebo identities
  are the original **FBT201-P001–P080**, not the earlier erroneous B-series IDs.
- `TLF_PRIMARY_EFFICACY.csv` and `ANALYSIS_SUMMARY.json` carry revision-2 completion
  totals. Efficacy and safety aggregate counts are unchanged.
- The delivered `Faux_Biotech_CSR_Demo_Revision_2.zip` contains the uncompressed
  JSON, revised ADSL, unchanged ADEFF/ADAE/ADLB, protocol/SAP, updated TLF/CSR draft,
  traceability, proposed tasks, correction log and preserved original archive.

## Correction of the earlier package

Three original synthetic records had both AEWITH=Y and COMPLTRT=Y:
FBT201-A003, FBT201-A067 and FBT201-P006. Revision 2 changes only their treatment
completion flags to N, explicitly uses end-of-treatment disposition, and updates
the associated participant/disposition records and totals. No real clinical
source is changed. The original source bytes remain in the handoff archive.

| Measure | FBT-201 200 mg | Placebo |
|---|---:|---:|
| Randomized / ITT / safety | 80 | 80 |
| Week 12 PASI75 responders | 52 (65.0%) | 30 (37.5%) |
| Treatment completed — revision 2 | 74 | 76 |
| Subjects with TEAE | 42 | 37 |
| Subjects with SAE | 3 | 2 |
| AE-related treatment withdrawals | 2 | 1 |

Earlier dated reconciliation notes and the original 76/77 completion totals are
**historical, not the current import source**. Their checksum checks did not prove
cross-record consistency. The earlier QC index's placebo IDs were incorrect.
Do not mix the revision-2 source with an original completion table or draft.

## Verification scope

The previous revision-2 evidence records that
`node --test tests/ops/csr-demo-source-consistency.test.mjs` executed the actual
source file's cross-record refinement functions: **21 passed; the original
validator failed four of these cases.** It did not execute Zod's field parsers.
The extended native-schema suite is
`shared/__tests__/csr-source-input.test.ts`; its execution is not established here.
Native schema acceptance, PGlite, full TypeScript/build and hosted/browser acceptance
remain open. Evidence: `docs/evidence/D2-CSR/2026-11-02-faux-source-reconciliation/`.
This project-map clarification is documentation, not an additional test run or
product behavior change.

The consistency gate applies only to explicitly end-of-treatment disposition.
A subject can stop treatment and still complete study follow-up; end-of-study and
unspecified disposition are not reinterpreted as treatment completion.

## Live acceptance remains unexecuted

Start in **Project Management**, select **CSR**, follow the applicable choices and
questions, and reopen the saved project. Upload/catalog sources in its **Data Room**;
preview the available evidence and open the **same canvas and editor with AnA**.
Draft, edit, save and reopen the report. Open its reviewer task and exact document,
and complete review through actual authorized controls. Verify shared Tasking,
Communication and other advertised destinations without abandoning the project's
identity or evidence context.

Requiring a separate CSR application, disconnected editor or repeated manual
transfer of the same project facts is a gap against this map. Do not represent
proposed CSV tasks or example narrative as executed reviews or real signatures.
