# Biotech Scope Manifest

Updated 2026-10-27. This manifest describes the current US human therapeutic-biotech authoring audit. It is not a second filing registry or an exhaustive statement of every obligation a US biotech could have.

## Canonical scope owners

- `shared/regulatory/global-document-registry.ts` owns application/document identity, region, product classes and lifecycle metadata. `filing-catalog.ts` derives the client-facing view; `project-bootstrap.ts` and dedicated section/task catalogs own current scaffolds.
- `server/services/regulatory/registry/registryValidation.ts` validates registry/project consistency. `registryCoverage.ts` measures static backing; its blueprint tiers are not release or authoring-workflow verdicts.
- `server/services/regulatory/registry/usBiotechAuthoringCoverage.ts` derives the current editor inventory from the registry and `getBuiltinAuthoringTemplates`, including exact source limits and remaining scoped concerns.
- `server/services/market-specs/document-template-library.ts`, `regulatory/templateCatalog.ts`, existing lifecycle/CTD records and `authoring/builtin-authoring-templates.ts` own outlines, offered metadata and stable editor-template projection. The existing DocumentWorkbench and governed source/document/response writers own the working-document lifecycle.

Recompute inventory through the existing report:

```sh
npm run report:regulatory-coverage -- --json
```

Read `usBiotechAuthoring.filings`, `sharedRegistryDocuments` and `reusableDocuments`, each applicable row's `scopeConcerns`/`availabilityReason`, and the report's `unrepresentedNeeds`. Counts come from that execution and its source revision. The old 101-entry denominator and withdrawn lexical completion matrix must not be reused.

## Selection and meaning

The current report includes:

- Active US medicinal registry entries selected by their recorded `pharma_biotech` segment.
- Relevant existing cross-segment `US_EUA` and `US_RFD` identities, because vaccine/combination-product needs cannot be excluded by a medicinal-only segment filter.
- Active GLOBAL medicinal/shared CTD identities and the existing US regional Module 1 identity.
- Exact US/GLOBAL reusable medicinal component templates, including clinical/safety, CTD, detailed lifecycle and newly reached existing medicinal source records. Components are working documents, not extra independent filings.

This selection covers human therapeutic development, biologics, vaccines, biosimilars and relevant combination products for the present audit. Product/modality, application type, development stage, jurisdiction, actual source records and current permissions determine applicability. A company label or document title does not.

Whole-filing or whole-module templates may be manual preparation workspaces. Exact narrative components can use source-supported AnA drafting while original forms, tabulations, datasets, controlled attachments and signatures remain with their source/preparation controls. GLOBAL guidance does not establish a receiving jurisdiction. Regional Module 1 has no single harmonized global substitute.

## Current work and qualification boundary

The [existing completion matrix](BIOTECH_DOCUMENT_COMPLETION_MATRIX.md) records the current grouped capability and remaining gaps. The [US biotech contract](../design/US_BIOTECH_AUTHORING_COMPLETION_2026-10-26.md) and [evidence packet](../evidence/D2-US-BIOTECH-AUTHORING/2026-10-26/README.md) cover clinical metadata/policy, exact lifecycle starts, corrected IND protocol/SAP selection, CMC narrative/source distinctions, USPI/nonclinical working documents, CTD module reachability, filing-guided project starts and the same-editor authority-response bridge.

Scoped actual HTTP/PGlite, client and source-policy receipts are evidence only for their stated cases and source pins. A successful listing, empty working copy, saved-section admission, review, export or package stage does not qualify every later stage. No entry is marked `VERIFIED` under the full work-order definition solely by this manifest or inventory report.

Final generated CLI totals, combined test counts, build/compiler/gate outcomes and canonical publication proof are **pending lead integration/publication** and must be read from the evidence packet when filed. No totals or release outcome are invented here. Human acceptance, live AnA/model competence and actual agency transmission remain not run or separately unqualified.

## Explicit unclosed scope

Expanded access/Form FDA 3926, exact Type D/INTERACT starts, biologic-specific Part 600/601 reporting, medicinal EUA content, combination-product RFD/PMOA, sponsor custom-template binding/format fidelity, and live structured submission/channel qualification remain concrete completion needs. Existing expanded-access references/tools, formal-meeting support, SPL/E2B engines, quality/CMC sources and agency-response services are credited; missing exact editor reachability is not described as missing backend infrastructure.

The audit is not exhaustive for veterinary, standalone device/IVD, HCT/P 361, controlled-substance, institutional/IRB, state, laboratory, advertising/promotion, inspection-response or other specialty obligations. Trace existing owners and current authority when these are included in a client's product scope. Do not infer exclusion from an omitted row, or claim all plausible US biotech filings from a bounded registry count.

## Design and benchmark authority

The accepted placement map is `.design/client-journey/INFORMATION_ARCHITECTURE.md`: project Plan/Evidence/Author/Review/Submit/Respond, shared central services and one document editor. Older March/April biotech workflow and route-map documents are historical discovery references containing superseded owners; they are not current implementation or competitive proof.

Current public Weave requirements and official FDA/eCFR source observations are retained in [the source review](../evidence/D2-US-BIOTECH-AUTHORING/2026-10-26/sources/scope-and-benchmark-review.md), with source URLs/hashes and retrieval failures. Vendor public claims are requirements inputs, not independently demonstrated functionality, Concept2Cure performance, security compliance or parity. The existing platform blocker register and release-gate ladder retain release authority; this manifest adds no parallel readiness registry.
