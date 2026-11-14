# Full-platform commercial strategy: documentation evidence

Date: 13 November 2026. Package: L1. Launch row addressed: D9 commercial readiness; dependent D10 customer acceptance remains unclaimed.

## Result

Prepared `docs/commercial/PLATFORM_STRATEGY_AND_LAUNCH_2026-11-13.md` as a public-source strategy and completion work order covering MDX and biopharma, CMC/RBM/Vault/RIM/laboratory assets, market assumptions, competitor comparisons, direct purchasing and remaining work.

This change is documentation only. It does not change the canonical plan, entitlements, billing behavior, product scope or any qualification/launch status. No confidential customer source material, identifiable customer proposal, investment terms or private customer financial model is included.

## What already exists

- `docs/investor/PLATFORM_INVENTORY.md` and `docs/FEATURE_CATALOG_2026-06-16.md`: breadth inventories; historical counts/statuses need current verification.
- `shared/constants/launch-scope.ts` and `docs/design/one-design-plan.json`: current admitted scope, entitlements and canonical packages.
- `docs/commercial/PRICING.md`, `ONBOARDING_RUNBOOK.md` and `ICP_AND_OUTREACH.md`: existing pricing proposal, onboarding process and buyer definition.
- `server/routes/billing.ts`, `server/services/billing.ts` and `client/src/concept2cure/v2/surfaces/LicensingSurface.tsx`: existing checkout, DTC pricing, portal, webhook and subscription paths; this work does not execute or qualify live payments.
- Existing `server/services/cmc/`, `rbm/`, `vault/`, `intelligence/`, `rim/`, `qms/`, `csr/`, `pathway-engines/` and `ivd-knowledge/`: domain assets; capability existence is not blanket operational parity or qualified use.
- Existing shared editor/canvas, source lineage and submission/transport paths: complete and reach these under their current packages; no parallel application is authorized.

## Review and verification

Baseline: canonical `concept2cure-v2` at `255ad51f4b8aa6e2e1078a37ef615184be117d3f`, refreshed before publication. Changes since the earlier source review were inspected; they concerned operational recovery/receipt evidence, not the pricing/domain code summarized here.

- Checked TAM/SAM/SOM and illustrative gross-margin arithmetic.
- Checked 17 source definitions and section references, Markdown table structure and file length.
- Scanned the public strategy for customer/individual identifiers, private deal/funding terms, private beta costs and confidential-source references. A separate reviewer read the document and found no confidential leakage or material competitive overclaims.
- Rechecked proposed documentation paths and commit trailers against the open L1 package using `evaluateCommit` from `scripts/ci/check-one-design-plan.mjs`.
- Ran `bash scripts/ai/verify-tests.sh`: no source files requiring test verification.
- Checked whitespace for the new text files. No runtime code, dependency or database change requires application tests/builds for this change.

## Verification limits

Vendor descriptions summarize cited public marketing, not independent testing or quotations. Market segmentation, annual account values, SAM/SOM and margin targets remain assumptions. LIM terminology is unresolved. Model/deployment qualification, full LIMS operations, pathway/format completeness, purchase-to-entitlement behavior and customer acceptance require their own execution evidence.

The final section of the strategy is the roadmap. Its sequencing does not amend `ONE_DESIGN_PLAN.md`, authorize new capabilities or close a launch row.
