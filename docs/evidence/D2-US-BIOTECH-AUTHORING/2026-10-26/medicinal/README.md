# Existing medicinal source records in the current editor

## What already exists

`CTD_AUTHORING_GUIDANCE` and `ctdRecordSubtree` own the canonical CTD records. The existing drug-substance and drug-product components already project those records, but missing narrative metadata and section policy prevented source-supported drafting. The existing IND Module 3 builder projects the same records separately. This increment shares one exact-record policy between these projections without changing the deterministic CMC composition service or its supported scope.

`labeling-intelligence-knowledge.ts` already owns the US PLR Highlights and full prescribing-information descriptors and boxed-warning formatting rules. The existing boxed-warning assessor previously kept the latter record inline. The record is extracted unchanged and copied for both that assessor and a small pure authoring accessor; no product or application assessment is invented to obtain an outline. `NONCLINICAL_STUDY_REPORT_STRUCTURE` already owns the seven-part nonclinical structure. The new `medicinal-working-templates.ts` is a thin projection of these existing sources through the current library, catalog and builtin editor path. It does not duplicate their descriptor arrays.

The registry already contains the US regional Module 1 and global CTD module identities. Their exact editor entries were unreachable because cross-cutting `ctd_ectd` entries were excluded. Five entries can reuse existing canonical records: US Module 1 uses `flattenModule1('US')`; global Modules 2–5 use the CTD record subtree. Global Module 1 has no harmonized regional source and is now explicitly unavailable instead of inheriting a generic US-shaped fallback.

## Completed behavior

- `drug_substance` and `drug_product` now permit working narrative drafting only where the exact existing Module 3 record says `contentType: 'narrative'`. Every mixed, table, unknown or non-Module 3 code is manual under this policy. Original specifications, results, records and mixed sections therefore remain manual. The same helper stamps normalized IND Module 3 aliases; Module 2 behavior is unchanged. Whole Module 3 remains a preparation workspace.
- Exact working component `us_prescribing_information` projects the existing Highlights and full PI records, with US/FDA scope. Original labeling/SPL source records and contents remain manual. Both boxed-warning working rows are manual and applicability is unconfirmed; the full PI warning follows the existing placement before section 1. Other sections provide source-supported narrative preparation. FDA-to-PMDA scope mismatches are refused by the existing context path.
- Exact working component `nonclinical_study_report` reuses the existing seven source parts. Title/GLP/approval records and original tabulations remain manual; parts 2–6 permit source-supported narrative preparation. The template does not assign an unsupported study-specific Module 4 location.
- Exact registry starts `US_CTD_M1_REGIONAL` and `ICH_CTD_M2` through `ICH_CTD_M5` retain their own identities, source codes and market/authority context. They are whole-module preparation workspaces; section records do not override that admission limit. `ICH_CTD_M1` is omitted from the offered roster and its exact lookup is unavailable with a stated jurisdiction-specific reason.
- Appropriate existing filing mappings offer the new working components; this makes them available choices, not a determination of legal applicability or submission completeness. Persisted editor sections retain the source and mode selected at creation. The existing saved-section gate admits narrative working sections and refuses manual ones.

## Actual qualification

Three genuine prepatch RED epochs are retained unchanged with code/test pins and compressed raw output:

- `red.json`: 8 failures and 1 control across two suites. Exact USPI/nonclinical builtin and HTTP roster starts were absent; current CMC saved-section draft admission was refused.
- `alias-red.json`: 2 failures and 1 unchanged Module 2 control. Normalized IND Module 3 records lacked the exact canonical narrative/manual policy.
- `module-red.json`: 6 failures. Five exact registry module starts were unreachable and global Module 1 incorrectly returned a generic regional outline.

`green.json` passes 18/18 across four suites. `regression.json` passes 402/402 across 13 suites, including clinical and builtin regressions, the current library, IND M2/M3, the original nonclinical builder, and existing PLR/boxed-warning assessor behavior. All these receipts have zero pinned-source drift.

The medicinal HTTP/PGlite fixture uses real JWT routes, the canonical create writer, SQL/audit persistence and reopen, followed by actual `savedSectionDraftTemplate` admission or refusal for representative narrative/manual source sections. Eligibility reads create no generated versions or approvals. Separate tests verify exact record identity and order, copied PLR descriptors, shared boxed-warning placement, exact Module 3 content-type classification and preservation of Module 2 behavior.

`lint.json`/`lint-details.json` cover all 15 owned TS files: 0 errors and 12 existing warnings versus 12 baseline, with no per-rule growth. New source and tests have no new warnings. `evidence-helper-lint.json` checks the evidence helper itself with 0 warnings/errors. `final-inputs.json` and `final-source-*.gz` retain the final owned inputs, including the lint helper. `git diff --check` passes for owned paths. Earlier receipts and prepatch snapshots remain unchanged.

The independent qualification stream owns broader registry HTTP loops and representative module create/reopen checks. The root owns the raw prepended IND root policy, combined transitive qualification, full compiler/build/UI gates and direct canonical publication. This stream runs no global gate or Git mutation.

## Limits

These changes provide working authoring paths; they do not establish complete biotech coverage or Weave Bio parity. Narrative eligibility does not retrieve evidence, verify scientific content, generate a document or approve a submission. No provider or agency endpoint is called during these checks.

USPI has no connection to the existing PI store, product binding, approved-label record, labeling writeback or technical SPL validation. A blank boxed-warning row does not establish warning applicability. The nonclinical working outline does not make the existing ephemeral builder a retained source pipeline, replace a signed original report, certify GLP or choose a study-specific filing location. CMC narrative authoring does not expand deterministic composition beyond its existing scope. Whole-module preparation does not imply complete Module 1 requirements for an unknown application type. Native PostgreSQL behavior, live AnA subject-matter performance, sponsor formatting, human acceptance and agency acceptance remain unqualified here.
