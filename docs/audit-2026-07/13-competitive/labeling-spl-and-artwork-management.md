# Labeling, SPL and artwork management

> **Verdict: 🔴 Not competitive**
> Weighted capability score — **us 1.4 / 5** vs **best competitor 4.7 / 5** across 12 dimensions.

**Full category as scoped:** Labeling, SPL and artwork management

## Who buys, and what they are actually buying

Head of Global Regulatory Labeling (or VP Reg Ops) with a dotted line to Packaging/Artwork Ops and Quality/CSV. They buy one outcome: every market's approved label content, its translations, and the printed carton/insert artwork stay provably in sync with the approved core label — with a 21 CFR Part 11 signed approval act and a validation package that survives an FDA/EMA inspection. Budget typically sits in Reg Ops for the labeling-content half and in Packaging/Supply Chain for the artwork half; deals close only when both halves are covered or explicitly OEM'd. Secondary buyer for the SPL slice is the US Reg Ops publishing lead who must transmit SPL R4 through the FDA ESG.

## Market structure

Market size and growth: the pharma labeling-and-artwork management segment was ~$2.1B in 2025 projected to $4.8B by 2034 at ~9.6% CAGR (https://dataintelo.com/report/labeling-artwork-management-for-pharma-market). The top ten vendors hold roughly 58-63% of global revenue, so this is a consolidated, incumbent-defended category, not a green field (https://dataintelo.com/report/labeling-artwork-management-for-pharma-market).

Consolidation is heavy and continuing: Esko acquired Blue Software (2018); Loftware merged with NiceLabel (2021), acquired PRISYM ID (2022) and BL.INK (April 2025), and raised a $50M round in 2025 for cloud expansion; Danaher spun Esko into Veralto (September 2023); Kallik has been PE-owned by FPE Capital since 2022 (https://dataintelo.com/report/labeling-artwork-management-for-pharma-market, https://intuitionlabs.ai/articles/pharma-artwork-management-comparison). For an acquirer this matters twice: it means an exit path exists, and it means the incumbents have capital to close feature gaps fast.

Procurement pattern. Labeling deals are almost never single-vendor. The dominant shape is a content-of-label system (Veeva RIM, ArisGlobal, Freyr LABEL 360) plus a separate artwork/packaging system (Loftware Smartflow, Esko WebCenter, Kallik Veraciti) plus a proofreading point tool (GlobalVision Verify, Schlafender Hase TVT) — with integration between them being a named RFP requirement. Kallik is the notable exception, positioning as one workflow across label text/IFU and packaging graphics (https://www.kallik.com/industries/medical-devices). GlobalVision explicitly ships an Esko WebCenter integration, which tells you how the market actually composes (https://www.globalvision.co/blog/the-verify-x-esko-webcenter-integration-automates-proofreading-for-packaging-artwork).

Deal size. Veeva does not publish list pricing and sells base-application-plus-named-user subscriptions negotiated on multi-year terms; third-party estimates put Vault modules at roughly $50-200 per user per month (~$600-2,400/user/year), with onboarding $10K-50K and professional services commonly 30-60% of first-year license fees. Note a Vault user needing both RIM and QMS consumes two separate named-user licenses (https://intuitionlabs.ai/articles/veeva-vault-pricing-2026-cost-breakdown, https://www.itqlick.com/veeva-vault/pricing). Loftware, Kallik, Esko, ArisGlobal, Karomi and Freyr all publish no list pricing — all quote-only. A global top-20 pharma labeling program typically lands in the high six to low seven figures annually across the content+artwork+proofing stack.

Validation is a gate, not a feature. Regulated buyers require the artwork/labeling system itself to be validated with IQ/OQ/PQ evidence (https://www.esko.com/en/products/webcenter-enterprise/validation). Loftware sells this as a productized Validation Acceleration Pack (https://www.loftware.com/products/labeling/loftware-cloud/compliance). A vendor arriving without validation deliverables does not reach shortlist regardless of capability.

AI in this category shipped in 2025-2026 and is now table stakes rather than differentiation: Esko launched Comply, an AI packaging/label compliance validator, and added AI proofing to WebCenter (April 2026); GlobalVision shipped AI-driven OCR in Verify; Karomi ships AI proofing with image compare, barcode check and color/layer inspection; ArisGlobal's NavaX GenAI engine is live across LifeSphere. Veeva's RIM-specific AI Agents are the laggard, slated August 2026, with Agentic Authoring not expected until late 2027 (https://intuitionlabs.ai/articles/pharma-artwork-management-comparison, https://www.pffc-online.com/news/18022-globalvision-launches-groundbreaking-ocr-feature-a-leap-into-ai-for-pharma-regulatory-and-proofreading-teams, https://www.clinicaltrialvanguard.com/conference-coverage/veeva-unveils-falcon-ai-platform-and-agentic-authoring-at-2026-summit/).

The one structural gap in the incumbent field: nobody enforces linguistic quality as a hard, deterministic gate. Competitors treat translation as a workflow state and proofreading as a probabilistic AI check. That is the only seam this codebase's translation engine could exploit — and it currently has no user interface.

## The five closest competitors

### Kallik — Veraciti (cloud label and artwork management)

The closest single-vendor analogue to what this platform attempts: one workflow spanning label text, IFUs and packaging graphics, with deep medical-device and pharma specialization. Sold as end-to-end LAM to global device manufacturers and pharma. PE-owned (FPE Capital, 2022).

**Strengths**

- Manages label text, IFUs AND graphics/packaging design in a single workflow — the exact seam most competitors leave to integration (https://www.kallik.com/industries/medical-devices)
- Explicit compliance coverage for EU MDR, EU IVDR, FDA UDI, 21 CFR 820, 21 CFR Part 11 and EU GMP Annex 11 (https://www.kallik.com/industries/medical-devices)
- 'Cascade' plugin auto-populates templates and generates multilanguage inserts — directly competes with the translation-coverage workflow, from an artwork-native starting point (https://www.kallik.com/industries/medical-devices)
- Rules and AI check font sizes, barcode validity and legal text inside the approval flow (https://www.kallik.com/industries/medical-devices)
- 20+ years of device labeling references; PE backing means capital to close gaps

**Weaknesses**

- Not an SPL publishing system — no FDA ESG SPL transmission story surfaced in public materials (not verified either way)
- Smaller than Veeva/Loftware; less leverage in enterprise IT standardization decisions
- AI is rules-plus-checks rather than generative authoring; no public agentic authoring capability as of 2026 (not verified)

| | |
|---|---|
| AI shipped today | AI and rules-based checks on font size, barcode validity and legal text within the approval workflow, plus template auto-population and multilanguage insert generation via the Cascade plugin. No public generative/agentic authoring product as of 2026 (https://www.kallik.com/industries/medical-devices). |
| GxP / validation posture | Publicly claims support for FDA 21 CFR Part 11 and EU GMP Annex 11, plus 21 CFR 820, EU MDR/IVDR and FDA UDI (https://www.kallik.com/industries/medical-devices). Specific IQ/OQ/PQ deliverable contents not public — not verified. |
| Pricing signal | not public — quote only |

<details><summary>Sources</summary>

- https://www.kallik.com/industries/medical-devices
- https://www.kallik.com/industries/pharmaceuticals
- https://www.kallik.com/industries/eu-mdr
- https://intuitionlabs.ai/articles/pharma-artwork-management-comparison

</details>

### Veeva Systems — Vault RIM (Registrations, Submissions, Submissions Archive) used as the labeling content backbone

The default incumbent and the vendor most large pharma standardizes on. Positioned as single source of truth for labeling content and changes with end-to-end tracking of label updates; labeling rides on top of the RIM suite rather than being a standalone artwork product.

**Strengths**

- Widely regarded as market leader among large pharma; the safe institutional choice (https://dataintelo.com/report/labeling-artwork-management-for-pharma-market)
- Vault Registrations handles global registrations, health-authority interactions, country-specific data, lifecycle (renewals/variations) and e-label metadata per market — the CCDS/core-to-local spine (https://intuitionlabs.ai/articles/veeva-vault-rim-guide-2)
- Records structured IDMP data (substance codes) and can auto-generate an IDMP submission package — material with EU IDMP deadlines in 2026 (https://intuitionlabs.ai/articles/veeva-vault-rim-guide-2)
- Creates PDF viewable renditions for SPL submissions uploaded as ZIP (https://regulatory.veevavault.help/en/gr/36690/)
- Adjacency: same vendor already owns QualityDocs/PromoMats/Safety at most accounts, so labeling is an expansion sale not a new procurement

**Weaknesses**

- No packaging artwork/prepress system — customers pair Vault with Loftware, Esko or Kallik
- SPL support is rendition-oriented (viewable PDF from an uploaded SPL ZIP), not native SPL authoring/generation (https://regulatory.veevavault.help/en/gr/36690/)
- RIM-specific AI Agents are the last in the rollout order — Clinical/Regulatory/Medical agents slated August 2026, after CRM (Dec 2025) and Safety/Quality (Apr 2026); Agentic Authoring not expected until late 2027 (https://www.clinicaltrialvanguard.com/conference-coverage/veeva-unveils-falcon-ai-platform-and-agentic-authoring-at-2026-summit/)
- Expensive and rigid: separate named-user license per Vault application, no perpetual licensing, services 30-60% of first-year license (https://intuitionlabs.ai/articles/veeva-vault-pricing-2026-cost-breakdown)

| | |
|---|---|
| AI shipped today | Vault AI Agents announced October 2025 on a phased rollout built on Anthropic and Amazon models via Amazon Bedrock; Regulatory/RIM agents slated August 2026 with expected capabilities including auto-tagging, regulatory-intelligence extraction, labeling paragraph analysis, missing-content detection and HAQ response drafting. Agentic Authoring (proactive drafting of submissible documents, native to Vault RIM and Microsoft Word) expected late 2027. As of mid-2026, RIM-specific AI is largely not yet shipped (https://intuitionlabs.ai/articles/veeva-vault-rim-ai-submission-planning-correspondence, https://www.clinicaltrialvanguard.com/conference-coverage/veeva-unveils-falcon-ai-platform-and-agentic-authoring-at-2026-summit/). |
| GxP / validation posture | Vault is sold as a validated GxP cloud platform with vendor-supplied qualification evidence and managed release qualification across three annual releases. Specific per-module IQ/OQ/PQ contents are contract-bound and not public — not verified in detail. |
| Pricing signal | Never published; base-application-plus-named-user subscription, multi-year negotiated. Third-party estimates ~$50-200/user/month (~$600-2,400/user/year), onboarding $10K-50K, services 30-60% of first-year license (https://intuitionlabs.ai/articles/veeva-vault-pricing-2026-cost-breakdown, https://www.itqlick.com/veeva-vault/pricing) |

<details><summary>Sources</summary>

- https://regulatory.veevavault.help/en/gr/36690/
- https://intuitionlabs.ai/articles/veeva-rim-labeling-workflows
- https://intuitionlabs.ai/articles/veeva-vault-rim-guide-2
- https://intuitionlabs.ai/articles/veeva-vault-rim-ai-submission-planning-correspondence
- https://www.clinicaltrialvanguard.com/conference-coverage/veeva-unveils-falcon-ai-platform-and-agentic-authoring-at-2026-summit/
- https://intuitionlabs.ai/articles/veeva-vault-pricing-2026-cost-breakdown
- https://www.itqlick.com/veeva-vault/pricing
- https://dataintelo.com/report/labeling-artwork-management-for-pharma-market

</details>

### Loftware — Smartflow (packaging artwork management) + Loftware Cloud (enterprise labeling/print)

The artwork-workflow leader for regulated industries. Built around approval choreography for complex packaging artwork; replaces spreadsheet-and-email routing with a configurable workflow framework. Pairs with Loftware Cloud for label print/execution — covering the content-to-carton-to-printer span most content systems stop short of.

**Strengths**

- Purpose-built approval choreography for complex packaging artwork in pharma/device/regulated sectors (https://www.loftware.com/resources/blog/2025/how-loftware-smartflow-transformed-a-global-pharmaceutical-companys-artwork-management)
- eSignature on artwork approvals explicitly for 21 CFR Part 11 compliance — the exact approval act this platform cannot sign (https://www.loftware.com/products/artwork-management/smartflow/quality-management-and-control)
- Productized validation: Loftware Cloud Compliance is validation-ready with an optional Validation Acceleration Pack (VAP), turning CSV from a services project into a SKU (https://www.loftware.com/products/labeling/loftware-cloud/compliance)
- 21 CFR Part 11, EU MDR and GHS modules out of the box plus defensible audit trails (https://creativemanager.net/best-label-and-artwork-management-software/)
- Consolidated scale: NiceLabel (2021), PRISYM ID (2022), BL.INK (April 2025), $50M raise in 2025; SAP S/4HANA integration expanded February 2026 (https://dataintelo.com/report/labeling-artwork-management-for-pharma-market)

**Weaknesses**

- Not a regulatory content-of-label system — no CCDS authoring, no USPI/SmPC section model, no SPL generation
- No IDMP/structured-product-data story
- AI capability is thinner than Esko's Comply or GlobalVision's Verify; positioning leads with workflow and print, not intelligence (not verified as absent, but not publicly marketed)
- Breadth from serial acquisition creates integration seams across Smartflow / NiceLabel / PRISYM lineages

| | |
|---|---|
| AI shipped today | No prominent shipping generative-AI labeling capability surfaced in 2026 public materials; the 2026 announcements lead with cloud platform and SAP S/4HANA integration rather than AI. AI posture: not verified as shipped (https://dataintelo.com/report/labeling-artwork-management-for-pharma-market). |
| GxP / validation posture | Strongest productized posture in the set. Loftware Cloud Compliance is sold as validation-ready with an optional Validation Acceleration Pack; Part 11 eSignature on artwork approvals; Part 11 / EU MDR / GHS modules shipped out of the box with audit trails (https://www.loftware.com/products/labeling/loftware-cloud/compliance, https://www.loftware.com/products/artwork-management/smartflow/quality-management-and-control). |
| Pricing signal | not public — quote only. Company-level signal: $50M raise in 2025 for cloud expansion (https://dataintelo.com/report/labeling-artwork-management-for-pharma-market) |

<details><summary>Sources</summary>

- https://www.loftware.com/products/artwork-management/smartflow/quality-management-and-control
- https://www.loftware.com/products/labeling/loftware-cloud/compliance
- https://www.loftware.com/industries/pharmaceutical
- https://www.loftware.com/resources/blog/2025/how-loftware-smartflow-transformed-a-global-pharmaceutical-companys-artwork-management
- https://creativemanager.net/best-label-and-artwork-management-software/
- https://dataintelo.com/report/labeling-artwork-management-for-pharma-market

</details>

### ArisGlobal — LifeSphere Labeling Management (within LifeSphere Regulatory, powered by NavaX)

The AI-native challenger to Veeva on the regulatory-content half. Sells an AI-driven global labeling engine for automated compliant label variants — structured authoring in multiple languages and formats with SPL, IDMP and regional standards compliance and automated variant generation. Directly overlaps the USPI/SmPC structural intelligence this platform has built, but ships it inside a reachable, validated product.

**Strengths**

- Structured authoring of labels in multiple languages and formats with automated variant generation — the core-to-local engine (https://lifesphere.arisglobal.com/platform/regulatory/labeling-management/)
- Explicit SPL and IDMP compliance in the labeling engine, plus a Products Compliance module for IDMP-conformant product-data submission across submission/post-submission/post-approval (https://www.arisglobal.com/lifesphere/regulatory/)
- NavaX GenAI/LLM engine is shipping and at scale — 700,000 cases annually, scaling to 2.5M by mid-2026; customers report >50% regulatory-operations efficiency gains (https://www.arisglobal.com/media/press-release/newest-version-of-lifesphere-regulatory-platform-allows-organizations-to-leverage-latest-genai-technology/)
- Handles unstructured documents and structured data in one platform — the right architecture for the IDMP transition (https://intuitionlabs.ai/articles/evaluating-rim-systems)
- Commercial momentum: ~120% YoY LifeSphere bookings growth reported Q1 2026 (https://www.arisglobal.com/media/press-release/arisglobal-reports-strong-q1-2026-momentum-with-accelerating-enterprise-ai-transformation/)

**Weaknesses**

- No packaging artwork lifecycle — same gap as Veeva; requires an Esko/Loftware/Kallik pairing
- Smaller install base than Veeva in top-20 pharma; more common in mid-cap and as a Veeva alternative
- Vendor-published efficiency claims (>50%, >70% claim-error reduction) are marketing-sourced and not independently verified
- Historical reputation for heavy implementation effort on the Safety side — not verified for the labeling module

| | |
|---|---|
| AI shipped today | Shipping, not roadmap. LifeSphere NavaX is a GenAI/LLM cognitive engine live across the platform supporting content ingestion, generation and insight extraction; the labeling engine is marketed as AI-driven for automated compliant label variant generation. Processing volume disclosed at 700K cases/year scaling to 2.5M by mid-2026 (https://www.arisglobal.com/media/press-release/newest-version-of-lifesphere-regulatory-platform-allows-organizations-to-leverage-latest-genai-technology/, https://lifesphere.arisglobal.com/platform/regulatory/labeling-management/). |
| GxP / validation posture | Sold as a GxP cloud platform for regulated regulatory operations with IDMP-compliant submission handling; specific IQ/OQ/PQ deliverable contents not public — not verified. |
| Pricing signal | not public — quote only. Company signal: ~120% YoY LifeSphere bookings growth in Q1 2026 (https://www.arisglobal.com/media/press-release/arisglobal-reports-strong-q1-2026-momentum-with-accelerating-enterprise-ai-transformation/) |

<details><summary>Sources</summary>

- https://lifesphere.arisglobal.com/platform/regulatory/labeling-management/
- https://www.arisglobal.com/lifesphere/regulatory/
- https://www.arisglobal.com/media/press-release/newest-version-of-lifesphere-regulatory-platform-allows-organizations-to-leverage-latest-genai-technology/
- https://www.arisglobal.com/media/press-release/arisglobal-reports-strong-q1-2026-momentum-with-accelerating-enterprise-ai-transformation/
- https://intuitionlabs.ai/articles/evaluating-rim-systems
- https://itbrief.co.uk/story/arisglobal-launches-lifesphere-regulatory-platform-with-genai-integration

</details>

### Freyr — Freyr LABEL 360 (regulatory labeling platform) + Freyr SPL/SPM (structured product labeling software and publishing services)

The SPL specialist and the realistic alternative for mid-cap sponsors who need SPL transmitted, not architected. Sells software plus a regulatory services arm, so the buyer can outsource the publishing act entirely. This is the vendor that most directly beats the SPL claim in this platform.

**Strengths**

- Dedicated SPL/SPM software for labeling management and submission in SPL/SPM format to US FDA and Health Canada, with automated SPL publishing — the complete submission act, not a skeleton generator (https://www.freyrdigital.com/products/labeling-management/spl-spm, https://www.freyrsplspm.com/structured-product-labeling-spl-software)
- LABEL 360 covers content-to-carton: global and regional labeling, CCDS creation and update, and core-to-local label alignment (https://www.freyrsolutions.com/pharmaceutical-labeling-software)
- Process-integrated tracking module receives and triages proposed variations and tracks implementation upstream and downstream, giving end-to-end traceability from label content to carton — the change-impact spine (https://www.freyrlabel.com/freyr-label360)
- Explicitly bridges labeling information from core label change through artwork, supply chain and printing phases (https://www.freyrlabel.com/freyr-label360)
- Software-plus-services model de-risks adoption for sponsors without in-house SPL publishing skill

**Weaknesses**

- Not a packaging artwork authoring/DAM system — bridges to artwork rather than owning it
- Services-led revenue mix means outcomes depend on Freyr staffing, which some buyers treat as an outsourcing dependency rather than a platform
- Less prominent AI story than ArisGlobal or Esko as of 2026 — not verified as shipping generative labeling AI
- Smaller platform footprint; rarely the enterprise IT standard at top-20 pharma

| | |
|---|---|
| AI shipped today | Freyr markets technology integration into labeling management but no specific shipping generative-AI labeling capability was verified in 2026 public materials — not verified (https://www.freyrsolutions.com/blog/integrating-technology-into-labeling-management-tools-and-solutions). |
| GxP / validation posture | Sells into FDA and Health Canada SPL submission workflows via a regulatory services organization; specific IQ/OQ/PQ validation deliverables for the software not public — not verified. |
| Pricing signal | not public — quote only; software-plus-services engagements |

<details><summary>Sources</summary>

- https://www.freyrdigital.com/products/labeling-management/spl-spm
- https://www.freyrsplspm.com/structured-product-labeling-spl-software
- https://www.freyrsolutions.com/pharmaceutical-labeling-software
- https://www.freyrlabel.com/freyr-label360
- https://www.freyrsolutions.com/press-releases/freyr-unveils-a-pathbreaking-regulatory-labeling-platform-freyr-label-360
- https://www.freyrsolutions.com/blog/integrating-technology-into-labeling-management-tools-and-solutions

</details>

### Esko (Veralto) — WebCenter Enterprise (artwork management, DAM, review/approval, validation) + Comply (AI packaging compliance validator)

The packaging-artwork platform incumbent, spun out of Danaher into Veralto in September 2023. Owns the prepress-adjacent half of the category — DAM, workflow automation, review/image approval, and a formal validation module. Shipped AI proofing in April 2026, making it the AI pace-setter on the artwork side.

**Strengths**

- WebCenter Enterprise is the flagship for workflow, DAM and review at enterprise scale, with distinct modules for project/workflow automation, review/image approval, and validation (https://intuitionlabs.ai/articles/pharma-artwork-management-comparison)
- Comply is a shipping AI validator that checks labels and packaging against customizable rules for missing allergens, incorrect barcodes and FDA formatting violations (https://intuitionlabs.ai/articles/pharma-artwork-management-comparison)
- Expanded WebCenter with AI-powered proofing in April 2026 — real-time text and barcode validation against compliance rules (https://intuitionlabs.ai/articles/pharma-artwork-management-comparison)
- Explicit IQ/OQ/PQ validation product for regulated pharma and device buyers (https://www.esko.com/en/products/webcenter-enterprise/validation)
- Deep prepress/print lineage no software-first vendor can replicate; integrates with GlobalVision Verify for proofreading (https://www.globalvision.co/blog/the-verify-x-esko-webcenter-integration-automates-proofreading-for-packaging-artwork)
- Launched WebCenter Go in 2026 as a lighter tier — signals downmarket expansion (https://www.esko.com/en/company/news/esko-launches-new-webcenter-go-to-help-emerging-brands-streamline-packaging-artwork-and-ensure-compliance)

**Weaknesses**

- No regulatory content-of-label capability — no CCDS, no USPI/SmPC section model, no SPL, no IDMP
- Packaging/CPG heritage means regulatory-affairs buyers rarely own the relationship; the sale sits in packaging ops
- Enterprise WebCenter is heavy to implement and configure; WebCenter Go exists precisely because of that
- Comply is rules-plus-AI over artwork, not label content authoring

| | |
|---|---|
| AI shipped today | Shipping. Comply is a live AI-powered packaging/promotional-material compliance validator using customizable rules to catch missing allergens, wrong barcodes and FDA formatting violations; WebCenter added AI-enabled artwork and packaging management with real-time text and barcode validation in April 2026 (https://intuitionlabs.ai/articles/pharma-artwork-management-comparison). |
| GxP / validation posture | Explicit validation product line. Esko documents that heavily regulated pharma and medical-device buyers require the artwork management system to be validated, and sells IQ/OQ/PQ verification of every aspect of implementation (https://www.esko.com/en/products/webcenter-enterprise/validation). |
| Pricing signal | not public — quote only. WebCenter Go launched 2026 as a lower-cost tier for emerging brands, implying enterprise WebCenter carries a substantial floor (https://www.esko.com/en/company/news/esko-launches-new-webcenter-go-to-help-emerging-brands-streamline-packaging-artwork-and-ensure-compliance) |

<details><summary>Sources</summary>

- https://www.esko.com/en/products/webcenter-enterprise/validation
- https://intuitionlabs.ai/articles/pharma-artwork-management-comparison
- https://www.esko.com/en/company/news/esko-launches-new-webcenter-go-to-help-emerging-brands-streamline-packaging-artwork-and-ensure-compliance
- https://www.globalvision.co/blog/the-verify-x-esko-webcenter-integration-automates-proofreading-for-packaging-artwork
- https://dataintelo.com/report/labeling-artwork-management-for-pharma-market

</details>

### GlobalVision / Schlafender Hase — GlobalVision Verify (AI proofreading and inspection) and Schlafender Hase TVT, the Text Verification Tool

The proofreading/verification point solutions that appear in essentially every labeling RFP as a required capability or a named integration. Not full LAM platforms, but they own the one dimension this platform scores zero on and they are how competitors satisfy the 'prove the carton matches the approved source' requirement.

**Strengths**

- TVT is configured to compare XML documents in the exact formats specified by FDA (Structured Product Labeling) and EMA (Product Information Management) — direct SPL-diffing capability this platform has no analogue for (https://www.schlafenderhase.com/pharma-proofreading-software)
- TVT matches and compares Unicode values character by character across Word, RTF, PDF and TXT, and verifies text, spelling, artwork and barcodes (https://schlafenderhase.com/tvt/)
- TVT is used by 9 of the top 10 global pharma companies and by regulatory agencies — near-universal incumbency (https://schlafenderhase.com/publications/leader-in-intelligent-automated-proofreading-solutions/)
- GlobalVision Verify runs character-for-character text inspection across digital packaging assets and labels with AI-driven OCR shipping today (https://www.globalvision.co/verify, https://www.pffc-online.com/news/18022-globalvision-launches-groundbreaking-ocr-feature-a-leap-into-ai-for-pharma-regulatory-and-proofreading-teams)
- Verify ships a Part 11 audit trail tracking parameter changes and logins, with version history and ALCOA+-aligned traceability (https://www.globalvision.co/blog/10-reasons-top-pharma-companies-automate-proofreading-with-globalvisions-verify-platform)
- Pre-built Esko WebCenter integration — the reference pattern for how proofing plugs into LAM (https://www.globalvision.co/blog/the-verify-x-esko-webcenter-integration-automates-proofreading-for-packaging-artwork)

**Weaknesses**

- Point tools, not platforms — no workflow, no DAM, no CCDS, no SPL generation, no registration tracking
- Cannot win a labeling-platform RFP alone; always a component of a larger stack
- Two vendors competing head-to-head in a narrow niche, which caps pricing power
- Deployment often on-prem/desktop-oriented in the TVT lineage — not verified for current cloud posture

| | |
|---|---|
| AI shipped today | Shipping. GlobalVision Verify uses AI-driven OCR for regulatory documentation inspection, launched as a named AI feature for pharma regulatory and proofreading teams. Schlafender Hase markets TVT as intelligent automated proofreading; the comparison engine is deterministic character-level Unicode matching rather than generative AI (https://www.pffc-online.com/news/18022-globalvision-launches-groundbreaking-ocr-feature-a-leap-into-ai-for-pharma-regulatory-and-proofreading-teams, https://schlafenderhase.com/tvt/). |
| GxP / validation posture | GlobalVision Verify ships a 21 CFR Part 11 audit trail with attributable logging, version history and ALCOA+-aligned traceability for every inspection (https://www.globalvision.co/blog/10-reasons-top-pharma-companies-automate-proofreading-with-globalvisions-verify-platform). TVT is deployed at 9 of the top 10 pharma and at regulatory agencies, implying a mature validation package — specific IQ/OQ/PQ contents not public, not verified. |
| Pricing signal | not public — quote only; typically seat-based and materially cheaper than a full LAM platform |

<details><summary>Sources</summary>

- https://www.globalvision.co/verify
- https://www.globalvision.co/blog/10-reasons-top-pharma-companies-automate-proofreading-with-globalvisions-verify-platform
- https://www.pffc-online.com/news/18022-globalvision-launches-groundbreaking-ocr-feature-a-leap-into-ai-for-pharma-regulatory-and-proofreading-teams
- https://www.globalvision.co/blog/the-verify-x-esko-webcenter-integration-automates-proofreading-for-packaging-artwork
- https://schlafenderhase.com/tvt/
- https://www.schlafenderhase.com/pharma-proofreading-software
- https://schlafenderhase.com/publications/leader-in-intelligent-automated-proofreading-solutions/
- https://www.globalvision.co/blog/globalvision-vs-schlafender-hase

</details>

## Capability rubric

Our score is cited to `file:line` in this repository. Theirs is cited in the competitor sections above. Scored on what **ships and is reachable**, not what is architected — an unreachable or unvalidated capability scores low regardless of code quality.

| Dimension | Weight | Us | Best competitor | Their score | Our evidence |
|---|---|:--:|---|:--:|---|
| Reachable end-to-end labeling workflow (a front door a labeling manager can find and use) | critical | **1** 🔻 | Kallik Veraciti | 5 | client/src/concept2cure/v2/registryModel.ts:116 (RAIL_PRIMARY = exactly 5 destinations: conversation-thread, projects, communication-center, apps, setup); :164 ('labeling' demoted into NAV_HIDDEN); :169 ('labeling-pi' demoted). The 14-file domain shell client/src/concept2cure/labeling/App.tsx:41 exports LabelingApp with zero importers anywhere outside its own directory. Only the v2 device-labeling board at client/src/concept2cure/v2/surfaces/Labeling.tsx:122 is reachable, and only by typing 'label' into the ⌘K palette (client/src/concept2cure/v2/Shell.tsx:982). The repo's own registry rates it shared/constants/ui-surface-registry.ts:678 readiness:'kit-only'. |
| FDA-submittable SPL R4 generation, validation and ESG transmission | critical | **1** 🔻 | Freyr SPL/SPM | 5 | server/services/labeling/spl-generator.ts:163-186 — generateSpl emits <document>/<author>/<structuredBody> with narrative <section> elements ONLY. No <manufacturedProduct>, no <ingredient>, no NDC/package codes, no marketing category, no DEA schedule, no establishment/labeler DUNS, no <subjectOf><approval>. Section text is passed through xmlEscape (:69-76), so SPL's required XHTML subset (<paragraph>, <list>, <table>, <content>) is structurally impossible to emit. server/services/labeling/spl-generation-service.ts:16-22 hardcodes 5 LOINC section codes against the ~50+ real SPL sections. The module's own docstring (spl-generator.ts:9-11) admits it does not run FDA's schematron. No ESG submission path exists. |
| Packaging artwork lifecycle — DAM, versioning, prepress, print-ready release | critical | **0** 🔻 | Loftware Smartflow / Esko WebCenter | 5 | absent — grep for artwork\|proofing\|dieline\|prepress\|Pantone across server/, client/src/ and shared/ returns only unrelated hits (workflow-service names, a Ghostscript PDF quality enum, and two taxonomy strings at shared/constants/domain/vault-taxonomy.ts:73,97 that merely mention the word 'artwork' in a document-type description). Zero implementation. |
| Automated proofreading — character-level text, barcode and artwork verification against approved source | critical | **0** 🔻 | Schlafender Hase TVT / GlobalVision Verify | 5 | absent for artwork/PDF. The nearest capability is verify_docx_against_source driven by required_strings derived from server/services/ana/labeling-authoring.ts:52-100 — a substring-presence check on section headers, not a character-by-character Unicode comparison, and it never sees a rendered carton or barcode. No barcode decode/verify anywhere in the labeling path (the only barcode code is a mock in server/src/routes/stability.router.ts:40-42 for sample labels). |
| CCDS / core-to-local label alignment, change control and downstream impact tracking | critical | **1** 🔻 | Freyr LABEL 360 | 5 | server/api/labeling/routes.ts:225-412 implements label change recording, impact simulation via labeling.calculate_impact_score, and version comparison via labeling.compare_documents — but this router is NEVER MOUNTED. grep for app.use('/api/labeling' across the whole server tree returns nothing; the only importer of any file named labeling/routes is server/api/gcc/index.ts:21, which is itself not mounted in server/bootstrap/register-inline-routes.ts. There is no CCDS object model, no core-vs-local diff, and no market-implementation tracking anywhere. |
| 21 CFR Part 11 e-signed approval act + immutable audit trail on the label record | critical | **1** 🔻 | Loftware Smartflow | 5 | server/routes/mdx-labeling.ts:82-360 — 11 endpoints, zero references to esign, electronic_signature or audit. server/routes/labeling-pi.routes.ts:29 is a single read-only GET with no write path at all. server/routes/labeling-smpc.routes.ts exposes only a section-status POST. The platform DOES have Part 11 infrastructure (server/routes/esignature.ts, server/routes/part11-compliance.ts, server/services/part11/, server/services/part11ComplianceService.ts) — none of it is wired to any labeling route. Scores 1 not 0 only because the infrastructure exists to wire. |
| Validation / CSV deliverables — IQ/OQ/PQ package, traceability matrix, vendor audit support | critical | **0** 🔻 | Loftware Validation Acceleration Pack / Esko WebCenter Validation | 5 | absent — no IQ/OQ/PQ artifacts, no validation protocol, no requirements traceability matrix and no vendor audit pack exist anywhere in the repository. Test coverage for the labeling path totals 57 assertions across 8 files (spl-generation-service 15, labeling-authoring 13, smpc-qrd-catalog 6, labeling-smpc-read 6, spl-generator 5, labeling-structure 5, labeling-pi-read 4, labeling-translations-shape 3) — respectable unit coverage, but unit tests are not a validation package and no regulated buyer will accept them as one. |
| USPI (PLR) and EU SmPC (QRD) structured section model with US↔EU cross-mapping | high | **4** 🔻 | ArisGlobal LifeSphere Labeling | 5 | server/services/ana/labeling-structure.ts:35-95 — full USPI section table with per-section content-routing cues and explicit crossMap to SmPC section numbers (Indications 1↔4.1, Dosage 2↔4.2, Contraindications 4↔4.3, Warnings 5↔4.4, Adverse Reactions 6↔4.8, Interactions 7↔4.5, Populations 8↔4.6, Overdosage 10↔4.9, Clin Pharm 12↔5.1, Nonclinical Tox 13↔5.3). server/services/ana/labeling-authoring.ts:52-100 encodes the 21 CFR 201.57(c) mandatory PLR headers as a verbatim section guard. server/services/labeling/labeling-intelligence-knowledge.ts (2,418 lines) carries Highlights/FPI descriptors, SPL LOINC codes, boxed-warning categories, REMS models and ETASU elements, safety-labeling-change steps, PLLR former-pregnancy-category mappings, SmPC section structure, FDA-vs-EMA differences and OTC Drug Facts. server/services/labeling/smpc-qrd-catalog.ts adds QRD readiness rollup. This is the genuine asset. Docked one point because it is advisory knowledge with no authoring persistence and is reachable only through chat. |
| Regulated multilingual label translation with enforced linguistic QA and back-translation | high | **3** 🔻 | Kallik Veraciti (Cascade multilanguage inserts) | 4 | server/services/translation/hybrid-workflow.ts:28-44 — a pure state machine that makes it structurally impossible for a machine-translated segment to reach 'approved': requires method ∈ {human, mt_postedited}, an existing back-translation verified above threshold, and a NAMED human reviewer of record distinct from the post-editor. 11 QA checks across server/services/translation/qa/ (numeric: number/unit consistency, length sanity; structural: DNT preservation, placeholder/markup, untranslated, control characters; semantic: glossary adherence, back-translation divergence at a 0.5 overlap threshold). Seven terminology domains (oncology, clinical-safety-pv, cmc-quality-analytical, regulatory-ctd, biostatistics-design, pharmacology-pk-adme, immuno-inflammation-vaccines) plus translation memory. Nine REST endpoints live at server/routes/translation.routes.ts:596-1072, mounted at server/bootstrap/register-inline-routes.ts:402-403. Scored 3 not 5 because client/src/concept2cure/translation/ (Projects, SegmentWorkspace, GlossaryPanel, QaFindingsPanel) has ZERO importers — the engine has no user interface. Backend alone would score 5. |
| Shipping AI a labeling team can actually invoke in-product | high | **2** 🔻 | Esko Comply / GlobalVision Verify / ArisGlobal NavaX | 4 | server/services/ana/AnaToolDefinitions.ts:2150 registers LABELING_INTELLIGENCE_TOOLS — six tools from server/services/ana/labelingIntelligenceTools.ts (assess_plr_structure:38, assess_boxed_warning:91, design_rems:151, assess_pregnancy_lactation_labeling:216, structure_smpc:279, assess_otc_labeling:327) — plus generate_spl_xml and validate_spl_structure (server/services/ana/AnaToolExecutor.ts:15864,15871), build_from_template (:6210) and review_label_currency (:12339). Genuinely wired server-side. But the UI that renders these — LabelingAuthoringPane and LabelCurrencyPanel — lives only in client/src/concept2cure/components/ana/Ana.tsx:1135, and Ana is exported from client/src/concept2cure/components/ana/index.ts:1 with no importer anywhere in the tree. The shipped chat surface (client/src/concept2cure/v2/surfaces/ConversationThread.tsx, 378 lines) contains zero labeling references. AI exists; the labeling-specific rendering of it does not ship. |
| Deterministic, rule-cited compliance gates (verdicts a labeling team can defend, not model output) | high | **4** 🔺 | Esko Comply | 3 | server/services/ana/labeling-authoring.ts:1-20 — the currency gate (evaluateLabelCurrency / review_label_currency) is explicitly documented and implemented as NEVER an AI guess; server/services/ana/AnaToolExecutor.ts:2359 hard-codes the orchestration note 'Currency verdict is deterministic — never inferred.' client/src/concept2cure/components/ana/LabelCurrencyPanel.tsx:1-13 renders findings verbatim with their regulatory basis. server/services/labeling/spl-generator.ts:86-131 returns typed error/warning issues with JSON paths rather than prose. server/services/translation/hybrid-workflow.ts:38-44 rejects illegal transitions with a typed WorkflowTransitionError. This is the one dimension where the design is genuinely better than the field: competitors' AI checks (Esko Comply, GlobalVision OCR) are probabilistic and their gates are workflow-state, not rule-cited. Docked one point solely because the verdicts are unreachable in the shipped UI. |
| Device labeling specifics — UDI/GUDID, ISO 15223-1 symbol governance, IFU translation coverage | medium | **3** 🔻 | Kallik Veraciti | 5 | server/routes/mdx-labeling.ts:303-360 — live symbol CRUD (labeling_symbols) and a translation-coverage endpoint, backed by migrations/20260511_qms_and_labeling.sql:163. server/services/ivd-knowledge/regulatory/labeling-rules.ts:51-54 encodes UDI DI/PI structure, plain-text plus AIDC placement, and GUDID submission obligations under 21 CFR 830 / 801 subpart B with GS1/HIBCC/ICCBBA issuing agencies. server/services/market-specs/device-labeling.ts adds market specs. Real and working — but there is no GUDID submission path, no symbol image library, and no EU MDR Annex I labeling checklist enforcement, and the surface that renders it is ⌘K-only. |

## Where we stand

**Where we win**

- Deterministic, citable compliance gating. The label-currency verdict is a rule-derived finding set with regulatory basis attached, not model output (server/services/ana/labeling-authoring.ts:1-20; AnaToolExecutor.ts:2359 'Currency verdict is deterministic — never inferred'). Every competitor's AI check in this category is probabilistic. In a Part 11 world a defensible verdict beats a confident one, and no incumbent has architected for that distinction.
- Regulated translation guardrails as a state machine rather than a policy document. server/services/translation/hybrid-workflow.ts:28-44 makes it structurally impossible for machine translation to reach 'approved' — it requires an approvable method, a back-translation verified above threshold, and a named human reviewer of record who is distinct from the post-editor. Kallik generates multilanguage inserts; Freyr tracks translations; none of them enforce translator provenance as a type-level invariant. This is genuinely novel work.
- Depth of USPI/SmPC structural intelligence per dollar of engineering. 2,418 lines of labeling knowledge (server/services/labeling/labeling-intelligence-knowledge.ts) covering PLR Highlights/FPI descriptors, SPL LOINC codes, boxed-warning categories, REMS models and ETASU elements, PLLR former-category mappings, SmPC structure, FDA-vs-EMA differences and OTC Drug Facts — plus a bidirectional USPI↔SmPC section cross-map (labeling-structure.ts:35-95). Competitors sell this as consulting; here it is executable and unit-tested.
- Linguistic QA breadth. 11 automated checks spanning numeric consistency, unit consistency, length sanity, DNT preservation, placeholder/markup integrity, untranslated detection, control characters, glossary adherence and back-translation divergence, across seven regulatory terminology domains. No competitor in this set ships comparable content-level translation QA — they treat translation as a workflow state.

**Where we reach parity**

- Device labeling data model. Live symbol CRUD, translation records with method and back-translation-verified flags, and coverage rollup (server/routes/mdx-labeling.ts:303-360) are functionally comparable to what a mid-tier LAM tool exposes — reachable, org-scoped, with real writes. Kallik is deeper; most others are not.
- SPL structural validation as a linting function. server/services/labeling/spl-generator.ts:86-131 returns typed errors and warnings with JSON paths for LOINC format, set-id GUID, integer version, organization and per-section code/title/text. That is a real, honest validator — it is simply validating a document that is not yet submittable.
- UDI/GUDID regulatory knowledge. server/services/ivd-knowledge/regulatory/labeling-rules.ts:51-54 correctly encodes DI/PI structure, plain-text plus AIDC placement and issuing-agency requirements. Knowledge parity with the field; execution (actual GUDID submission) is absent.

**Where we lose**

- Artwork management — score 0 against a category whose name contains the word. Zero implementation. Loftware, Esko and Kallik each have 15-25 years of prepress, DAM and print-release engineering here. This is not closable by building.
- Automated proofreading — score 0. Schlafender Hase TVT compares Unicode character-by-character and is deployed at 9 of the top 10 global pharma; it even diffs FDA SPL and EMA PIM XML natively. The nearest thing here is a substring-presence check on section headers.
- FDA-submittable SPL — score 1. The generator produces a narrative-only skeleton with no product data elements and XML-escaped section text, which forecloses SPL's XHTML subset entirely. Freyr transmits SPL to FDA and Health Canada as a product. This artifact would not clear schematron.
- Part 11 e-signed approval act — score 1. No labeling route touches e-signature or audit. Loftware sells eSignature on artwork approvals specifically for Part 11. Without a signed approval act there is no GxP labeling deal at any price.
- Validation/CSV deliverables — score 0. Loftware productizes this as a Validation Acceleration Pack; Esko sells IQ/OQ/PQ verification. Nothing here. This alone disqualifies from shortlist at every regulated buyer.
- CCDS and core-to-local change propagation — score 1. The impact-simulation and change-tracking code exists (server/api/labeling/routes.ts:225-412) and is never mounted. There is no CCDS object model at all.
- Reachability — score 1, and it multiplies everything else. RAIL_PRIMARY has five destinations and labeling is not among them (registryModel.ts:116, :164). The 14-file labeling shell, the entire translation workspace UI, and the Ana pane that renders the labeling authoring and currency gates all have zero importers. A buyer's technical evaluator will find this in an afternoon, and it converts every 'we built that' claim into a demo risk.

## Is the advantage durable?

There is exactly one durable advantage and it is narrower than it looks. The regulated-translation guardrail design — machine translation structurally barred from 'approved', back-translation verified above threshold, named human reviewer of record distinct from the post-editor, enforced as a pure state machine rather than a workflow configuration (server/services/translation/hybrid-workflow.ts:28-44) — is a real architectural insight that no competitor in this set has made. Kallik generates multilanguage inserts, Freyr tracks translation status, Veeva stores translated documents; none of them enforce translator provenance as a type-level invariant that cannot be configured away. Combined with 11 content-level QA checks and seven regulatory terminology domains, that is roughly 12-18 months of lead on the linguistic-QA dimension specifically, and it is defensible because it requires a regulatory insight, not just engineering. Nothing else here is durable. The USPI/SmPC structural knowledge is impressive engineering but it encodes public regulation — 21 CFR 201.56/201.57 and the EMA QRD template are freely available, and any competent team plus a current LLM can reproduce the section model and cross-map in 4-8 weeks. ArisGlobal already ships it. The deterministic-gate philosophy is a design choice an incumbent can adopt in one release cycle once a customer asks for it. The SPL generator is a weekend of work behind Freyr, not a moat. And the clock is running fast: Veeva's RIM AI Agents land August 2026 with labeling paragraph analysis and missing-content detection explicitly in scope; Esko shipped Comply and AI proofing into WebCenter in April 2026; GlobalVision shipped AI OCR; ArisGlobal's NavaX is processing 700K cases a year scaling to 2.5M by mid-2026. Every incumbent is closing the intelligence gap in this exact category right now, and they are closing it from a position that already has artwork, Part 11 signatures and a validation package. The decisive point for a buyer: a moat behind a door nobody can open is worth zero at closing. The translation engine's 12-18 month lead only starts counting from the day it has a user interface — and today it has none (client/src/concept2cure/translation/ has zero importers). If that UI ships within one quarter, the lead is real and monetizable as a layer product. If it does not, the lead expires unexercised, because the incumbents will have shipped adequate translation QA into products that already win every other row on the RFP. Value the asset accordingly: this is a component acquisition priced on the translation engine and the labeling knowledge base, not a platform acquisition priced on category position.

## Shortest credible path to parity

1. Week 1 — open the front door. Remove 'labeling' from NAV_HIDDEN (client/src/concept2cure/v2/registryModel.ts:164) and either add it to RAIL_PRIMARY (:116) or expose a surface launcher, since the current Apps surface is a module-subscription toggle catalog (client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx:1104-1120), not a launcher. Add registry entries for 'labeling-pi' and 'labeling-smpc' in shared/constants/ui-surface-registry.ts — they exist in surfaceViews (101 entries) but not in UI_SURFACES (49 entries), so they are invisible to ⌘K and reachable only by hand-typed URL. Cost: ~2 days. This does not add capability; it stops the demo from failing.
2. Week 1-2 — mount the code that already exists. Add app.use('/api/labeling', authMiddleware, ...) for server/api/labeling/routes.ts in server/bootstrap/register-inline-routes.ts, verify the labeling.* schema installs (db/migrations/070_gcc_rls_extended_ga.sql:175 already carries RLS policies for labeling.spl_documents), and confirm the labeling.calculate_impact_score and labeling.compare_documents functions exist. This recovers change tracking, impact scoring and version diff for roughly two days of work — the single cheapest capability gain available.
3. Month 1-2 — ship the translation workspace. Register client/src/concept2cure/translation/ surfaces (Projects, SegmentWorkspace, GlossaryPanel, QaFindingsPanel) into surfaceViews.ts and UI_SURFACES, bound to the nine already-mounted endpoints at /api/translation. This is the highest-ROI move in the entire category: the backend is genuinely differentiated, no competitor has an equivalent, and the UI is already written. Estimated 3-6 weeks including QA-finding rendering and reviewer-assignment flows.
4. Month 2-3 — wire Part 11 into every labeling state transition. Connect server/routes/esignature.ts and server/services/part11/ to every status change in server/routes/mdx-labeling.ts, server/routes/labeling-smpc.routes.ts and the newly-mounted /api/labeling change endpoints, and add a write path to labeling-pi (currently GET-only, server/routes/labeling-pi.routes.ts:29). The infrastructure exists; this is integration, not invention. Non-negotiable — no regulated labeling deal closes without a signed approval act.
5. Month 3-6 — produce the validation package. IQ/OQ/PQ protocols, requirements traceability matrix, and a vendor audit pack for the labeling and translation modules. This is documentation-and-process work, not engineering, and it can run in parallel with the above. Until it exists the product cannot be shortlisted, regardless of capability.
6. Month 4-9 — complete SPL or stop claiming it. Real parity requires <manufacturedProduct> with ingredient/strength/NDC package codes, marketing category and application number, DEA schedule, labeler and establishment registration with DUNS, <subjectOf><approval>, the full LOINC section set rather than the 5 hardcoded in spl-generation-service.ts:16-22, XHTML-subset section content (which means removing the blanket xmlEscape at spl-generator.ts:69-76 and building a proper content model), and a schematron pass plus ESG transmission. Estimate 4-6 engineer-months minimum. The alternative — and the better commercial answer — is to OEM SPL publishing from Freyr or Reed Tech and integrate, which converts a 6-month build into a 6-week integration.
7. Do not build artwork. Partner or OEM. Esko WebCenter and GlobalVision Verify both expose integration surfaces and already integrate with each other (https://www.globalvision.co/blog/the-verify-x-esko-webcenter-integration-automates-proofreading-for-packaging-artwork). Building DAM, prepress, proofing and print-ready release from zero is a 2-3 year program at 20+ engineers against incumbents with two decades of head start. An API partnership closes the RFP row in one quarter; a build never catches up.
8. Reposition while the above lands. The honest, winnable pitch today is not 'labeling platform' — it is 'labeling intelligence and regulated translation QA layer that sits on top of your Veeva/Loftware/Kallik stack.' That framing turns the artwork and SPL gaps from disqualifiers into scope boundaries, and it is the framing under which the translation engine and the PLR/QRD knowledge base are genuinely best-in-class.

## Verdict

**🔴 Not competitive** — This category has six must-have rows on every RFP: (1) a reachable end-to-end labeling workflow, (2) FDA-submittable SPL, (3) packaging artwork lifecycle, (4) automated proofreading against source, (5) Part 11 e-signed approval with audit trail, (6) an IQ/OQ/PQ validation package. As of HEAD the platform scores 0-1 on five of the six. Artwork management — literally half the category name — has zero code: grep for artwork/proofing/dieline/prepress/Pantone across server/, client/src/ and shared/ returns nothing labeling-related. There is no IQ/OQ/PQ package, no traceability matrix, no vendor audit pack anywhere in the repo. No labeling route touches the e-signature or Part 11 services that DO exist elsewhere (server/routes/esignature.ts, server/services/part11/) — server/routes/labeling-pi.routes.ts is a single read-only GET. The SPL generator emits narrative sections wrapped in a bare HL7 v3 envelope with no <manufacturedProduct>, no ingredient/NDC/marketing-category/establishment data elements, and XML-escapes section text so SPL's required XHTML subset (<paragraph>, <list>, <table>) is structurally impossible; the higher-level service hardcodes 5 LOINC section codes. That artifact will not clear FDA schematron, let alone the ESG. And the reachability finding holds and is decisive: RAIL_PRIMARY (client/src/concept2cure/v2/registryModel.ts:116) has exactly five destinations — Chats, Projects, Communication Center, Apps, Settings — and 'labeling' and 'labeling-pi' are both explicitly demoted into NAV_HIDDEN (lines 164, 169). The 14-file labeling domain shell at client/src/concept2cure/labeling/ has no importer anywhere in the tree. The entire translation workspace UI at client/src/concept2cure/translation/ has no importer. The Ana chat component that renders LabelingAuthoringPane and LabelCurrencyPanel is exported from components/ana/index.ts:1 and imported by nobody. Two genuine assets survive that scrutiny — the USPI/SmPC structural intelligence (a 2,418-line knowledge base plus deterministic PLR/QRD section guards and US-EU cross-mapping) and a genuinely best-in-class regulated translation engine whose state machine makes it structurally impossible for machine translation to reach 'approved' without a verified back-translation and a named human reviewer distinct from the post-editor. Neither is a product. One is reachable only by typing into a command palette; the other is reachable not at all. In a head-to-head against Kallik, Veeva, Loftware, ArisGlobal, Freyr or Esko, this loses every must-have row. It is an acqui-tech component — specifically a labeling-intelligence and translation-QA engine worth bolting onto a platform that already owns the workflow — not a competitor in this category.
