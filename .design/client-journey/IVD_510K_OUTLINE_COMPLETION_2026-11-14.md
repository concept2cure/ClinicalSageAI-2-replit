# Complete the existing IVD 510(k) outline

Package F1; W1/D2. Implements P-114 item 5 and MDX journey M6(a/b). The current branch, not the October checkpoint, is the source of truth. No screen, service, API mount, table, dependency, transmission adapter or model is added. Existing device screens and the shared editor remain the UI owners; D8 and W7's held files are excluded.

## What already exists

- `shared/regulatory/project-bootstrap.ts`: `us_510k_ivd_sections` incorrectly shares the six EU performance-evaluation sections, including Annex XIII and Article 56. `device-authoring-sections.ts` already owns regional authoring corrections.
- `server/services/c2c/rule-pack-lookup.ts`: one canonical active-pack resolver, currently unaware of product type. `scaffold-project-documents.ts` binds the selected version in the caller's project-creation transaction; `server/routes/c2c/projects.ts` already has canonical `productType`.
- `server/services/vault/vault-folders.ts`: reads the project's binder through that same resolver; must choose the same variant as creation. Retained document reads use the document's stored pack version and must not rewrite existing documents.
- `migrations/20261005c_k510_denovo_estar_outline_v1_1.sql`: the generic 510(k) version has no analytical-performance node and asserts one live generic version. `scripts/db/migration-set.mjs` replays migrations on every deploy. A variant must coexist without breaking repeated applies or changing historical section meanings.
- `server/services/pathway-engines/estar/estar-mapper.ts` and `estar-outline-requirements.ts`: already own variant-aware readiness and section requirements. IVD analytical performance is required, but the generic pack cannot supply it. Existing non-IVD performance and contact assumptions require comparison with the vendored IVD form before any correction.
- `assets/estar-templates/eSTAR-510k-ivd.pdf`: the existing FDA form; existing XFA inspection and checksums are the reference for matching the IVD outline. `EstarFilingPanel.tsx` already selects the variant from product type; preserve it.
- `server/services/market-specs/document-template-library.ts`: serves the existing blueprint to the template/editor path. Complete that source instead of adding a parallel template.

Searches covered rule-pack/scaffold/binder call sites, IVD blueprints, eSTAR slots and template consumers, current coordination holds, P-114, and `git log --all --diff-filter=D` for matching paths. The fresh checkout initially has shallow history; deletion-search coverage is limited to fetched history.

## Contract

Keep document class `k510`, agency `fda`, and the composite version binding. Add only the approved content version `fda-estar-510k-ivd-v1.0`, selected explicitly for the canonical IVD family (`ivd`, `cdx`). Default/non-IVD selection excludes that version; IVD selection refuses a missing IVD pack instead of silently returning a non-IVD outline. Other document classes and agencies keep their behavior. Market listings retain their default variant.

Pass the recorded product type through project creation and the existing Vault binder owner. Preserve all existing document content and stored versions. Existing FDA administrative, description, substantial-equivalence and labeling keys retain their meanings in the new version; IVD performance branches are matched against the vendored form and the canonical mapper. Unknown applicability remains for human assessment.

Seed content with conflict-safe insertion, explicit count/content assertions and replay proof. Amend an earlier assertion only as required to admit the approved parallel variant; do not weaken generic-version checks. No automatic migration of authored or signed documents is included.

## Verification and limits

**Form inspection correction, before final qualification:** the IVD PDF also contains `BenchTesting.PTDropDownList410` and `AnimalTesting.PTDropDownList610`; the USA radio-change script hides BenchTesting and shows AnimalTesting, while the Canadian script does the reverse. An initial filtered field inventory incorrectly omitted them. Preserve E5 bench and E6 animal testing with their existing meanings as conditional sections. The completed outline therefore has 47 nodes, retaining all 38 generic keys and adding E9–E17. IVD analytical evidence remains required; animal evidence is an applicability question. The retained bench heading preserves existing content/keys as optional platform content; it is not represented as a mandatory or visible FDA IVD form branch. Earlier 45-node candidates and tests are superseded, not final proof.

Demonstrate the failure before the fix, then exercise real SQL migration replay, strict variant selection, project scaffolding, Vault binder identity, template/editor projections and mapper/readiness. Run current compiler, relevant gates, lint and build. Record the exact tested source and outcomes under `docs/evidence/MDX-JOURNEY/2026-11-14-p114-5-ivd-outline/`.

This work does not establish FDA acceptance, deployment qualification, human acceptance, or device transmission. Existing projects retain their original outlines; their upgrade path requires separate governed handling.

## Exact content map and measured form (reconciled before release)

The retained FDA IVD eSTAR 7.1 SHA-256 is `df5e31dcbbe60e55b93c6006c4771c01df75a9d1c21e4b473605e20dfacce1e1`. Production `listXfaFields` enumerated 1,573 fields; `listXfaPackets` supplied the actual template packet. This is a structural local inspection, not Acrobat/agency acceptance.

The new variant preserves every generic key and its meaning. E1 retains the existing mandatory biocompatibility review: evidence or a documented human non-contact rationale. The actual FDA form allows zero contact and branches on its contact answer, but the project does not record that answer. The existing readiness projection drops `checkApplicability`; therefore making E1 merely conditional would silently allow an unassessed filing to say content complete. That candidate is rejected. E2–E8 retain their meanings; E5 bench and E6 animal remain optional, with no key reassigned. New E9–E17 match AnalyticalPerformance, ComparisonStudies, ClinicalStudies and ReferenceRange; the generic performance-testing requirement must not be demanded in addition to IVD analytical performance. E9 is the existing mapper's required analytical slot, not a claim that each analytical study is always applicable. All other IVD branches remain for documented applicability assessment.

| Key | Heading | Pack flag |
|---|---|---|
| A | Administrative | Required |
| A1 | Cover letter | Required |
| A2 | Submitter, applicant and correspondent information | Required |
| A3 | Pre-submission correspondence and previous communications | Assess applicability |
| A4 | Consensus standards and declarations of conformity | Assess applicability |
| A5 | 510(k) summary or 510(k) statement (21 CFR 807.92 / 807.93) | Required |
| A6 | Truthful and accuracy statement (21 CFR 807.87(k)) | Required |
| A7 | Class III summary and certification (21 CFR 807.94), where applicable | Assess applicability |
| A8 | Financial certification or disclosure (21 CFR Part 54), where clinical data are relied on | Assess applicability |
| A9 | MDUFA user fee — Form FDA 3601 and payment | Required |
| B | Device description | Required |
| B1 | Device description and principles of operation | Required |
| B2 | Indications for use statement | Required |
| B3 | Classification, product code and regulation | Required |
| C | Substantial equivalence | Required |
| C1 | Predicate and reference devices | Required |
| C2 | Substantial equivalence discussion and comparison table | Required |
| D | Design, manufacturing and labeling | Required |
| D1 | Design and manufacturing information | Assess applicability |
| D2 | Proposed labeling and instructions for use | Required |
| D3 | Reprocessing and reuse | Assess applicability |
| D4 | Sterilization | Assess applicability |
| D5 | Shelf life and packaging | Assess applicability |
| D6 | Benefits, risks and mitigation measures — risk management (ISO 14971), Special 510(k) design control activities | Assess applicability |
| E | Performance and safety testing | Required |
| E1 | Biocompatibility | Required review: evidence or documented non-contact rationale |
| E2 | Software and firmware | Assess applicability |
| E3 | Cybersecurity (FD&C Act section 524B, cyber devices) | Assess applicability |
| E4 | Electromagnetic compatibility, electrical, mechanical and thermal safety | Assess applicability |
| E5 | Bench performance testing (retained platform heading; not a visible FDA IVD branch) | Optional |
| E6 | Animal performance testing | Assess applicability |
| E7 | Clinical performance testing | Assess applicability |
| E8 | Human factors and usability | Assess applicability |
| E9 | Analytical performance — assay and instrument performance (precision, detection limit, linearity, interference) | Required |
| E10 | Method comparison study | Assess applicability |
| E11 | Validation of specimens / matrix comparison | Assess applicability |
| E12 | Reference range / expected values | Assess applicability |
| E13 | Stability of specimens | Assess applicability |
| E14 | Metrological traceability of calibrators and controls | Assess applicability |
| E15 | Assay cut-off | Assess applicability |
| E16 | Carry-over | Assess applicability |
| E17 | High-dose hook effect | Assess applicability |
| F | Quality management | Assess applicability |
| F1 | Quality management system information | Assess applicability |
| G | References and additional information | Assess applicability |
| G1 | References and bibliography | Assess applicability |
| G2 | Additional information / amendment responses | Assess applicability |

Actual form anchors: E9 `root.PerformanceTesting.AnalyticalPerformance.AssayPerformance` and `.InstrumentPerformance`; E10 `root.PerformanceTesting.ComparisonStudies.PTDropDownList260`; E11 same group `PTDropDownList270`; E12 `root.PerformanceTesting.ReferenceRange.PTDropDownList510`; E13–E17 `AssayPerformance.PTDropDownList210`, `170`, `160`, `185`, `240`. E7 is `ClinicalStudies`. The actual USA radio-change script hides BenchTesting and shows AnimalTesting; the Canadian script does the reverse. E5 is retained as optional platform content, not claimed to be a visible FDA IVD form branch. The shared US blueprint and migrated pack project to 47 stable keys. Earlier 45-node/no-branch inventories are superseded; the correction and original receipts are retained. Platform keys A–G are not FDA form numbering.

**Readiness review correction:** no new contact-input authority is invented. Keep biocompatibility required in both pack and mapper until the existing product can record and enforce that applicability decision. The form's zero-contact choice is structural evidence, not an automatic exemption. Tests must refuse content completeness when E1 is absent and permit substantive human-reviewed E1 content without fabricating a required laboratory test.

**Publication selector correction (existing owner):** the first normal push's SQL-interpolation gate rejects an additional interpolated clause in `rule-pack-lookup.ts`. Keep the canonical resolver and its existing authority, and express variant selection as a static SQL predicate with bound version/boolean values. No gate or baseline changes. Retain the failed normal-push receipt and requalify selection/scaffolding/binder consumers before retrying publication.
