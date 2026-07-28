# Medical device & IVD regulatory (510(k), De Novo, PMA) and …

> **Verdict: 🔴 Not competitive**
> Weighted capability score — **us 2.1 / 5** vs **best competitor 4.2 / 5** across 14 dimensions.

**Full category as scoped:** Medical device & IVD regulatory (510(k), De Novo, PMA) and device QMS

## Who buys, and what they are actually buying

Two budget holders, usually buying together in medtech/IVD companies of 50–2,000 people. (1) VP/Director of Regulatory Affairs owns the submission budget and buys one outcome: a submittable, defensible FDA package — an official eSTAR for 510(k)/De Novo, a PMA module set, an EU MDR/IVDR technical file — produced faster and with fewer AI/Not-Substantially-Equivalent and Additional Information (AI/NSE) letters. Their proof point is a clearance, not a feature list. (2) VP/Director of Quality (RA/QA combined below ~300 headcount) owns the QMS budget and buys audit survivability under 21 CFR 820 QMSR (effective 2026-02-02, incorporating ISO 13485:2016 by reference — https://www.fda.gov/medical-devices/postmarket-requirements-devices/quality-management-system-regulation-qmsr) and notified-body surveillance. Their non-negotiable is a vendor validation package they can hand an FDA investigator, plus Part 11 audit trail and e-signature. In practice one of these two signs and the other holds veto. Deals die on three questions: "does it produce the actual eSTAR", "is it validated out of the box", and "can my RA associate find it without training". Typical deal size $25K–$60K/yr mid-market, $150K–$1M+ enterprise.

## Market structure

Structure. The category is not one market, it is three adjacent budgets that buyers assemble: (a) device eQMS — Greenlight Guru at the emerging/mid tier, MasterControl and Veeva QualityOne at enterprise; (b) medtech RIM — Rimsys effectively uncontested, Veeva RIM at the very top; (c) engineering-side compliance/ALM — Ketryx, Matrix Requirements, Jama. Almost no company buys one vendor for all three. That is the strategic opening this product was designed for and the reason its unified backend has real acquisition value even though it does not currently ship as a product.

Regulatory forcing functions in play right now, both of which reprice the category. QMSR took effect 2026-02-02, amending 21 CFR 820 to incorporate ISO 13485:2016 by reference, and FDA retired QSIT in favor of the updated Inspection of Medical Device Manufacturers Compliance Program 7382.850 on the same date (https://www.fda.gov/medical-devices/postmarket-requirements-devices/quality-management-system-regulation-qmsr). Every device company is re-examining its QMS in 2026 — an unusually large number of evaluations are open. Separately, electronic submission via eSTAR is mandatory for Traditional, Special and Abbreviated 510(k)s; paper/PDF compilation is no longer accepted (https://www.fda.gov/medical-devices/how-study-and-market-your-device/estar-program). A widely repeated secondary claim is that eSTAR 7.0 becomes the only accepted template for new applications from 2026-08-03 (https://cruxi.ai/pages/subpages/regulatory/510k/resources/fda-estar-templates.html) — five days after this analysis; that specific date and version were NOT verified against an FDA primary source and should be confirmed in diligence. Either way, eSTAR output is a gating requirement, not a nice-to-have.

Deal size and procurement pattern. Mid-market device eQMS clusters at $25K–$60K/yr: Greenlight Guru's median observed contract is $43,989/yr with a $20,975–$54,739 range and $2K–$5K mandatory onboarding (https://checkthat.ai/brands/greenlight-guru/pricing). MasterControl entry is cited near $25K/yr scaling past $100K/yr (https://checkthat.ai/brands/mastercontrol). Rimsys, Ketryx and Veeva are all quote-only; Veeva and Rimsys are enterprise-weighted. Sales cycles run 3–9 months mid-market and 9–18 months enterprise, and the technical evaluation is dominated by two artifacts, not features: the vendor validation package and a live demo producing a real submission output. Services-attached AI-native entrants are compressing the floor — Pure Global launched flat-fee full-service market access starting at USD $2,000 per market in February 2026, citing >50% reduction in dossier compilation time from in-house AI tooling (https://www.pureglobal.com/ , https://www.pureglobal.ai/).

Consolidation. Rimsys' KPMG partnership (March 2025) and its Spring 2026 move into embedded submission authoring signal RIM expanding into authoring; Veeva's production Accumulus connectivity signals the submission-transmission layer commoditizing at the top. Greenlight Guru's January 2026 package-separation repricing (reported up to +100% with no new features — https://openregulatory.com/articles/greenlight-guru-price) is generating churn evaluations in the exact mid-market segment a challenger would target. Capital is flowing to AI-native compliance: Ketryx's $39M Series B (September 2025, >$55M total) is the reference round (https://www.rdworldonline.com/ketryx-raises-39-million-in-series-b-funding-to-expand-ai-compliance-tools-for-life-sciences/). The window for an AI-native entrant to take mid-market share is open but closing as Greenlight Guru AI reaches GA in Q2 2026 and Veeva's regulatory agents land in August 2026.

## The five closest competitors

### Greenlight Guru — Greenlight Guru Quality (eQMS), Product Development, Software Development, Quality Events; Greenlight Guru AI

The default medical-device-only eQMS for the emerging-to-mid-market. Positions as 'the #1 QMS for medical devices' — purpose-built for 21 CFR 820/QMSR and ISO 13485 rather than a horizontal QMS configured for devices. Wins the RA/QA-combined buyer who wants design controls, risk, and QMS in one validated system and does not want to run a validation project.

**Strengths**

- Validated-out-of-the-box IQ/OQ/PQ package with per-release revalidation — removes a 6–12 week customer validation project
- Device-only data model: design controls, DHF traceability, ISO 14971 risk, CAPA, complaints, supplier, training in one system under QMSR
- Enormous mid-market install base and auditor familiarity; notified bodies and FDA investigators have seen the system before
- Published QMSR transition resources and a product already mapped to ISO 13485:2016 clause structure
- Fast time-to-value: an RA associate can find and use every module from the primary navigation on day one

**Weaknesses**

- Weak global RIM: no serious multi-country registration lifecycle, no Universal UDI framework, no EUDAMED M2M — companies selling in 30+ markets buy Rimsys alongside it
- AI is GA-targeted Q2 2026 and beta-gated; no validated AI agents, no predicate/substantial-equivalence reasoning engine
- No IVD-specific analytical performance engine (no IVDR Annex VIII rule engine, no cutoff/hook-effect/carryover/recovery calculators)
- Aggressive Jan-2026 repricing is creating active churn evaluations in the installed base — a real wedge for a challenger
- Not verified that it emits a filled official FDA eSTAR PDF; it manages the content that goes into one

| | |
|---|---|
| AI shipped today | Greenlight Guru AI is targeted for GA in Q2 2026 with beta customers getting early access; it is grounded on the customer's own QMS records and traceability rather than a general corpus. Shipped/beta capabilities described: generate device-specific design-control and risk starters, chat over QMS data, and search across the QMS with linked source references. As of mid-2026 this is the newest and least-proven part of their stack — treat AI as a tie-breaker, not a differentiator, in a 2026 bake-off. |
| GxP / validation posture | Strongest in the set for the mid-market. Ships validated out of the box with a 21 CFR Part 11-compliant IQ protocol plus completed OQ and PQ reports, and re-validates each release — so the customer inherits the validation rather than executing it. This is the single most common reason a 200-person device company picks them over a cheaper tool. |
| Pricing signal | Not listed publicly; sales-quoted. Third-party aggregation puts the median contract at $43,989/yr with observed deals from $20,975 to $54,739/yr, and $25K–$35K/yr for small teams rising to $50K–$60K+/yr with multiple modules. A January 2026 'package separation' restructuring is reported to raise prices materially (up to ~+100%) without added features. Budget $2,000–$5,000 one-time mandatory onboarding. |

<details><summary>Sources</summary>

- https://www.greenlight.guru/
- https://www.greenlight.guru/greenlight-guru-ai
- https://www.greenlight.guru/blog/greenlight-guru-ai-features
- https://www.greenlight.guru/software-validation-guidance
- https://www.greenlight.guru/qmsr-resource-hub
- https://checkthat.ai/brands/greenlight-guru/pricing
- https://openregulatory.com/articles/greenlight-guru-price
- https://www.itqlick.com/greenlight-guru/pricing

</details>

### Rimsys — Rimsys MedTech RIM platform — Registrations, Submissions, Standards, Essential Principles, UDI (Universal UDI), Rimsys Intelligence, Rimsys Connect; Spring 2026 'Regulatory Execution Engine' release

The category-defining Regulatory Information Management system built only for medtech — the system of record for 'what am I registered to sell, where, and what expires when'. Sells to enterprise RA operations leaders, not to quality. Explicitly complements rather than replaces an eQMS, which is why it co-exists with Greenlight Guru and MasterControl in the same account.

**Strengths**

- Only true medtech RIM at scale: registrations, submissions, standards, essential principles and UDI in one model across 100+ markets
- Universal UDI framework with bulk UDI submission and EUDAMED / M2M transmission compliance — a hard, expensive problem nobody else solves well
- Regulatory intelligence across 90+ countries with AI triage scoped to the customer's actual product/market matrix
- Enterprise credibility: trusted by 6 of the top 12 global MedTech manufacturers; KPMG partnership (March 2025) for transformation pull-through
- Spring 2026 added embedded submission authoring with reusable content — moving upstream into the authoring territory this product occupies

**Weaknesses**

- Not a QMS: no design controls, no DHF, no CAPA/complaints/NC, no training or supplier management — the quality buyer's veto is unaddressed
- No predicate/substantial-equivalence intelligence and no US 510(k)-specific reasoning; it manages the submission record, it does not argue SE
- No IVD analytical-performance or IVDR Annex VIII classification engine
- Enterprise sales motion and price point make it inaccessible to the 50–300 person device company that is the volume of the market
- Public validation posture unverified — a gap for a QMSR-era quality buyer

| | |
|---|---|
| AI shipped today | Spring 2026 release embeds submission authoring, reusable submission content, and configurable impact workflows in the RIM platform, plus Rimsys Intelligence — regulations, guidance documents, safety alerts and legislation across 90+ countries with AI triage and prioritization scoped to each customer's products and markets. Described by the company as the first step toward its AI vision, i.e. AI-assisted regulatory monitoring and authoring shipping now, agentic execution still ahead. |
| GxP / validation posture | Not verified. No public IQ/OQ/PQ package, validation-package SKU, or Part 11 attestation was found in the sources reviewed. Enterprise customers of this size typically run their own CSV/CSA against the vendor's qualification evidence; absence of a public package is not evidence of absence. |
| Pricing signal | Not public. Five pricing editions, subscription-based, scaled by modules/users/scope; quote-only via vendor. Enterprise-weighted given the customer profile (6 of the top 12 global medtech manufacturers), so expect six-figure annual contracts at that tier — the specific figures are not verified. |

<details><summary>Sources</summary>

- https://www.rimsys.io/
- https://www.rimsys.io/products/rimsys-platform
- https://www.rimsys.io/products/udi
- https://secure.businesswire.com/news/home/20260505903088/en/Rimsys-Launches-the-Regulatory-Execution-Engine-for-MedTech
- https://www.rimsys.io/blogs/rimsys-becomes-the-trusted-regulatory-partner-for-6-of-the-top-12-global-medtech-manufacturers
- https://www.businesswire.com/news/home/20250429891265/en/Rimsys-Announces-Bulk-UDI-Submission-and-Rimsys-Connect-to-Empower-MedTech-Regulatory-Teams
- https://www.g2.com/products/rimsys/pricing
- https://www.trustradius.com/products/rimsys-regulatory-management-software/pricing

</details>

### Ketryx — Ketryx FDA Software Compliance Platform / ALM — IEC 62304, ISO 13485, ISO 14971, 21 CFR 820 & Part 11; Ketryx AI Agents (Change Impact, Requirements, Traceability, Complaint)

The AI-native challenger, and the closest philosophical competitor to this product. Overlays existing engineering tools (Jira, GitHub, etc.) rather than replacing them, and continuously generates the DHF/technical file as a by-product of development. Sells to VP Engineering and Head of SaMD/Software Quality first, then pulls in RA — a different entry point that bypasses the incumbent eQMS incumbency.

**Strengths**

- Validated AI agents shipped and referenced — the single hardest claim to make in this category and the one that neutralizes the 'AI is not auditable' objection
- Continuous DHF/technical-file generation from live engineering artifacts — no separate documentation project
- 4 of the top 5 Fortune 500 medtech companies on the platform; products reaching >100M patients — reference power that beats any feature demo
- Strongest SaMD/AI-ML device fit: IEC 62304, SBOM, AI/ML model compliance — exactly where 510(k) volume is growing
- Well capitalized ($55M+) and moving fast; published eSTAR-program workflow content tying its output to the 510(k) submission

**Weaknesses**

- Not a full eQMS: thin on non-software quality processes (supplier, training-at-scale, management review, manufacturing NC) — a hardware-heavy device company still needs a second system
- No global registration/UDI lifecycle — loses to Rimsys on 'where can I sell'
- No IVD analytical-performance or IVDR Annex VIII depth
- No predicate/substantial-equivalence intelligence engine
- Engineering-led entry point means longer path to the RA budget holder in RA-dominant organizations

| | |
|---|---|
| AI shipped today | The strongest verifiable AI posture in the set: launched what it describes as the industry's first validated AI Agents for regulated industries — Change Impact, Requirements, Traceability and Complaint agents — operating in a validated, human-in-the-loop framework aligned to IEC 62304, ISO 13485, ISO 14971 and 21 CFR Part 11, claimed to cut manual compliance work ~90%. This is shipped and customer-referenced, not roadmap. |
| GxP / validation posture | Differentiated: markets the AI agents themselves as validated, which is the specific objection every regulated buyer raises about LLM features. Compliance framework spans IEC 62304, ISO 13485, ISO 14971, 21 CFR 820/11 and GMP. The exact contents of the customer-facing validation package (executed IQ/OQ/PQ vs. qualification evidence) are not verified from public sources. |
| Pricing signal | Not public. Funding is the proxy: $39M Series B led by Transformation Capital (September 2025), >$55M total. Customer mix (4 of top 5 Fortune 500 medtech, HeartFlow, Flo Health, Meta Reality Labs, DeepHealth, Beacon Biosignals, Aignostics) implies enterprise six-figure ACVs at the top with a land-and-expand engineering-team entry below. |

<details><summary>Sources</summary>

- https://www.ketryx.com/
- https://www.ketryx.com/product
- https://www.ketryx.com/use-case/ai-ml-med-device
- https://www.ketryx.com/about/company
- https://www.newsfilecorp.com/release/285490/Ketryx-Enters-2026-with-Record-Momentum-as-Demand-for-Validated-AI-Surges
- https://www.rdworldonline.com/ketryx-raises-39-million-in-series-b-funding-to-expand-ai-compliance-tools-for-life-sciences/
- https://www.ketryx.com/blog/simplifying-510k-submissions-with-fdas-estar-program-and-ketryx
- https://www.cbinsights.com/company/ketryx

</details>

### Veeva MedTech (Vault RIM / RegulatoryOne / QualityOne) — Veeva Vault RIM and RegulatoryOne for registrations, submissions, publishing and archival; Vault QualityOne/QMS; Vault 26R1; Veeva Falcon AI platform and Regulatory/Medical AI Agents

The enterprise platform play: one Vault for regulatory, quality, clinical and medical, sold on consolidation rather than best-of-breed. Wins when the acquirer is a large diversified manufacturer already standardized on Veeva for pharma and wants medtech on the same backbone. Rarely competes below ~$500M revenue.

**Strengths**

- Single-vendor consolidation across RIM, quality, clinical and medical — the CIO's preferred answer
- Production Accumulus connectivity for multi-authority packaging/routing without republishing — genuinely ahead on submission transmission
- Enterprise GxP credibility and auditor familiarity at the largest manufacturers
- Falcon AI agents built on frontier models inside the Vault security/compliance boundary — solves the data-residency objection
- Deep pockets and release cadence (26R1 April 2026) that will close feature gaps mechanically

**Weaknesses**

- Regulatory/Medical AI Agents slated for August 2026 — not shippable evidence in a mid-2026 evaluation
- Heavy, slow and expensive to implement; effectively unavailable to the 50–500 person device company where 510(k) volume lives
- Device-specific depth (predicate/SE argumentation, IVDR Annex VIII, analytical performance) is thin relative to its RIM/QMS breadth
- Configuration-heavy: 'medtech' is largely a configuration of a pharma-shaped platform
- Pricing and SI dependency make it a poor comparator for an emerging-growth acquirer's ICP

| | |
|---|---|
| AI shipped today | Falcon AI platform with agentic authoring announced at the 2026 Summit. Clinical, Regulatory and Medical AI Agents are slated for August 2026 — i.e. arriving, not yet proven in the field as of this analysis. Expected regulatory capabilities: document auto-tagging, regulatory-intelligence extraction, predictive submission-timeline insight, labeling paragraph analysis, missing-content detection, and drafting health-authority question responses, running on Anthropic and Amazon models via Bedrock inside the Vault boundary. Vault RIM ↔ Accumulus connectivity went to production in 2026, enabling packaging and routing to participating authorities (FDA, Health Canada, Swissmedic, Saudi FDA pilot) without republishing — the most concrete multi-agency 'push-button filing' in the market. |
| GxP / validation posture | Mature enterprise GxP posture: Vault is deployed as the regulated system of record across pharma and medtech with established qualification documentation and per-release validation support, and Part 11 controls are table stakes in the platform. Specific medtech validation-package contents were not verified from public sources. |
| Pricing signal | Not public. Enterprise subscription; Veeva reported 1,552 total customers in FY2026 (ended January 2026), 1,196 in R&D/Quality. Deals in this category are consistently six to seven figures annually with multi-quarter implementations and a systems integrator attached. |

<details><summary>Sources</summary>

- https://www.veeva.com/medtech/products/regulatory-compliance-management/
- https://www.clinicaltrialvanguard.com/conference-coverage/veeva-unveils-falcon-ai-platform-and-agentic-authoring-at-2026-summit/
- https://intuitionlabs.ai/articles/veeva-vault-26r1-release-notes-qms-rim
- https://intuitionlabs.ai/articles/veeva-systems-2021-2025-evolving-life-sciences-cloud-leader
- https://sourceforge.net/software/product/RegulatoryOne/

</details>

### MasterControl — MasterControl Quality Excellence (document management, CAPA, training, change control, complaints, audit management); Validation Excellence Tool and patented Validation on Demand

The 30-year enterprise document-centric compliance incumbent. Sells audit survivability and process control to Quality, and shows up in every device QMS shortlist above ~300 employees. Competes on completeness and inspection history, not on speed or user experience.

**Strengths**

- Broadest connected eQMS process coverage: document control, CAPA, complaints, change control, training, audit — all cross-linked
- Validation on Demand materially collapses customer validation cost and time, and it is patented
- 1,000+ customers across pharma, biotech and device; deep FDA inspection track record and auditor familiarity
- QMSR-ready positioning with published guidance as 21 CFR 820 moved to ISO 13485 incorporation in February 2026
- Enterprise procurement, security and support posture already cleared at most large manufacturers

**Weaknesses**

- Not a submissions platform: no 510(k)/De Novo/PMA authoring, no predicate/SE intelligence, no eSTAR production
- No global registration/UDI RIM — needs Rimsys or Veeva alongside
- Widely characterized as complex and heavy for smaller, faster device teams; usability is its recurring loss reason
- AI posture is incremental document/workflow assistance, not validated agents
- Document-centric architecture makes structured device data (DHF traceability, risk matrices, IVD performance) a bolt-on rather than native

| | |
|---|---|
| AI shipped today | Life-sciences-specialized AI applied to routine work — automated workflow routing and intelligent document summarization — explicitly framed as efficiency under human oversight rather than autonomous agents. Materially less ambitious than Ketryx and less specific than Veeva's agent roadmap; do not expect AI to be the reason a buyer picks MasterControl in 2026. |
| GxP / validation posture | A genuine commercial strength: patented Validation on Demand automates validation against the customer's configured workflows at the click of a button, with the Validation Excellence Tool supporting CSA-style approaches; the company cites medical device customers reaching a validated state in under 45 minutes on average, with built-in templates for 21 CFR Part 11, ISO 13485 and international standards. This directly attacks the largest hidden cost of a QMS purchase. |
| Pricing signal | Not listed publicly. Third-party aggregation puts entry around ~$25K/yr scaling quickly to $100K+/yr; enterprise deployments run well above that with services attached. |

<details><summary>Sources</summary>

- https://www.mastercontrol.com/glossary-page/fda-qmsr/
- https://www.mastercontrol.com/resource-center/documents/2026-quality-medical-device-trends-for-life-sciences/
- https://checkthat.ai/brands/mastercontrol
- https://meddeviceguide.com/blog/best-eqms-software-medical-devices-2026-guide
- https://www.cognidox.com/blog/best-eqms-software-medical-device-2026
- https://www.g2.com/products/mastercontrol-quality-management-system/reviews

</details>

## Capability rubric

Our score is cited to `file:line` in this repository. Theirs is cited in the competitor sections above. Scored on what **ships and is reachable**, not what is architected — an unreachable or unvalidated capability scores low regardless of code quality.

| Dimension | Weight | Us | Best competitor | Their score | Our evidence |
|---|---|:--:|---|:--:|---|
| Produces the official FDA eSTAR PDF (submittable 510(k)/De Novo output) | critical | **1** 🔻 | Ketryx | 3 | server/services/pathway-engines/estar/estar-field-map.ts:33-38 (all four descriptor maps empty); server/routes/510k-estar-routes.ts:228 (officialEstarPdf: false); assets/estar-templates/ contains only README.md; POST /official returns 422 ESTAR_NOT_PRODUCIBLE |
| Reachable device/IVD workspace — can an RA associate find and use it unaided | critical | **1** 🔻 | Greenlight Guru | 5 | client/src/concept2cure/v2/registryModel.ts:116-123 (RAIL_PRIMARY = 5 non-device destinations); registryModel.ts:139-141,164-168 (device-510k, device-cer, device-diagnostics, design-controls, human-factors, quality, risk in NAV_HIDDEN); registryModel.ts:446-500 (SEGMENT_MODULES referenced only by its own test) |
| eQMS process breadth under QMSR/ISO 13485 — doc control, CAPA, complaints, NC, training, supplier, audit, management review | critical | **1** 🔻 | MasterControl | 5 | server/routes/qms.ts:66-222 (17 endpoints over server/services/qms/qms.service.ts, 275 lines) with zero client references to /api/qms; client/src/concept2cure/v2/surfaces/QualityModule.tsx (20-line adapter, SOP register + change control only) |
| Vendor validation package — executed IQ/OQ/PQ, per-release revalidation, auditor-ready evidence | critical | **1** 🔻 | Greenlight Guru | 5 | docs/validation/VSR-CORTEX-001-VALIDATION_SUMMARY_REPORT.md:9,17 (1.0.0-DRAFT, 2025-01-24, approver PENDING, 'REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE'); all 10 documents in docs/validation/ are DRAFT and describe a differently-named 'Cortex Prime AI System' |
| Asset completeness and transferability — does the acquired repo contain the demonstrated capability | critical | **1** 🔻 | Veeva MedTech | 5 | server/routes/predicate-intelligence.ts:62,248 (proxy to SHADOW_SERVICE_URL, 502 on absence); shadow_service/ contains 2 files and fails to import (ModuleNotFoundError: shadow_service.shadow_service.models_predicate, verified by execution); server/routes/se-matrix.ts:29 and server/routes/docx-factory.ts:34 same dependency |
| Part 11 audit trail and electronic signature integrity | critical | **4** 🔻 | MasterControl | 5 | server/routes/audit-trail-ledger.routes.ts:4-21 (per-org SHA-256 hash chain, record_hash/previous_hash/sequence_number via BEFORE INSERT trigger, untruncated hashes); db/migrations/20260222_audit_events_hash_chain.sql; server/services/audit/__tests__/chain.test.ts and chainIntegrityMonitor.test.ts |
| Predicate device selection and substantial-equivalence argumentation | critical | **2** | Rimsys | 2 | Real: server/routes/fda510k-routes.ts:1022,1167 (live openFDA 510(k) search) — but zero client callers. Shipping path: client/src/concept2cure/mdx/hooks/useK510.ts:13,22 ('degrade to fixture on 502', 'falls back to fixtures') against server/routes/predicate-intelligence.ts:248 |
| Design controls, DHF and ISO 14971 risk file with end-to-end traceability | critical | **3** 🔻 | Greenlight Guru | 5 | server/routes/design-risk.ts:78-302 (20 endpoints: inputs, outputs, verifications, validations, reviews, changes, design plan, DHF assessment, RMF + risk items + controls + summary) — but the shipping UI wires only the thin route at client/src/concept2cure/v2/surfaces/DesignControls.tsx:146 → server/routes/design-controls.routes.ts |
| IVD/IVDR-specific depth — Annex VIII classification, analytical performance, performance evaluation, CDx/CLIA | high | **4** 🔺 | Veeva MedTech | 2 | server/routes/ivd-lifecycle.ts:156-452 (~30 calculators: stability, carryover, hook effect, recovery, cutoff, traceability, Monte Carlo accuracy, EVPI/EMV, drift, calibration backtest); server/services/regulatory/__tests__/ivdr-classification.test.ts (13 assertions pass, 7 Annex VIII rules + 10-row rule trace); ivd-platform.openapi.json (34 paths). Deduction: zero client references to /api/ivd-lifecycle |
| AI/ML device lifecycle — PCCP, 524B cybersecurity/SBOM, IEC 62304 | high | **3** 🔻 | Ketryx | 4 | server/services/ai-ml-pccp/pccp.service.ts:129,184 (approve/supersede lifecycle) + pccp-validator.service.ts:322 + server/routes/pccp.ts:81-254; server/services/regulatory/cybersecurity-524b.ts (SBOM scoring, tests pass). Deduction: 1 client reference each; client/src/concept2cure/v2/surfaces/DeviceSubmission.tsx:457 notes they 'stay flagged, not half-wired' |
| Post-market: complaints, MDR/vigilance reportability triage, MAUDE/recall surveillance | high | **4** | MasterControl | 4 | server/services/capa-mdr/ (1,574 lines: triageEngine.ts, clockCalculator.ts, stateMachine.ts, capaMdr.service.ts) with deterministic 21 CFR 803 / EU MDR Art 87 / 21 CFR 806 classification per server/services/ana/capaMdrTools.ts:32-38; server/routes/capa-mdr.ts mounted at register-document-routes.ts:281; 8 client references; server/services/postmarket/openfda-surveillance.ts |
| Global registration lifecycle, UDI/EUDAMED and market-access RIM | high | **1** 🔻 | Rimsys | 5 | server/routes/registrations-standards.ts:35 — one endpoint (GET /data-standards); server/routes/mdx-udi.ts exists but no multi-country registration lifecycle, no EUDAMED M2M, no bulk UDI submission |
| Shipped, grounded, governed AI (not roadmap) for device regulatory work | high | **3** 🔻 | Ketryx | 4 | server/services/ana/AnaToolExecutor.ts:4036 (live openFDA tool call), server/services/ana/capaMdrTools.ts (5 tools), governed export consequence + e-signature on mutations at server/routes/510k-estar-routes.ts:214-231. Deduction: server/services/ana/predicateIntelligenceTools.ts:10 — the 4 predicate tools call the absent shadow service |
| Human factors / IEC 62366-1 use-related risk analysis | medium | **3** 🔻 | Greenlight Guru | 4 | server/routes/human-factors.ts:32-136 (4 endpoints) over server/services/regulatory/human-factors.ts (assessHfeCompleteness, analyzeUseRelatedRisk — 5 assertions pass); client/src/concept2cure/v2/surfaces/HumanFactors.tsx:159 persists real scenarios but falls back to sample at :185 |

## Where we stand

**Where we win**

- IVD/IVDR technical depth no competitor in this set ships. server/services/regulatory/ivdr-classification is a real Annex VIII rule engine — seven classification rules, highest-applicable-class resolution, a complete 10-row rule trace on every call, and every knowledge reference resolving to a corpus entry; all 13 assertions pass (server/services/regulatory/__tests__/ivdr-classification.test.ts, verified by running vitest). server/routes/ivd-lifecycle.ts exposes ~30 analytical-performance and decision calculators — real-time and accelerated stability, carryover, hook effect, recovery, cutoff determination, metrological traceability, scientific validity, Monte Carlo diagnostic accuracy, EVPI/EMV decision analysis, calibration backtest, drift detection (server/routes/ivd-lifecycle.ts:156-452), documented in ivd-platform.openapi.json (34 paths). Rimsys, Greenlight Guru, Ketryx, Veeva and MasterControl have no equivalent — this is genuine, defensible IP.
- Deterministic post-market safety triage. server/services/capa-mdr/ is 1,574 lines across a triage engine, an RFC-style clock calculator and a state machine, computing FDA MDR reportability under 21 CFR 803, EU MDR Article 87 vigilance, and 21 CFR 806 correction/removal triggers with jurisdiction, report type, severity, clock and rationale — explicitly deterministic, not LLM-generated (server/services/ana/capaMdrTools.ts:32-38). It is the one deep device backend that is actually wired to the UI (8 client references to /api/capa-mdr). Competitors provide complaint workflow; they do not compute the regulatory trigger.
- Part 11 audit integrity implemented at the database, not the application. The audit ledger is a per-organization SHA-256 hash chain (record_hash / previous_hash / sequence_number) populated by a BEFORE INSERT trigger with a backfill migration, serving full untruncated hashes so the chain the UI verifies is real and contiguous (server/routes/audit-trail-ledger.routes.ts:4-21, db/migrations/20260222_audit_events_hash_chain.sql). This is stronger tamper evidence than an application-layer audit log and is supported by a dedicated test suite (chain.test.ts, chainIntegrityMonitor.test.ts, audit-integrity-pglite.integration.test.ts, auditChainIntegritySweep.test.ts).
- AI/ML device lifecycle coverage that is early to a real 2026 requirement. A working PCCP module with plan/modification CRUD, a validator, and a full governed lifecycle including approve and supersede (server/services/ai-ml-pccp/pccp.service.ts:129,184; server/routes/pccp.ts:81-254), plus 524B cybersecurity SBOM completeness scoring and readiness assessment (server/services/regulatory/cybersecurity-524b.ts, tests passing). Only Ketryx is credibly in this space, and it approaches it from IEC 62304 rather than from the PCCP artifact itself.
- Honest fail-closed engineering — a real diligence asset. The eSTAR path refuses to fabricate a submittable artifact: the ZIP export self-labels officialEstarPdf: false with an inline comment explaining it is not the PDF CDRH ingests (server/routes/510k-estar-routes.ts:221-228), POST /official returns 422 ESTAR_NOT_PRODUCIBLE with named blockers, and GET /readiness exists purely so the UI can disable the button with a reason (server/routes/510k-estar-routes.ts:468). Tests assert the fail-closed behavior explicitly (estar-fill.test.ts:67,80). A buyer inheriting this codebase inherits an unusually low risk of discovering fabricated compliance claims post-close.

**Where we reach parity**

- Design controls and risk management data model. server/routes/design-risk.ts:78-302 implements 20 endpoints covering the full 21 CFR 820.30 chain — design inputs, outputs, verifications, validations, reviews, changes, design plan, DHF assessment — plus an ISO 14971 Risk Management File with risk items, risk controls and an RMF summary. On data model this is at parity with Greenlight Guru. It is not at parity in the product, because the shipping UI wires only the thin /api/design-controls GET/POST design-inputs route, not this one (client/src/concept2cure/v2/surfaces/DesignControls.tsx:146 vs server/routes/design-controls.routes.ts).
- Live FDA source data. Real openFDA integration against the 510(k) and PMA endpoints with device_class and regulation_number extraction, accessdata.fda.gov deep links, host throttling and caching (server/routes/fda510k-routes.ts:264,1022,1167,1380,1474; server/services/integrations/host-throttle.ts:52). Also openFDA post-market surveillance and device recalls (server/services/postmarket/openfda-surveillance.ts). Equal to or better than what competitors expose; undermined only by the fact that zero client code calls /api/fda510k.
- AI substrate. AnaToolExecutor is a genuine tool-calling agent with device-specific tool families for predicate intelligence and CAPA/MDR, governed export consequences, e-signature and audit wired into the mutation path. As raw capability this is at parity with Ketryx's agents and ahead of Greenlight Guru's Q2-2026 GA — but see the losses, because the device tools that matter most depend on a service that is not in this repository.

**Where we lose**

- The product has no front door. RAIL_PRIMARY contains exactly five destinations — Chats, Projects, Communication Center, Apps, Settings (client/src/concept2cure/v2/registryModel.ts:116-123) — and a test locks it at five (client/src/concept2cure/v2/__tests__/registryModel.test.ts:35). Every device and IVD surface is demoted into NAV_HIDDEN: device-510k, device-cer, device-diagnostics, design-controls, human-factors, quality, risk (registryModel.ts:139-141,164-168). The comment calls them 'reachable via ⌘K and deep-link', and they are, but SEGMENT_MODULES — the object literally documented as 'complete capability inventory on the segment home', listing every medtech and diagnostics module (registryModel.ts:446-500) — is referenced by nothing except its own unit test. A regulatory affairs associate opening this product sees a chat window and cannot find the 510(k) workbench. Greenlight Guru scores 5 here without trying.
- Cannot produce an official FDA eSTAR. All four descriptor field maps are empty — '510k-device', '510k-ivd', 'de_novo-device', 'de_novo-ivd' (server/services/pathway-engines/estar/estar-field-map.ts:33-38) — and assets/estar-templates/ contains only a README, no vendored FDA template. POST /api/510k/estar/official therefore always returns 422 ESTAR_NOT_PRODUCIBLE, and /build emits a ZIP of six section PDFs explicitly marked officialEstarPdf: false (510k-estar-routes.ts:228). eSTAR is mandatory for Traditional, Special and Abbreviated 510(k)s. This is a category-gating failure: the product cannot deliver the artifact the RA buyer is purchasing.
- The flagship differentiator is not in the repository. Predicate intelligence, SE-matrix generation and the DOCX factory are 100% HTTP proxies to an out-of-repo Python service at SHADOW_SERVICE_URL (server/routes/predicate-intelligence.ts:62; server/routes/se-matrix.ts:29; server/routes/docx-factory.ts:34). Every one of the ~12 proxy routes returns 502 'Shadow service unavailable' when it is absent (predicate-intelligence.ts:248,264,275,286,308,325,341,352,368). The shadow_service/ directory in this repo holds two files, and shadow_service/scoring/risk_code_map.py fails to import — ModuleNotFoundError: No module named 'shadow_service.shadow_service.models_predicate' (verified by execution). The 510(k) UI hooks are written to expect this and 'degrade to fixture on 502' so the surface 'falls back to fixtures so nothing renders empty' (client/src/concept2cure/mdx/hooks/useK510.ts:13,22). Net effect: the predicate and SE panels a buyer sees in a demo are demo data, and the real openFDA integration that does exist at /api/fda510k has zero client callers.
- No shippable eQMS. server/routes/qms.ts:66-222 exposes 17 endpoints — document control with state transitions, training and training-compliance, suppliers and supplier approval, internal audits, management reviews, nonconformances with disposition, and a compliance summary — over a 275-line service. Client references to /api/qms: zero. The 'quality' surface renders a 20-line adapter into a separate module whose tabs are SOP register and change control only (client/src/concept2cure/v2/surfaces/QualityModule.tsx). There is no CAPA UI, no complaint-handling UI, no NC UI. Against QMSR effective February 2026, the quality buyer's veto is absolute.
- No vendor validation package. docs/validation/ contains ten documents — VMP, IQ, OQ, PQ, VSR, ISO 14971 risk analysis, Part 11 traceability matrix, cloud vendor qualification, security assessment — totalling 4,525 lines, and every one is version 1.0.0-DRAFT dated 2025-01-24 with approver PENDING and a banner reading 'DRAFT - REQUIRES VALIDATION REVIEW BEFORE PRODUCTION USE' (docs/validation/VSR-CORTEX-001-VALIDATION_SUMMARY_REPORT.md:9,17). They also describe a differently-named system, the 'Cortex Prime AI System'. Nothing is executed. Greenlight Guru ships a completed IQ/OQ/PQ and revalidates every release; MasterControl reaches a validated state in under 45 minutes via Validation on Demand. This alone loses mid-market deals.
- No global registration or UDI lifecycle. server/routes/registrations-standards.ts contains a single endpoint, GET /data-standards. Rimsys manages registrations across 100+ markets with a Universal UDI framework, bulk UDI submission and EUDAMED M2M. Any customer selling outside the US and EU buys Rimsys regardless of what else they buy.
- Asset transferability. For an acquirer this is the finding that changes the price, not just the score: the demonstrable IP includes a service whose source is not being conveyed, and the repo's own inventory documents are stale (FEATURE_INVENTORY.md names an app entry point that no longer exists). Reps and warranties must cover the shadow service explicitly.

## Is the advantage durable?

No durable moat exists today, but one narrow, real moat is buildable and defensible for roughly 18–30 months.

What is not a moat. Every capability the platform currently shows a buyer is either absent from the repo (predicate intelligence, SE matrix), unreachable (IVD calculators, QMS, DHF/RMF), or commodity (openFDA queries — public API, any competitor can add it in a sprint). The AI substrate is good engineering, but Ketryx already ships validated AI agents, Veeva's regulatory agents land August 2026 on frontier models inside the Vault boundary, and Greenlight Guru AI reaches GA in Q2 2026 grounded on customer QMS data. The AI window is closed within two quarters.

What is a moat, and for how long. The IVD/IVDR analytical and classification depth is the only genuinely defensible position. It is not a UI feature; it is encoded domain knowledge — Annex VIII rule interactions with highest-applicable-class resolution and a full audit trace, plus roughly 30 analytical-performance and decision calculators (cutoff determination, hook effect, carryover, metrological traceability, Monte Carlo diagnostic accuracy, EVPI). Building that requires an IVD-experienced regulatory scientist working alongside engineers for 12–18 months; it is not a scraping or LLM problem, and it is not something a product manager can spec. None of the five competitors has it, and — critically — none of them is trying. Rimsys is expanding into submission authoring, not IVD science; Greenlight Guru is expanding into AI over its own QMS records; Ketryx is going deeper on IEC 62304 and SaMD; Veeva and MasterControl are horizontal platforms for whom IVD analytics is a rounding error. Their roadmaps point away from this. That is what makes 18–30 months a defensible estimate rather than a hopeful one.

The deterministic MDR/vigilance triage engine (21 CFR 803 / EU MDR Art 87 / 21 CFR 806 with clocks and jurisdiction) is a secondary, weaker moat — roughly 12 months, because the rules are public and a determined competitor can encode them, though few have bothered to make them computable rather than a workflow form.

Time-to-close on everything else. An incumbent closes the eSTAR gap in one release cycle (they already manage the content). Design controls and DHF are already at parity or better in Greenlight Guru and Ketryx today. Global registrations and UDI would take a non-Rimsys competitor 2–3 years, but that gap runs against us, not for us.

The honest conclusion on durability: the moat is real but perishable, and it is currently invisible because no user can reach it. Every month the IVD calculators stay unwired is a month of moat decay with no offsetting revenue or reference customers. If this asset is acquired, the IVD depth must be exposed and marketed within two quarters or the advantage expires unmonetized — the domain knowledge does not depreciate, but the first-mover window and the ability to sign reference IVD customers ahead of the field does.

## Shortest credible path to parity

1. Weeks 1–2 — Put the device workstream in the navigation. Add a medtech/diagnostics destination to RAIL_PRIMARY (client/src/concept2cure/v2/registryModel.ts:116-123) or render SEGMENT_MODULES (registryModel.ts:446-500) as a segment home, and remove device-510k, device-cer, device-diagnostics, design-controls, human-factors, quality and risk from NAV_HIDDEN (registryModel.ts:139-168). Update the five-destination assertion at client/src/concept2cure/v2/__tests__/registryModel.test.ts:35. This is a configuration change against an existing, working router and it moves the single most damaging score in the rubric from 1 to 4. Nothing else on this list matters until a user can find the product.
2. Weeks 2–6 — Vendor the official FDA eSTAR templates and populate the field maps. The fill machinery is already built and proven: estar-fill.test.ts:43-64 shows a real AcroForm being filled and read back. Drop the official FDA eSTAR PDFs into assets/estar-templates/, run listAcroFields (server/services/forms/fill-official-pdf) to enumerate real field names, populate the four descriptor maps at server/services/pathway-engines/estar/estar-field-map.ts:33-38, and pin template versions in ESTAR_TEMPLATE_MANIFEST. This is a version-pinned data change, not new code — the file's own header says so. Confirm the eSTAR 7.0 template/date question first (widely reported as 2026-08-03 but unverified against FDA primary sources). Moves the top critical dimension from 1 to 4 and makes the product sellable to the RA buyer.
3. Weeks 2–8 (parallel, and the highest-leverage commercial move) — Wire the IVD calculators to a UI. /api/ivd-lifecycle exposes ~30 calculators (server/routes/ivd-lifecycle.ts:156-452) with a published OpenAPI contract (ivd-platform.openapi.json) and zero client callers. Build one IVD performance workbench surface over the existing IvdSurface shell that drives cutoff, stability, carryover, hook effect, recovery and traceability, and expose the Annex VIII classifier with its 10-row rule trace as the classification entry point. This does not reach parity — it reaches differentiation, in the only dimension where the competitive set scores 2 and this platform scores 4.
4. Weeks 4–10 — Resolve or replace the shadow service. Two branches, and diligence should force the choice before close. If the Python service is owned and conveyable, bring the source into the repository, add it to docker-compose and CI, and make the 502-to-fixture fallback (client/src/concept2cure/mdx/hooks/useK510.ts:13,22) fail loudly instead of silently rendering demo data. If it is not conveyable, delete the proxy layer and rebuild predicate search on the openFDA integration that already exists and is already tested but has zero callers (server/routes/fda510k-routes.ts:1022,1167) — a 3–4 week rebuild that yields a real, if less sophisticated, predicate capability with no external dependency. Either way, the demo must stop showing fixtures.
5. Weeks 6–14 — Ship an eQMS front end over the QMS backend that already exists. server/routes/qms.ts:66-222 provides document control with state transitions, training and compliance rollup, suppliers with approval, internal audits, management reviews and nonconformances with disposition; server/services/capa-mdr/ provides CAPA and complaints with deterministic reportability. Building UI over these two closes the quality buyer's veto. Scope this to the QMSR-relevant subset — do not attempt MasterControl's full breadth. Moves eQMS from 1 to 3, which is enough to stop losing on veto without pretending to be a QMS leader.
6. Weeks 8–20 — Execute a real validation package. Retire the ten DRAFT 'Cortex Prime' documents (docs/validation/, all 1.0.0-DRAFT dated 2025-01-24, approver PENDING) and produce an executed, approved, correctly-named IQ/OQ/PQ with a Part 11 traceability matrix tied to the actual audit-chain implementation (server/routes/audit-trail-ledger.routes.ts:4-21, which is genuinely strong evidence), plus a per-release revalidation commitment. This is the deliverable Greenlight Guru and MasterControl lead with; without it the mid-market close rate stays near zero regardless of features. Budget for an external CSV/CSA consultant — this is not an engineering task.
7. Explicitly do not pursue — global registrations and UDI RIM. Reaching Rimsys parity means 100+ market registration lifecycles, Universal UDI and EUDAMED M2M: a multi-year build against an entrenched leader that 6 of the top 12 global manufacturers already run. Partner or integrate. Every engineering week spent here is a week not spent on the IVD moat, which is the only place this asset can actually win.

## Verdict

**🔴 Not competitive** — Not competitive as a product today; genuinely valuable as an IP acquisition. Those are different findings and a buyer must not conflate them.

The product case. Six dimensions in this category are critical, and the platform scores 1 out of 5 on five of them: it cannot produce an official FDA eSTAR (the mandatory artifact for every Traditional, Special and Abbreviated 510(k)); it has no navigational front door for any device or IVD surface; it has no eQMS user interface at all under a QMSR regime that took effect five months ago; it has no executed vendor validation package; and its most demonstrable differentiator is not contained in the repository. Put a regulatory affairs director and a quality director in a room with this product and Greenlight Guru and every one of their three gating questions — "does it produce the eSTAR", "is it validated out of the box", "can my associate find it" — is answered no, no, and no. There is no configuration of this product that wins a competitive mid-market device deal in 2026. Scoring what ships rather than what is architected, this is not-competitive, and the verdict would not change even if every backend gap were closed, because the navigation and validation gaps alone are disqualifying.

The asset case, which is the one that matters for an acquisition. The backend is not vaporware. The IVDR Annex VIII classifier is a real seven-rule engine with a complete audit trace and passing tests. The ~30 IVD analytical-performance and decision calculators at server/routes/ivd-lifecycle.ts:156-452 are capability that Greenlight Guru, Rimsys, Ketryx, Veeva and MasterControl collectively do not have. The CAPA/MDR triage engine computes reportability deterministically under three regulatory regimes rather than routing a form. The audit ledger enforces tamper evidence with a database-level hash chain, which is architecturally stronger than the application-layer logging most of this field ships. The PCCP module is early to a requirement the market has barely started building for. And the codebase is unusually honest — the eSTAR path returns 422 with named blockers rather than emitting a plausible-looking PDF, and the tests assert that fail-closed behavior. An acquirer inheriting this inherits low latent-liability risk, which is rare.

The distance between those two paragraphs is almost entirely wiring and one missing repository. Five of the seven capability losses are "backend exists, no UI reaches it" — /api/qms has 17 endpoints and zero client callers, /api/ivd-lifecycle has ~30 calculators and zero, /api/design-risk has 20 endpoints while the UI calls a thinner route, /api/fda510k has live openFDA integration while the shipping predicate panel renders fixtures from a 502. That is engineering work measured in weeks, not a rebuild.

Two findings should move price rather than score. First, the shadow service: predicate intelligence, SE-matrix generation and the DOCX factory are entirely HTTP proxies to an out-of-repo Python service, and shadow_service/ in this repository is two files that will not import. Whatever was demonstrated in a sales process was produced by code not being conveyed. Confirm ownership and secure explicit reps, warranties and source delivery, or discount the valuation to zero for the entire predicate/SE capability. Second, the validation package is ten DRAFT documents dated 2025-01-24 for a differently-named system — there is no validation asset here, only a template.

Recommendation: value this as regulatory-logic IP and an engineering team, not as a revenue-ready platform. Do not underwrite a 2026 competitive-deal pipeline.
