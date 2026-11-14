# Concept2Cure: platform strategy and launch completion

Prepared 13 November 2026. Proposed commercial strategy and completion work order, based on public market sources and existing repository assets. This document does not approve prices, change the canonical design plan, qualify a deployment or declare a launch row complete.

Launch workstream: commercial readiness, D9, with dependent customer-acceptance evidence under D10. Engineering follows the existing open packages; no additional product surface, service, table, model or integration is authorized here.

## Goal

Present and sell Concept2Cure as **one governed working environment for medical devices and diagnostics (MDX) and biopharma**, spanning development evidence, scientific work, operations, quality, regulatory work and submissions.

CMC, risk-based monitoring, Vault, regulatory intelligence and information management, laboratory/QC evidence, biostatistics, program execution, document development, agency correspondence and lifecycle maintenance belong in the central story. The CSR is an example of the platform at work, not the definition of the company.

A standard customer should be able to visit the website, understand supported workflows, create an account, choose a plan, pay through Stripe and begin useful work. Qualification, data-use restrictions, scientific review and release authority remain explicit gates.

## Customer-facing proposition

> One environment for MDX and biopharma. Connect your program, evidence, scientific work, quality and regulatory deliverables through AnA and one governed project record. Start with a supported workflow and expand as your program grows.

The proposition rests on the combination of capabilities, shared context and evidence continuity. Explain what happens when a source changes: which evidence and documents become stale, who owns the response, which approval must be renewed, and what blocks the next release. Demonstrate those links rather than using a screen count as proof of integration.

Both customer groups are first-class:

| Customer group | Representative work | Shared foundation |
| --- | --- | --- |
| Biotech and pharma | Nonclinical/clinical evidence, protocol and study design, biostatistics, CMC, RBM, study reporting, applications, correspondence and lifecycle obligations. | Projects, AnA, Vault, evidence lineage, the shared editor, quality, tasking, review/approval, reporting and filing controls. |
| Medical devices and diagnostics | Engineering and risk evidence, software/human factors, analytical and clinical performance, quality, labeling, device/IVD documents, submissions and post-market work. | The same foundation, with pathway-specific scientific, regulatory, template and release requirements. |

The useful meaning of “one environment” is common identity and permissions, coherent source/document versions, connected tasks and review, visible downstream effects and a complete exportable record. A common navigation bar alone does not establish that outcome.

## What already exists

The canonical branch is `concept2cure-v2`. Historical inventories establish breadth; current source, launch scope and executed evidence establish readiness. A database table, catalog item or test name is not proof of a reachable, qualified customer workflow.

| Existing asset | Paths | Scope and completion boundary |
| --- | --- | --- |
| Product scope and completion plan | `shared/constants/launch-scope.ts`; `docs/design/ONE_DESIGN_PLAN.md`; `docs/design/one-design-plan.json` | Existing admission, entitlements and package rules govern implementation. This work order does not amend them. |
| Broad lifecycle inventory | `docs/investor/PLATFORM_INVENTORY.md`; `docs/FEATURE_CATALOG_2026-06-16.md` | Includes MDX, CMC, RBM, QC, scientific, quality, research/ethics and supply assets. Historical counts/statuses need current verification before reuse. |
| Projects and program execution | `server/services/c2c/`; `server/services/tasking/`; `client/src/concept2cure/v2/surfaces/Project*.tsx` | Objectives, plans, tasks, teams and deliverables exist. Verify dependency/progress claims against current records and reviewed work. |
| AnA and intelligence | `server/services/ana/`; `ana-ri/`; `intelligence/`; `ai-gateway/`; `ai-governance/` | Project context, governed tools, evidence and approved-model controls exist. Actual task/provider/model qualification remains distinct. |
| Vault and evidence | `server/services/vault/`; `clinical-regulatory-evidence/`; Vault and eTMF features | Source versions, document governance and lineage assets. Deployment custody, recovery, retention and eTMF qualification require their own evidence. |
| CMC | `server/services/cmc/`; `server/api/cmc/`; `server/services/cmc/composition-scope.ts` | Structured CMC evidence, stability/specification/batch records, source-to-section compilation and drift controls. Automated composition is bounded to supported small-molecule U.S. IND content; no blanket biologic/global composition claim. |
| RBM | `server/services/rbm/`; `server/routes/mdx-rbm*.ts`; `surfaces/Rbm*.tsx` | Risk assessment, KRIs/QTLs, central monitoring, signals and actions. Prove ingestion, method limits and task/quality handoffs for the quoted use case. |
| Scientific work | `server/services/study-design/`; `stats/`; `ana-biostats/`; `csr/`; `preclinical/`; `clinical-pharmacology/` | Existing design, calculation and evidence domains. Preserve approved analyses of record and declare supported input/design/method limits. |
| MDX | `server/services/pathway-engines/`; `ivd-knowledge/`; device/diagnostic project features | Device/IVD pathways, engineering/risk, performance, labeling and post-market assets. Catalog admission does not prove complete eSTAR packaging, all standards or accepted transmission. |
| Quality and laboratory/QC | `server/services/qms/`; QC/CMC records; `server/routes/qc.routes.ts`; `server/src/routes/stability.router.ts` | Quality and lab evidence assets exist. QC storage has incomplete paths; the separate stability backend needs convergence/reach. Full instrument-connected LIMS/ELN replacement is not established. |
| Regulatory information management | `server/routes/rim.ts`; `server/services/rim/`; `shared/schema/rim.ts` | Registration, label and renewal data-layer assets. Confirm migration/reach/entitlement and lifecycle acceptance; do not claim full operational parity from schemas. |
| Authoring and filing | `v2/editor/DocumentCanvas.tsx`; `DocumentWorkbench.tsx`; `StudyDataBuild.tsx`; `server/services/ectd/`; `submission-gateways/` | One editor for document types and existing publishing/transport assets. Keep package validity, transmission, technical acknowledgment and regulatory approval distinct. |
| Signup and billing | `server/routes/billing.ts`; `server/services/billing.ts`; `v2/surfaces/LicensingSurface.tsx`; existing authentication/onboarding | Checkout, DTC pricing, subscription/status, portal, webhook and entitlement paths exist. Complete and verify them; do not introduce another payment service. |
| Commercial material | `docs/commercial/PRICING.md`; `ONBOARDING_RUNBOOK.md`; `ICP_AND_OUTREACH.md` | Existing draft pricing, onboarding and buyer definition. Reconcile them with the full-platform proposition and qualified-use matrix. |

Terminology: RIM appears as both regulatory information management and the proprietary Regulatory Intelligence Model; distinguish them. The intended customer-facing “LIM” expansion is unresolved. Describe the evidenced laboratory/QC scope rather than inventing a named product or full LIMS capability.

Searches covered billing/checkout/subscription, onboarding, CMC, RBM, Vault, RIM/intelligence, laboratory/LIMS/QC and MDX/device/IVD. Deletion-history inspection is limited by locally available history and must be repeated for any implementation/deletion decision. Existing assets are completed, reached or converged, not rebuilt beside themselves.

## Market opportunity: a reproducible model

Use distinct buying organizations multiplied by assumed annual software account value. Do not add overlapping CMC, QMS, RBM, LIMS, RIM and authoring market reports.

Public market facts:

- Citeline counted 6,823 companies with active pharma R&D pipelines in January 2025; a 2026 article describes approximately 7,000 developers at end-2025. This includes preclinical firms, not just launch-eligible clinical sponsors. [S1–S2]
- AdvaMed reports more than 6,500 U.S. medtech companies. [S3]
- MedTech Europe reports more than 36,000 European medtech companies in its 2026 report. Geography, multinational overlap and methodology prevent simple addition to U.S. or pharma counts. [S4]

### Illustrative biopharma platform TAM

| Segment assumption | Accounts | Low annual value | Base annual value | Expanded annual value |
| --- | ---: | ---: | ---: | ---: |
| Emerging developers | 5,000 | $12k | $36k | $60k |
| Mid-sized portfolios | 1,500 | $60k | $120k | $240k |
| Large portfolios | 500 | $180k | $360k | $720k |
| Modeled annual software capacity | 7,000 | $240M | $540M | $1.02B |

Segment mixes, account values and eligibility are assumptions, not observed vendor spend, approved pricing or sales forecasts. Larger contracts require mature multi-workflow adoption and enterprise delivery. Base arithmetic is $180M + $180M + $180M = $540M.

### Separate illustrative MDX envelope

At 6,500 U.S. accounts and assumed annual software values of $24k/$48k/$72k, the separate MDX envelope is $156M/$312M/$468M. Diagnostics are already within MDX. This is a U.S. envelope, not a global MDX TAM.

Do not publish an additive pharma-plus-MDX headline until legal buying entities, parent groups and mixed portfolios are deduplicated. European medtech breadth is additional context, not automatically incremental buyers.

### SAM and SOM to validate

| Planning layer | Biopharma assumption | MDX assumption |
| --- | --- | --- |
| Initial serviceable segment | 1,500 eligible accounts × $36k = $54M/year. A 1,000–2,000 range implies $36M–72M. | 1,000 eligible U.S. accounts × $36k = $36M/year. |
| Illustrative year-3 obtainable market | 50–100 customers × $36k = $1.8M–3.6M ARR. | 25 customers × $36k = $0.9M ARR. |

These counts, timing and values require buyer research and paid acceptance. Keep the groups separate until deduplicated. Construct a named-account list with parent entity, pathway/stage, country, next deliverable, funding, buying authority, current tools and qualification needs. ARR is not recognized revenue, profit or available cash.

## Competition across the whole environment

Descriptions below summarize public vendor marketing reviewed in November 2026; they are not independently measured performance. A feature absent from a public page is not evidence of absence.

| Reference competitor | Relevant marketed strengths | Concept2Cure’s claim to test |
| --- | --- | --- |
| Veeva Vault / RIM / AI / Basics | Broad clinical, regulatory and quality offerings, submission/authoring/publishing and an emerging-biotech edition; Veeva also markets LIMS and cross-domain connections. [S5–S7] | The particular AnA/project experience, connected evidence and lower measured adoption/operating cost. Do not describe Veeva as only document storage or say large vendors ignore biotech. |
| Certara | CoAuthor, Pinnacle 21, GlobalSubmit and scientific/regulatory services span writing, conformance and publishing. [S8] | Fewer customer handoffs across tested workflows, traceable scientific/operational context and comparable total cost. Retain validator-of-record tools where required. |
| Weave Bio / Artos | Source-linked regulatory and CMC authoring, review/verification and change-impact features; Weave markets multiple application types and modules. [S9–S10] | Demonstrate the wider CMC/RBM/Vault/quality/program/MDX combination and concrete source-change effects. Do not label these products text-only. |
| Yseop | Clinical automation combining deterministic retrieval/symbolic methods and language models, with evaluation and traceability. [S11] | Specific measured controls and workflow results, not uniqueness of deterministic-plus-LLM architecture. |
| QbDVision | Connected CMC development, product/process/analytical knowledge and control strategy. [S12] | Structured CMC evidence through governed changes, sections, quality and regulatory consequences within supported scope. |
| CluePoints / Medidata | RBQM, central statistical/data review, indicators, site oversight and signal/action workflows. [S13] | Validated monitoring methods and a complete signal-to-investigation/task/quality/report chain. |
| LabWare / Benchling / Veeva LIMS | Laboratory/QC and/or R&D workflows with LIMS, ELN or instrument/system interfaces. [S7, S14] | Complete and converge existing lab evidence assets before claiming LIMS replacement or parity. |
| Greenlight Guru / MasterControl | Medtech development/quality, risk/evidence and device quality/manufacturing workflows. [S15] | Prove device/diagnostic evidence continuity into quality, labeling and the supported submission lifecycle. |
| LORENZ | Established publishing and validation, including eCTD 4.0 tooling/training. [S16] | Reduce the handoff from governed work into publishing; support qualified external publishing where needed. |

The reviewed sources do not establish that every competitor offers the exact Concept2Cure combination. They also do not prove the universal claim “nobody else does this.” Use a sourced workflow matrix and matched customer evidence.

## Competing on price and value

Set a lower total cost for equivalent completed work as the commercial objective. Compare subscription, setup, migration, qualification, cloud/model use, human review/support, retained external software and exit costs. Model inference cost alone is not platform cost.

Complete a standard hosted adoption path for repeatable economics. Quote customer-cloud deployment, migration and specialist qualification assistance separately. Use program/portfolio tiers with explicit included users, projects, storage, support and consumption. Make participation in required quality review economical.

Before publishing discounts or savings percentages, obtain comparable quotations and scope. Measure first-year total cost, elapsed business time, expert hours, numerical discrepancies, unsupported content, stale approvals, source coverage, source-change propagation and cost per accepted deliverable. Record bad-input/refusal cases and necessary external tools.

Protect margin through supported scope, reusable qualification material, repeatable provisioning, bounded support and usage controls. At a hypothetical $36k account value, a 70% subscription gross-margin objective allows $10.8k annual cost of revenue. This is planning arithmetic, not a recommended tariff or achieved margin. Profit also depends on product development, sales, quality/security and administration.

The strategy for specialists is breadth with working links: reduce duplicated context, entry and reconciliation across scientific, operational, quality and regulatory work. Win repeat use through reliable operation and complete exports, not trapped customer data.

## Complete the website-to-first-project journey

Reuse existing signup, project start, billing, entitlement and editor paths. No new per-document or per-market authoring application is needed.

| Step | Required behavior | Acceptance evidence |
| --- | --- | --- |
| Understand | Website shows MDX and biopharma breadth, exact supported-use matrix, pricing, deployment choices, security and support. | Claims match current entitlements and qualification; unavailable work is labeled truthfully. |
| Sign up | Verify administrator/organization and identity; record applicable terms/DPA and region/data choices. | One correctly isolated tenant and administrator; confirmation/retry/error paths; no cross-tenant grants. |
| Choose and pay | Server-owned price catalog and hosted Stripe Checkout with clear trial, renewal, tax, usage and cancellation terms. | Correct price/currency/interval; administrator authority; no browser-controlled tenant or retail amount. |
| Activate | Show pending/paid/failed status accurately and provision the authorized plan. | Signature-verified, idempotent server events; exactly-once entitlement; recovery from initially failed and out-of-order processing. Redirect success alone grants no authority. |
| Begin | AnA guides goal/project/source setup, supported sample work, team invitations and first useful deliverable. | Existing project/editor path works; measured time to useful work; limits and required review roles are visible. |
| Use real data | Enforce contracted use, training, deployment readiness and applicable model/sponsor qualification. | Payment never bypasses scientific review, signature, release or transmission controls. |
| Manage and exit | Existing billing portal, invoices, payment updates, plan changes, cancellation, support and full exports. | Past-due/grace/cancellation behavior, record retention and required export access are proved; no silent deletion. |

Stripe Checkout/Billing and its customer portal support this model. Use current processor terms, signed webhooks and server-side subscription/payment state; handle asynchronous payment, failures, cancellation and replays. [S17]

One price/entitlement contract must drive website copy, checkout, invoices and access. `docs/commercial/PRICING.md` distinguishes current code from proposals; resolve that decision explicitly rather than treating market-sizing assumptions as prices.

## Completion work order and evidence

Documentation deliverables are a full-platform proposition, market model with assumptions, sourced competitor matrix, supported-use matrix, coherent pricing proposal, purchase/onboarding acceptance checklist and a measured benchmark protocol.

Engineering deliverables complete existing assets inside their open canonical packages. Before implementation, recheck current source and deletion history; record paths and evidence. No speculative feature is added merely to fill a marketing comparison cell.

Minimum acceptance scenarios:

1. New administrator completes purchase and reaches the correct project/plan with one entitlement grant.
2. Invalid/replayed webhook, processing failure/retry, delayed payment and cancellation do not create unauthorized access, duplicate grants or loss of required records.
3. A changed governed source identifies its affected document/review/task and prevents stale release in the supported workflow.
4. A monitoring signal is linked to an attributable investigation/action and retained disposition.
5. A supported MDX and a supported biopharma workflow each reach reviewed deliverables and complete exports.
6. Unqualified models, unsupported product/pathway inputs, stale approvals and unauthorized actors are refused with accurate reasons.
7. Onboarding effort, support/usage costs and review/quality outcomes are recorded consistently across repeat customers.

No live payment, qualified deployment, new customer acceptance or production behavior change is claimed by this documentation work.

## Sources

Market counts are sourced; segmentation, account values, SAM/SOM and margin figures are illustrative assumptions. Vendor descriptions are marketed scope. Sources were reviewed 13 November 2026.

- **S1.** Citeline, *Pharma R&D Annual Review 2025*, p. 15. https://www.citeline.com/-/media/C28F0B5022334A4EAC9B0DDDE55F5737
- **S2.** Citeline, *A Look at the New-Look Biotech*, April 2026. https://citeline.com/resources/a-look-at-the-new-look-biotech/
- **S3.** AdvaMed industry facts. https://www.advamed.org/medical-device-industry-facts/
- **S4.** MedTech Europe, *Facts & Figures 2026*, pp. 14, 24. https://www.medtecheurope.org/wp-content/uploads/2026/10/facts-figures-2026-digital.pdf
- **S5.** Veeva RIM. https://www.veeva.com/products/veeva-rim/
- **S6.** Veeva Basics and quality connections. https://veevabasics.veeva.com/ ; https://www.veeva.com/products/vault-platform/veeva-connections/quality/
- **S7.** Veeva LIMS. https://www.veeva.com/products/veeva-lims/
- **S8.** Certara CoAuthor, Pinnacle 21 and GlobalSubmit. https://www.certara.com/coauthor/ ; https://www.certara.com/pinnacle-21-enterprise-software/validation/ ; https://www.certara.com/globalsubmit-ectd-submission-software/
- **S9.** Weave Bio Submission Builder. https://www.weave.bio/platform/submission-builder/
- **S10.** Artos regulatory affairs. https://www.artosai.com/team/generative-ai-regulatory-affairs
- **S11.** Yseop FAQ. https://yseop.com/faqs/
- **S12.** QbDVision Digital CMC. https://www.qbdvision.com/platform/digital-cmc
- **S13.** CluePoints and Medidata RBQM. https://cluepoints.com/solutions/risk-based-quality-management-rbqm/ ; https://www.medidata.com/en/data-experience/clinical-data-studio-rbqm/
- **S14.** LabWare and Benchling. https://www.labware.com/lims ; https://www.benchling.com/solutions/biopharmaceutical
- **S15.** Greenlight Guru and MasterControl. https://www.greenlight.guru/platform ; https://www.mastercontrol.com/industries/medical-device/
- **S16.** LORENZ eCTD 4.0 training. https://learning.lorenz.cc/courses/docubridge-us-ectd-4-0-training-25-1/
- **S17.** Stripe subscription Checkout, webhooks and portal. https://docs.stripe.com/payments/checkout/build-subscriptions ; https://docs.stripe.com/billing/subscriptions/webhooks ; https://docs.stripe.com/customer-management

## Roadmap of remaining work

Targets run from agreed scope/resources; they are proposed sequencing, not release commitments or changes to the canonical plan. Each step needs its own acceptance evidence.

| Stage | Complete or verify | Existing owner/package | Exit evidence |
| --- | --- | --- | --- |
| Immediate | Full-platform claims, LIM terminology, MDX/biopharma supported-use matrix and one pricing/entitlement contract. | Founder/commercial + QA; L1 | Versioned copy, supported scope and approved pricing decision; no unsupported parity/savings claims. |
| Near term | Existing signup, checkout, webhooks, licensing, portal and project onboarding as one journey. | Billing/product + operations; L1/F1 | Purchase, retry/refusal, correct grants, first-project activation, cancellation and export scenarios pass. |
| Before regulated launch | Actual deployment, isolation, identity, security review, restore/recovery and model/provider/task qualification. | Cloud/security/QA + AI; L1/S4/F1 | Applicable signed qualification and independent security/remediation evidence; accurate supported-use state. |
| First accepted workflows | Prove an MDX path and a biopharma path with complete review, lineage and export, and measured effort/cost. | MDX/scientific/regulatory + QA; D8/S2/S3/S4/S5/L1 | Sponsor-accepted supported deliverables; quantified benchmark and limitations. |
| Cross-domain completion | CMC/QC source change to affected section; RBM signal to task/quality; agency question to response/commitment. | Domain owners; S7/S8/S9/S10/S12 | Tenant-safe, attributable, versioned handoffs; stale-release refusal and retained disposition. |
| Existing asset convergence | Reach registration management, converge separate stability stores and finish admitted QC persistence and user journeys. | Product/domain owners; existing packages/L1 | Actual persisted/readable operations, appropriate entitlements, no duplicated authority and qualified scope. |
| Publishing completion | Supported format/version packages, independent validation, lifecycle behavior, test transmission and acknowledgment handling. | Regulatory operations; S5/L1 | Approved-byte linkage, real test acknowledgments and exact supported pathway matrix. |
| Repeatable operations | Reusable onboarding/qualification, measured support/hosting/usage economics and independent assurance. | Operations/quality/finance; L1 | Repeat paid acceptance, renewals, sustainable costs and dated assurance evidence. |
| Controlled expansion | Broader admitted scientific, CMC, laboratory, MDX and jurisdiction workflows only as accepted. | Existing domain owners and founder | Scope decisions where required, current qualified evidence and truthful customer access/copy. |

The next execution step is to complete the existing purchase-to-project path and prove supported MDX and biopharma workflows inside the same governed environment, while retaining the independent launch and release gates.
