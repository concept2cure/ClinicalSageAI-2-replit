# Reach MDX features through the client project workflow

2026-10-23 · W1 / D2 · canonical `concept2cure-v2` only.
Evidence belongs under `docs/evidence/D2-MDX-PROJECT-WORKFLOW/2026-10-23/`.
The requested change extends Projects and the existing MDX work-package compiler;
it does not introduce another application, editor, evidence store or submission engine.

## What already exists

Audit source: `5ff6d225274079e9a08444409471394d9963970c`. Paths below are repository-relative.

| Existing piece | What it does today | Limit relevant to this change |
| --- | --- | --- |
| `client/src/concept2cure/v2/surfaces/Projects.tsx`; `server/routes/c2c/projects.ts`; `server/routes/c2c/project-intake.ts` | Canonical project creation, product/filing identity, classification facts and governed document scaffolding. | Do not create a device-specific wizard or infer unstated classification facts. |
| `client/src/concept2cure/v2/surfaces/ProjectHome.tsx`; `fixtures/project-home-data.ts` in the same v2 tree | Existing Plan/Evidence/Author/Review/Submit/Respond navigation, files, documents, tasks, reviews, markets and records. | Lifecycle navigation is not proof of stage completion. MDX discipline work is not yet presented as a coherent project journey. |
| `shared/regulatory/work-packages.ts`; `server/routes/mdx-work-packages.ts`; `shared/regulatory/__tests__/work-packages.test.ts` | Deterministic, dependency-linked device/IVD work packages, tailored by specialization and pathways; deduplicates shared evidence and unions consuming filing sections/markets. Read-only `GET /api/mdx/work-packages?programId=UUID`. | Search found no client caller. Packages lack discipline ownership, explicit applicability, specialist benches, and sufficiently distinct CER/PER workflows. This is the compiler to extend and reach. |
| `client/src/concept2cure/mdx/MdxSurfaceHost.tsx`; `surfaceIds.ts`; `v2/surfaces/DeviceSurfaces.tsx` | Existing device features use the single v2 shell, project selection and editor handoff. | Host can fall back to another same-pathway program, and software to the first program, when selection does not match. Project-first entry must preserve the selected identity rather than silently substitute. |
| `client/src/concept2cure/v2/registryModel.ts`; `mdx/data/nav.ts` | Existing surface identities, client/workflow discovery and legacy MDX nav metadata. | Discipline features are discoverable as disconnected applications/workspaces. Correct discovery while retaining their reachable outcomes. |
| `client/src/concept2cure/v2/surfaces/WorkflowCatalog.tsx`; `catalogWorkflows.ts` in the same v2 tree; `shared/constants/launch-scope.ts` | Existing real module catalog, search and work-area composition, backed by individual module access verdicts. `AdminSurfaces.tsx` reexports this one catalog. | Nest MDX feature access inside Projects while preserving search, unknown capabilities and each feature's governed access controls. |
| `mdx/surfaces/K510Surface.tsx`, `DeviceProfilePanel.tsx`, `OfficialEstarPanel.tsx`, `EstarFilingPanel.tsx`; `server/routes/510k-device-routes.ts`, `510k-estar-routes.ts`; `server/services/pathway-engines/estar/` | Predicate/profile, SE comparison, authored sections, official eSTAR fields/attachments, exports and filing checks. | A planning link or completed document does not establish agency acceptance, transmission, or readiness. Reuse existing validation and governed actions. |
| `mdx/presub/PreSubManager.tsx`; `server/routes/q-sub.ts`; `server/services/q-sub/q-sub.service.ts` | Existing Pre-Sub/Q-Sub records and authoring. | Reach from strategy and authority interactions rather than a separate app. |
| `mdx/surfaces/EngineeringSurface.tsx`; `server/routes/mdx-engineering.ts`; `v2/surfaces/DesignControls.tsx`; `shared/regulatory/qmsr-crosswalk.ts` | Engineering documents, design-input/output traceability, DHF view and current QMSR crosswalk. | Engineering aggregation explicitly includes organization-wide design controls, DHF, change requests, nonconformances and some artifacts. Do not label these project-specific merely by adding a link. |
| `mdx/surfaces/SoftwareSurface.tsx`; `server/routes/mdx-software.ts`; `cybersecurity-524b.ts`; `server/services/regulatory/cybersecurity-524b.ts` | Software lifecycle records, completeness and deterministic SBOM/§524B presence assessment. | §524B applies to cyber devices; software guidance, safety class and documentation level are distinct determinations. |
| `v2/surfaces/HumanFactors.tsx`; `server/routes/human-factors.ts`; `server/services/human-factors/hf-files-service.ts` | HFE/UE files, use scenarios, use-related risk and element presence. | Existing file read is organization-scoped. Presence/completeness is not successful usability validation. |
| `server/routes/mdx-risk-management.ts`; `risk_items`/`risk_controls` in `shared/schema.ts` | Program-scoped risk records, controls, verification references and summaries. | Clinical conclusions and labeling must retain links to the risk file; no automatic benefit-risk acceptance follows from planning. |
| `server/routes/mdx-qms.ts`; `v2/surfaces/QualityModule.tsx` | Controlled documents, approvals/revisions/training, suppliers, audits, management review, nonconforming product and change control. | Several QMS records are organization-level. Project responsibilities do not grant approval or signing authority. |
| `server/services/market-specs/biocompatibility-matrix.ts`, `electrical-safety.ts`, `sterilization.ts`; `server/services/ana/AnaToolExecutor.ts` and `tool-authorization.register.json` | Existing deterministic specialist requirement helpers reached by `get_biocompatibility_endpoints`, `get_electrical_standards`, `get_sterilization_requirements`; human-factors planning also exists. | Requirements depend on stated contact, power, sterile/reprocessing and other facts. They do not execute laboratory tests or certify reports. |
| `deviceDataCenter`, `deviceTestStandards` in `shared/schema.ts` | Existing lab/report metadata, standards, article configuration, protocol, criteria, result, report provenance and section references. | Schema existence does not demonstrate a current project-scoped ingestion path; reuse the canonical Project Files/Vault path for this navigation change. |
| `mdx/surfaces/IvdSurface.tsx`; `server/routes/mdx-ivd-performance.ts`, `mdx-ivdr.ts`; IVD performance/PER tables in `shared/schema.ts` | Analytical and clinical performance, classifications and PER records, including scientific validity and PMPF fields. | EU IVDR PER must remain distinct from EU MDR CER. Existing shared evidence is not a reason to conflate them. |
| `mdx/surfaces/CerSurface.tsx` and `surfaces/cer/` | Signals, literature search/record/screening, GSPR, equivalence, PMS/PMCF, report structure and export. | Clinical Affairs and a qualified evaluator lead the evaluation; a generator is only an authoring feature. |
| `server/services/literature-recording.service.ts`, `literature-screening.service.ts`; `mdx/hooks/useCerLiterature.ts`, `useCerGspr.ts`, `useCerPmsFeeds.ts`; `server/services/market-specs/cer-structure.ts` | Recorded literature evidence/screening, regulation-specific GSPR, complaints/PMCF and CER structure. | Search/screening alone is not a systematic-review protocol, appraisal, evidence synthesis, or evaluator qualification. |
| `mdx/surfaces/ClinicalStudiesSurface.tsx`, `PostmarketSurface.tsx`, `UdiSurface.tsx`; `server/routes/mdx-clinical-studies.ts`, `mdx-postmarket.ts`, `mdx-labeling.ts` | Existing clinical-study records, surveillance, UDI and labeling/IFU data. | Reach within evidence, authoring and maintenance; retain actual data scope and current lifecycle controls. |
| `v2/surfaces/ProjectTeamResponsibilities.tsx`, `ProjectTeamSharing.tsx`; `shared/project-team.ts` | Existing recorded project lead/owner/membership and sharing. | A discipline named in a plan is a recommended function, not an assigned person, permission, reviewer or signatory. |
| `docs/design/PROJECT_FIRST_PLAN_2026-09-26.md`, `DEVICE_DOCUMENT_AUTHORING_2026-10-20.md`, `DEVICE_PROJECT_INITIALIZATION_2026-10-20.md`, `DEVICE_CLIENT_READINESS_2026-10-23.md` | Prior canonical project, authoring, regional preparation and device identity decisions. | These historical audits describe their own source snapshots. Do not treat every historical gap as a current defect or silently widen author-only regional transport support. |

Searches covered MDX/device/510(k)/CER/PER/IVD/IVDR, project/work-package,
engineering/design/DHF, software/cybersecurity, human factors/usability,
risk/QMS, labeling, manufacturing/supplier/design transfer, bench/electrical/EMC,
biocompatibility/sterilization, clinical performance/literature/PMS/PMCF/PMPF in
client surfaces, routes, services, AnA handlers/register, shared schema and both
migration trees. `git log --all --diff-filter=D --name-status` was run on those
path-name families. **This checkout is shallow** (`git rev-parse
--is-shallow-repository` returned `true`) and the available deletion search returned
no entries. That is a limitation of the history audit, not proof that no earlier
implementation was deleted. No user-facing implementation is removed by this slice.

## Required information architecture

Work starts in **Client → Project → the existing lifecycle**, with the recorded
product configuration, market and filing visible. Device and diagnostic work are
MDX solution features within that project. Preserve one canonical project UUID;
do not infer another project from a title, pathway or first available row.

| Existing project stage | MDX features reached there | Existing destinations |
| --- | --- | --- |
| Plan | Regulatory strategy, ownership guidance, classification, predicate/SE strategy, Q-Sub or EU conformity/NB relationship, tailored work-package dependencies | `ProjectHome.tsx`, canonical compiler, `device-510k`, `device-presub`, `device-cer`, `device-diagnostics` |
| Evidence | Design/DHF, software/cybersecurity, usability, risk, specialist labs, IVD analytical/clinical performance, literature and clinical evidence | `design-controls`, `device-engineering`, `device-software`, `human-factors`, `risk`, existing clinical/diagnostic/CER features, Project Files/Vault |
| Author | Medical writing and clinical evaluation documents, labeling/IFU, SE tables, controlled technical sections | Existing editor handoff, `DocumentsPanel.tsx`, `labeling`, pathway document features |
| Review | QA/document control, discipline reviews, qualified evaluator, acceptance criteria, traceability and open findings | Project reviews/tasks, QMS controlled documents, existing risk/evidence records |
| Submit | Regulatory Operations assembly, eSTAR for applicable FDA filings, EU Annex II/III technical documentation | Existing pathway publishing and submission features; preserve preparation-only limits |
| Respond / ongoing work | Authority questions, changed evidence, post-market vigilance, periodic CER/PER updates and PMCF/PMPF | Existing correspondence/response, surveillance and evaluation features |

The compiler's stable IDs are the shared workflow contract. Extend its existing
`WorkPackage` with `ownerDiscipline`, `contributors`, and human-readable
`applicability`. These are planning metadata. Do not manufacture task completion,
regulatory readiness, evidence approval, actual staffing or access rights.

## 510(k) first: engineering and quality carry the filing

| Discipline | Project responsibility and deliverables | Existing compiler ID / extension |
| --- | --- | --- |
| Regulatory Affairs | Own submission strategy; intended use, product code/regulation number, predicate selection, differences and SE argument, Q-Sub questions/feedback | `regulatory-strategy`; pathway-specific deliverables |
| Regulatory Operations / Publishing | Section/attachment mapping, official eSTAR assembly/format checks, controlled submission snapshot | `submission-assembly`; preserve existing publishing implementation |
| Medical Writing | 510(k) summary, SE comparison tables/narrative, labeling and IFU in coordination with technical authors | `medical-writing` and existing `labeling` |
| R&D / Systems Engineering | Device description, architecture, design inputs/outputs, DHF and traceability | Existing `design-controls` |
| Software Engineering | Description, requirements/architecture, V&V, threat model and SBOM where applicable | Existing `software-cybersecurity` |
| Human Factors / Usability Engineering | Use specification, use-related risk, formative work and usability-validation protocol/report | `human-factors-usability` |
| Manufacturing / Operations | Design transfer, process validation, manufacturing controls and supplier inputs | `manufacturing-transfer`; extend existing QMS/supplier relationships |
| Quality Assurance / Quality Systems | QMSR/ISO 13485 design controls, document control, DHF audit trail and coordinated quality review | Existing `quality-manufacturing` retains its stable ID and owns QA/QMS work |
| Risk Management | ISO 14971 plan, hazard analysis/FMEA, control verification, residual risk and benefit-risk; links into warnings and clinical risk analysis | Existing `risk-management` |
| V&V / Test Engineering | Bench/performance protocols, justified standards, article/configuration traceability, acceptance criteria, signed reports and deviations | Existing `bench-performance-testing` |
| Electrical Safety & EMC | Applicable powered-device standards and external laboratory testing/reports | `electrical-safety-emc`; existing specialist engine |
| Biocompatibility & Materials | Contact/material assessment, evaluation plan and endpoint justification/testing | `biocompatibility`; existing ISO 10993 helper |
| Sterilization & Microbiology | Applicable sterilization/reprocessing, packaging, aging/shelf life, residuals and endotoxin evidence | `sterilization-microbiology`; existing specialist engine |
| Assay Development (IVD) | Precision, LoD, linearity, interference, cross-reactivity and reagent/specimen stability; appropriate CLSI method references | Existing `analytical-performance` |
| Clinical Performance / Medical Affairs (lab medicine) | Comparator/reference method, method comparison, sensitivity/specificity, reference intervals and attributable statistics | Existing `clinical-performance` |

Clinical studies are conditional for a 510(k), rather than an obligatory device
phase. Diagnostics reuse the same project scaffolding while retaining their own
performance bench. A project may record De Novo, PMA or exemption instead of
510(k); display the recorded pathway and do not relabel it as SE work.

## Then CER: clinical evidence carries the evaluation

For an EU MDR device, extend `clinical-evidence` to show the clinical evaluation
workflow, led by Clinical Affairs and a qualified evaluator. The work is an
evaluation plan; systematic search protocol; search and documented screening;
state of the art; appraisal of relevance, methodological quality and data quality;
clinical evidence synthesis and benefit-risk conclusion; qualified evaluator
review; and traceable GSPR conclusions. Literature specialists, clinicians/medical
experts and biostatistics/epidemiology contribute; engineering supplies the device
description and technical/biological/clinical equivalence inputs. Regulatory
Affairs owns the conformity route, notified body relationship, GSPR mapping and
defence of any equivalence claim, including available access to supporting data.

The CER is not the whole EU technical documentation. Regulatory Operations
assembles Annexes II/III using the same project evidence. PMS supplies complaints,
vigilance and PMCF; evaluation updates run on the justified cycle and when new
information changes conclusions. Initial clinical evaluation can proceed alongside
engineering and must support EU conformity before market placement. It is not a
post-US-submission-only stage. Dependencies describe evidence handoffs, not a ban
on starting clinical work until every engineering task is complete.

For an EU IVDR diagnostic, reach existing PER capabilities through
`performance-evaluation`: scientific validity, analytical performance, clinical
performance and integrated benefit-risk, with a performance evaluation plan,
qualified review and **PMPF** maintenance. Keep this distinct from MDR CER/PMCF.
Reuse `analytical-performance` and `clinical-performance` evidence once across
US/EU filings; preserve separate document conclusions, approvals and snapshots.

## Applicability and evidence boundaries

`CompileWorkPackagesInput.deviceFlags` is optional. `undefined`/`null` means
unrecorded; an explicit array records the selected flags. Unknown applicability
remains conditional in the plan rather than silently becoming not applicable.
SaMD identity itself establishes software work. The existing `cyberDevice` flag
governs statutory §524B planning; SBOM presence is not cybersecurity approval.
Sterile and clinical-data flags tailor applicable work. Existing flags do not
fully establish body contact, power, reprocessing or exact clinical-study need;
specialist helpers and accountable reviewers make those determinations.

The plan links requirements/claims → risk → controlled evidence/configuration →
authored sections → review → submission snapshot. Every reusable item retains
its origin, protocol, acceptance criteria, version and actual review outcome.
No navigation action copies evidence between projects or grants signing rights.

## Qualification for this increment

Extend existing compiler tests before implementation: preserve stable IDs,
determinism, shared-evidence dedupe and valid dependency edges; cover owners,
conditional 510(k) clinical work, explicit versus unknown flags, SaMD, specialist
bench applicability, MDR clinical leadership, IVDR PER/PMPF separation, and
medical-writing/publishing handoffs. Root owns project-navigation/catalog
integration tests, evidence receipts and final validation. This document does not
assert production deployment, complete project scoping of legacy registers,
expert regulatory approval, live agency submission or human acceptance.

## Compiler and catalog integration notes

The canonical compiler retains its existing IDs and adds
`human-factors-usability`, `electrical-safety-emc`, `biocompatibility`,
`sterilization-microbiology`, `manufacturing-transfer`, `medical-writing`, and
`performance-evaluation`. It now returns discipline ownership, contributors and
applicability. Unknown flags preserve conditional work; recorded absence removes
optional software/sterile/510(k)-clinical packages, while SaMD retains software
and EU MDR retains clinical evaluation. Patient contact and power remain
conditional because the recorded flag vocabulary does not establish those facts.
IVD/CDx clinical performance remains distinct from the device clinical-evidence
track, including PMA; an explicit combined MDR pathway can add that evaluation.

The initial compiler RED run showed five failing requirements with the prior
implementation. Extended tests cover deterministic evidence reuse and acyclic
handoffs as well as the discipline/pathway cases. Exact RED/GREEN/lint receipts
are copied to the evidence directory; subsequent root integration checks own the
combined project-navigation/catalog result. The original compiler already had
lint warnings for function complexity/length and file length. Refactoring its
base definitions inside the same compiler avoids adding another capability
registry and reduces warning count; remaining warnings are disclosed in the log.

The single catalog implementation is `surfaces/WorkflowCatalog.tsx`, reexported
as `Apps` by `AdminSurfaces.tsx` to preserve existing routing. Its
`catalogWorkflows.ts` composition places the existing MDX features inside
Projects. `MdxCatalogSolution.tsx` renders their nested project entry and
expandable access rows, using `shared/constants/mdx-project-features.ts` as the
feature boundary. Search, live row counts, unknown additional capabilities and
the original backend group indices remain intact. Existing feature IDs,
individual module verdicts and governed access dialogs remain the authority;
presentation grouping creates no additional subscription or permission grant.

## Project and document isolation corrections found during integration

Review traced two existing display paths beyond the project entry: the legacy
`server/routes/k510-document-preview.ts` read every legacy section in the
organization, while `mdx/hooks/useDossier.ts` could choose the first project
document when the requested pathway had none. They could relabel another
project's sections or a 510(k) document as a CER/IVDR dossier. Extend these
existing paths rather than creating a second preview or document store:

- Preview admits the current project through `requireCurrentProgramAccess`
  using the request database client, then reuses
  `loadGovernedDeviceDocument` and the existing `loadGovernedSectionRows` helper
  in `estar-content-leaves.ts` for that exact governed document. A validated
  optional `docType` selects one of `k510`, `denovo`, `pma`, `cer`, `mdr`, `ivdr`;
  omission derives the primary class from the existing `PROGRAM_TO_DOC_TYPE`.
- UUID/code identifiers retain their canonical program identity. Numeric FDA
  identifiers resolve only through the recorded FDA-project → project → program
  relationship. An unresolved legacy relationship returns 409 rather than
  showing organization-wide prose. No automatic legacy adoption is performed.
- CER explicitly requests `cer`; an absent secondary report returns an empty
  section list, never the primary filing. Full MDR technical documentation is
  `mdr`, distinct from a `cer` document. The existing Author stage remains the
  place to view full project documents that do not match a pathway dossier.
- Exact canonical keys such as `C2` or `II.6.2.c` survive the preview adapter and
  editor handoff; integer parsing must not collapse distinct sections. Governed
  statuses/counts are reported as stored. Completion percentages remain null
  because that section store does not record them.
- Dossier hydration requires exact project and document-class matches and uses
  the existing authoring session owner. It revalidates on mount and withholds
  cached content during the read or after a refusal/failure. Unreadable lists,
  outlines or bodies are unavailable, rather than empty documents.

The compiler also moves the clinical-evidence package immediately after strategy
for an MDR-only plan. Its engineering package supplies existing approved device
description/configuration, performance evidence, equivalence tables and change
or access limitations. The CER does not require a fresh DHF, completed bench
testing or prior US clearance before clinical evaluation work can begin.

The final owned-scope run passed 9 suites / 94 tests. The preview route exercises
real SQL rows in a minimal existing-store PGlite fixture, including cross-project,
cross-tenant, requested-class, no-document and failed-read cases; current sharing
admission is mocked there and remains qualified by its existing service suites.
This is a scope-regression fixture, not a full migration or live-deployment test.
Client tests exercise actual hydration outcomes and session revalidation, exact
section keys and editor handoff. Forced lint reports no errors; existing warning
categories remain disclosed. Exact command output is retained as
`isolation-red.txt`, `preview-red.txt`, `isolation-green.txt`, and
`isolation-eslint.txt` in the evidence directory. Root's final combined gates
supersede these owned-scope receipts for the integrated source tree.
