# Regulatory intelligence & global market planning (life scie…

> **Verdict: 🟠 Niche-viable**
> Weighted capability score — **us 2.1 / 5** vs **best competitor 4.6 / 5** across 12 dimensions.

**Full category as scoped:** Regulatory intelligence & global market planning (life sciences) — continuous monitoring of global regulatory requirements/changes, cross-market pathway & registration planning, and portfolio impact assessment

## Who buys, and what they are actually buying

Head of Regulatory Affairs / VP Regulatory Strategy (with RA Operations and Regulatory Intelligence leads as evaluators), typically budgeting $50K–$450K/yr. They are buying two distinct outcomes that are usually bundled: (1) "tell me what changed, where, and which of MY products it hits, before it hurts me" — the horizon-scan/impact job; and (2) "tell me the requirements, timelines, fees and sequencing for entering market X" — the market-planning job. Secondary economic buyer at large pharma is the RIM platform owner (Veeva/ArisGlobal admin), because RI is increasingly bought as an add-on to the RIM system of record rather than as a standalone subscription. In medtech the buyer skews to a single Director of RA who owns both RI and RIM and wants one tool.

## Market structure

STRUCTURE. The category has bifurcated into two business models that are converging on each other from opposite directions. (1) Analyst-curated content subscriptions — Cortellis (310,000+ documents, 80+ agencies) and Citeline RegIntel (140+ countries) — which know the rules but not your products. (2) RIM-native execution platforms — Veeva Vault RIM (1,000+ companies), Rimsys (6 of top 12 medtech), RegDesk (120+ markets) — which know your products and are now bolting intelligence on. The content vendors are adding AI assistants; the RIM vendors are adding intelligence feeds. Both are closing on the middle, which is where a pure deterministic-reasoning layer like ours has to live.

CONSOLIDATION. Norstella + Citeline merged into a ~$5B, 1,600+ employee intelligence conglomerate (Evaluate, MMIT, Panalgo, The Dedham Group, Citeline). ArisGlobal absorbed Amplexor Life Sciences in 2023, adding regulatory content management and translation. The independent RI point solution is being squeezed from both ends. Underlying RIM software market is projected at $2.7B in 2026 growing to $7.6B by 2036 (https://intuitionlabs.ai/articles/veeva-vault-pricing-2026-cost-breakdown).

THE 2025-26 AI WAVE IS REAL AND MOSTLY ALREADY SHIPPED. Clarivate's Cortellis Regulatory AI Assistant went GA to all Cortellis RI customers on 4 December 2025 with cited natural-language answers, multilingual support, document summarization, and automated draft-vs-final guidance comparison. Rimsys shipped AI-powered regulatory monitoring with product-specific triage on 5 May 2026. Freyr runs 2,300+ crawler bots with NLP/ML. The window in which "we have AI and they don't" was a wedge closed roughly 8 months ago. The remaining AI differentiation is not capability, it is defensibility of the answer.

THE NOTABLE EXCEPTION — AND THE ONLY REAL TIMING WINDOW. Veeva's Clinical/Regulatory/Medical AI Agents are slated for August 2026 and Falcon for late-2026 early adopters, so as of 2026-07-28 the largest incumbent does not yet ship a regulatory AI agent (https://intuitionlabs.ai/articles/veeva-ai-roadmap-crm-bot-agents-2026). ArisGlobal's Intelligence/Distribution/Signals NavaX agents are stated available Q4 2026, i.e. also future (https://www.arisglobal.com/media/press-release/arisglobal-expands-navax-agents-suite-with-three-new-ai-agents-to-orchestrate-intelligence-across-life-sciences-operations/). That is a 1–5 month window against the two biggest platform vendors, and it is the entire timing case for this asset.

PROCUREMENT PATTERN AND DEAL SIZE. Nobody publishes list pricing; every vendor in the set routes to a demo. The three usable anchors: Forrester's TEI composite for RegDesk models $450,000/yr in annual software cost; third-party estimates put Veeva Vault RIM at ~$15K–$45K/yr for 1–3 RA users and ~$45K–$120K/yr at 3–8 users; standard Vault fees are estimated at roughly $50–$200 per user per month. Practical read: standalone RI subscriptions clear $75K–$250K/yr at mid-cap, and integrated RI+RIM enterprise deals reach $450K+/yr. Deals are won on a scripted bake-off — "here are three real guidance changes from last quarter, show me what your system told my team and which of my 40 registrations it flagged." A platform with an empty change table fails that demo in the first minute regardless of backend quality.

VALIDATION IS A SPLIT MARKET. Pure RI content subscriptions (Cortellis, Citeline, Freyr GRI) are generally NOT sold as validated systems and I could verify no CSV package for any of them; buyers treat them as reference sources cited into validated systems. But the moment the tool writes into a regulated decision record, Part 11 applies — and Veeva is the only vendor with a verified posture (single-tenant, built-in validation support, immutable audit trails, configurable e-signature capturing name/time/meaning, inherited validation lifecycle). Our product architecturally sits on the writing side of that line while carrying none of the controls, which is the worst of both positions.

## The five closest competitors

### Clarivate — Cortellis Regulatory Intelligence — Cortellis Regulatory Intelligence (+ Cortellis CMC Regulatory Intelligence; Cortellis Regulatory AI Assistant)

The 30-year incumbent analyst-curated regulatory content database. Sells as the authoritative reference layer for global RA teams — 'one source for global regulatory requirements, guidance, and agency decisions.'

**Strengths**

- Largest verified curated corpus in the category: 310,000+ regulatory documents (some sources cite 285k+ documents plus 7k+ analyst reports including past approvals)
- Coverage of FDA, EMA, PMDA plus 80+ global agencies / 80+ global markets (some sources say 81+ countries)
- Full-time human analyst operation behind the content — this is the moat, not the software
- Agentic AI assistant is GA and citation-backed as of Dec 2025, so the 'AI-native challenger' angle against them is already partly closed
- Adjacent Cortellis CMC Regulatory Intelligence extends into post-approval change intelligence
- Cortellis Labs offers a programmatic regulatory API for embedding

**Weaknesses**

- Content/reference product, not a workflow product — it tells you what the rule is, it does not compute your answer or execute your submission
- Weak portfolio-impact automation compared to RIM-native players: it does not natively know your product registrations, so 'which of my products does this hit' requires integration work
- Enterprise-only pricing and procurement; effectively inaccessible to sub-100-person biotech
- No validated-system posture, so outputs still need human transcription into a Part 11 record

| | |
|---|---|
| AI shipped today | Ships today (not roadmap): the Cortellis Regulatory Intelligence AI Assistant, announced GA to all Cortellis RI customers on 4 December 2025, built on Clarivate's agentic AI platform. Shipping capabilities per the launch release: natural-language regulatory Q&A with citations and conversational context carry-over, multilingual query/response, document summarization at configurable depth, and automated draft-vs-final guidance document comparison. An earlier AI-powered Regulatory Assistant was launched within the Cortellis suite in August 2025. Note: the assistant answers over Clarivate's curated corpus; Clarivate does not publish a determinism/provenance taxonomy for its outputs (not verified either way). |
| GxP / validation posture | Not verified. Cortellis is an intelligence subscription, not a GxP system of record; Clarivate publishes no CSV/validation package or 21 CFR Part 11 audit-trail claim for Cortellis RI that I could verify. Buyers typically treat it as a reference source cited into validated systems rather than as validated software itself. |
| Pricing signal | Not public. Enterprise subscription, custom quote via sales; pricing varies by modules, data scope, seat count, and term. No list price published by Clarivate. |

<details><summary>Sources</summary>

- https://clarivate.com/news/clarivate-presents-cortellis-regulatory-ai-assistant/
- https://www.prnewswire.com/news-releases/clarivate-presents-cortellis-regulatory-ai-assistant-to-cut-through-complexity-in-safety-and-compliance-302632442.html
- https://ir.clarivate.com/news-events/press-releases/news-details/2025/Clarivate-Presents-Cortellis-Regulatory-AI-Assistant-to-Cut-Through-Complexity-in-Safety-and-Compliance/default.aspx
- https://clarivate.com/life-sciences-healthcare/research-development/regulatory-compliance-intelligence/regulatory-intelligence-solutions/
- https://intuitionlabs.ai/software/regulatory-affairs-compliance/regulatory-intelligence/clarivate-cortellis-regulatory-intelligence
- https://intuitionlabs.ai/articles/clarivate-cortellis-guide
- https://cortellislabs.com/api/regulatory/
- https://clarivate.com/life-sciences-healthcare/research-development/regulatory-compliance-intelligence/chemistry-manufacturing-controls/

</details>

### Citeline (Norstella) — RegIntel — Citeline RegIntel (regulatory intelligence), within the Citeline / Norstella intelligence suite

Broadest-geography curated regulatory intelligence, sold on editorial quality. Positioned as the analyst-grade alternative to purely automated crawlers, with dossier benchmarking and approval-timeline benchmarking as the differentiators.

**Strengths**

- Widest verified country coverage among the analyst-curated incumbents: 140+ countries
- Tracks FDA, EMA, PMDA and NMPA change streams — NMPA/China coverage is a real gap-filler most competitors underweight
- Dossier benchmarking and approval-timeline benchmarking — directly serves the 'how long and what will they ask' planning question
- Human-analyst editorial layer is the highest-trust content signal in the category
- Backed by Norstella's $5B platform, so bundling with Evaluate/MMIT/Panalgo data is available in one procurement

**Weaknesses**

- Same structural limit as Cortellis: reference content, not computed answers or workflow execution
- No verified shipping agentic assistant, which is now a checkbox after Clarivate's Dec 2025 GA
- No verified validated-system posture
- Bundled-suite procurement can inflate deal size well past a standalone RI budget

| | |
|---|---|
| AI shipped today | Hybrid human-analyst + AI curation pipeline is the stated model — Citeline's intelligence is produced by a combination of human analysts and AI, which the market reads as higher editorial quality than fully automated monitoring. I could NOT verify a shipped, named end-user agentic AI assistant for RegIntel specifically as of July 2026 — treat 'Citeline has a shipping RI copilot' as not verified. |
| GxP / validation posture | Not verified. No published CSV/Part 11/GxP validation package for RegIntel found. |
| Pricing signal | Not public. Enterprise subscription via sales. Corporate scale signal only: the Citeline/Norstella merger created a ~$5B company with 1,600+ employees across five brands. |

<details><summary>Sources</summary>

- https://www.citeline.com/en/about-us
- https://www.norstella.com/press-releases/citeline-and-norstella-complete-merger-to-form-a-5-billion-global-pharmaceutical-technology-company/
- https://www.norstella.com/citeline/
- https://prodeen.com/best-regulatory-intelligence-tools
- https://gitnux.org/best/regulatory-intelligence-software/
- https://www.citeline.com/en/products-services/regulatory-and-compliance/trialscope-intelligence

</details>

### RegDesk — RegDesk — AI-enabled RIMS with embedded regulatory intelligence, submission execution and lifecycle management

The AI-native challenger that fuses regulatory intelligence WITH submission execution in one platform for device, IVD and pharma. Positioning is explicitly 'don't just read the requirement — build the application from it.'

**Strengths**

- 120+ markets of continuously updated intelligence — 20x our verified jurisdictional breadth
- Closes the loop from intelligence to submission in one product, which is exactly the 'so what do I do about it' gap that reference-only vendors leave open
- Genuine AI-native product, not an assistant bolted onto a content database
- Serves device, IVD and pharma from one platform — matches the same multi-modality span we attempt
- A published Forrester TEI study is unusually strong procurement ammunition in this category

**Weaknesses**

- Content depth per market is not independently verified and is likely shallower than Cortellis/Citeline analyst curation at the document level
- Pricing opacity plus a $450K composite anchor makes it a hard sell below mid-cap
- Smaller vendor than the incumbents — enterprise procurement will probe viability and support depth
- No verified validation package for regulated-record use

| | |
|---|---|
| AI shipped today | Ships today: continuously updated regulatory intelligence across 120+ markets (country-specific requirements, standards, guidance documents, regulatory changes) plus an AI-powered application builder that generates global applications and auto-populates country forms, with reuse of prior approvals across markets. Vendor claims ~10x faster application preparation. The vendor claim magnitude is marketing; the existence of the shipping AI application builder is documented. |
| GxP / validation posture | Not verified. No published CSV/validation package or explicit 21 CFR Part 11 claim confirmed from the sources I could reach. |
| Pricing signal | Per-user subscription; no list price published. Strongest public deal-size anchor in the category: the Forrester Total Economic Impact study of RegDesk models a composite organization at $450,000/yr in annual software cost. Treat that as an upper-mid enterprise anchor, not a median. |

<details><summary>Sources</summary>

- https://www.regdesk.co/regulatory-intelligence-software/
- https://tei.forrester.com/go/Regdesk/RegdeskTEI/index.html
- https://www.getapp.com/finance-accounting-software/a/regdesk/
- https://www.capterra.com/p/267906/RegDesk/
- https://www.g2.com/products/regdesk/reviews
- https://www.softwareadvice.com/requirements-management/regdesk-profile/
- https://pricingnow.com/question/regdesk-pricing/

</details>

### Rimsys — Rimsys RIM platform + Rimsys Intelligence — 'Regulatory Execution Engine for MedTech' (Spring 2026 release)

Medtech-native RIM whose explicit pitch is that intelligence is worthless unless it executes: 'the platform is designed not to hold regulatory data, but to execute on it.' Directly attacks the reference-database incumbents.

**Strengths**

- Only competitor verified to ship AI change-triage prioritized against the customer's own product/market registrations — the exact 'change → my portfolio' loop
- 90+ countries of monitored regulations, guidance, safety alerts and legislation
- Regulatory change monitoring lives inside the RIM record, so impact assessment is automatic rather than an integration project
- 6 of the top 12 global medtech manufacturers as customers — very strong reference base for a company this size
- May 2026 launch means the capability is current, not legacy

**Weaknesses**

- Medtech/IVD only — no pharma NDA/BLA/eCTD depth, so it does not compete for a biopharma RI budget
- Small vendor ($21M total disclosed funding) versus Veeva/Clarivate in enterprise procurement
- Intelligence breadth (90+ countries) trails Citeline (140+), Freyr (200+) and RegDesk (120+)
- AI monitoring is new as of May 2026; maturity and false-positive rates are unproven in the market

| | |
|---|---|
| AI shipped today | Ships today, and is the single most directly threatening competitor on the capability we lack. Launched 5 May 2026: the Regulatory Execution Engine embeds submission authoring, AI-powered regulatory monitoring, and configurable impact workflows in one RIM platform. Rimsys Intelligence covers regulations, guidance documents, safety alerts and legislation across 90+ countries, with AI triage and prioritization that surfaces updates most relevant to each customer's specific products and markets. That last clause is the portfolio-impact capability our c2c_reg_changes table was designed for and never received a writer for. |
| GxP / validation posture | Not verified. Rimsys is sold as medtech RIM where ISO 13485 / QMS alignment is table stakes, but I could not verify a published CSV package or Part 11 claim from the sources reachable. |
| Pricing signal | Not public. Funding signal only: $16M Series A led by Bessemer Venture Partners (Dec 2021), plus a later $5M growth financing round. Customer signal: trusted by 6 of the top 12 global medtech manufacturers. |

<details><summary>Sources</summary>

- https://www.morningstar.com/news/business-wire/20260505903088/rimsys-launches-the-regulatory-execution-engine-for-medtech
- https://secure.businesswire.com/news/home/20260505903088/en/Rimsys-Launches-the-Regulatory-Execution-Engine-for-MedTech
- https://finance.yahoo.com/sectors/healthcare/articles/rimsys-launches-regulatory-execution-engine-070000114.html
- https://www.businesswire.com/news/home/20211202005095/en/Rimsys-Closes-%2416-Million-Series-A-Financing-Led-by-Bessemer-Venture-Partners
- https://www.rimsys.io/blogs/rimsys-secures-5-million-in-growth-financing-round
- https://www.rimsys.io/blogs/rimsys-becomes-the-trusted-regulatory-partner-for-6-of-the-top-12-global-medtech-manufacturers

</details>

### Freyr — Freyr GRI / freya.intelligence (Freyr IMPACT) — Freyr Global Regulatory Intelligence (GRI) — 'AI-first regulatory cloud' intelligence repository + services

Widest-coverage, crawler-driven intelligence repository backed by a global RA services organization. Sells breadth and the ability to fall back on Freyr's human RA consultants when the data runs out — the 'tech plus services' play.

**Strengths**

- Broadest claimed market coverage in the category: 200+ global markets; 100,000+ verified regulations (one source cites 125,000+ from 200+ markets — treat the higher figure as less well corroborated)
- Spans pharma, medical devices, cosmetics, food & supplements and chemicals — multi-domain breadth no one else matches
- 2,300+ crawler bots is a real, scaled ingestion pipeline — the exact machinery our platform has zero of
- Global RA services arm de-risks gaps: when the data is thin, humans fill it
- Adjacent Freyr SUBMIT PRO closes into eCTD submission execution

**Weaknesses**

- Crawler-first curation is generally viewed as lower editorial quality than Citeline/Cortellis analyst curation; breadth is bought at some cost in depth
- Services-led company — buyers wary of consulting pull-through and of software that is a lead-gen surface for services
- Weaker product-portfolio impact modeling than RIM-native competitors
- Public product documentation is thin and much of the coverage claim is self-reported

| | |
|---|---|
| AI shipped today | Ships today: 2,300+ intelligent web-crawling bots plus NLP/ML continuously scanning global regulatory websites into an expert-verified repository, with real-time updates, multilingual search, an AI chatbot, and analytics dashboards. This is genuine automated horizon scanning at scale, though 'expert-verified' depth per record is not independently verifiable. |
| GxP / validation posture | Not verified for the GRI platform. Freyr's separate SUBMIT PRO eCTD tool markets AI-powered validation, but that is submission validation, not computer-system validation, and should not be conflated. |
| Pricing signal | Not public. No list price or deal-size anchor published. Freyr's mixed software+services model means deals are usually blended and not comparable to a pure seat subscription. |

<details><summary>Sources</summary>

- https://www.freyrregintel.com/
- https://www.freyrregintel.com/freya-intelligence/
- https://www.freyrdigital.com/products/regulatory-intelligence/freya-intelligence
- https://www.freyrdigital.com/products/regulatory-intelligence/impact
- https://www.freyrsolutions.com/medicinal-products/regulatory-submission-roadmapsregulatory-intelligence-services
- https://medium.com/@freyrgri/why-ai-regulatory-intelligence-depends-on-data-not-algorithms-ad04e2bab0a5
- https://www.freyrsolutions.com/
- https://www.freyafusion.com/products/freyr-submit-pro

</details>

### Veeva Systems — Vault RIM (Registrations) + Vault AI — Veeva Vault RIM Suite — Vault Registrations, Vault Submissions, Vault Submissions Archive; Vault AI Agents; Falcon

The RIM system of record. Does not sell 'regulatory intelligence' as a content subscription — sells the registration/product-data backbone that intelligence must land on, then bundles AI on top. The strategic threat is not their RI content, it is that they own the record RI has to attach to.

**Strengths**

- Owns the registration/product data model — impact assessment is native, not an integration
- Verified Part 11 posture: immutable audit trail, configurable e-signature with meaning, inherited validation lifecycle
- 1,000+ life sciences companies on Vault RIM by 2026 — overwhelming incumbency
- Accessible entry pricing for small biotech ($15K–$45K/yr) undercuts every content-subscription competitor
- Bundling leverage: AI credits and Safety+RIM packages absorb point-solution budgets

**Weaknesses**

- Regulatory AI Agents are not GA as of 2026-07-28 (August 2026 target) — today they have the record but not the shipping regulatory agent
- Falcon is late-2026 early-adopter only — agentic HA-interaction handling is roadmap, not product
- Not a regulatory intelligence content vendor: no curated global requirements corpus, so customers still buy Cortellis/Citeline alongside
- Heavy, slow implementations; configuration cost frequently exceeds license cost
- Roadmap dependency creates a genuine but short window before they close the gap

| | |
|---|---|
| AI shipped today | Partially shipping as of 2026-07-28, and this timing matters. Vault AI Agents rolled out in waves: CRM/PromoMats December 2025, Safety and Quality April 2026, and Clinical/Regulatory/Medical AI Agents slated for August 2026 — i.e. Regulatory agents are NOT yet GA on today's date. Expected regulatory AI capabilities include auto-tagging, regulatory intelligence extraction, submission-timeline prediction, labeling paragraph analysis, missing-content detection and drafting HA question responses. Falcon, a separate agentic-labor platform outside Vault whose first agents include health-authority interaction management (extracting from regulatory communications and drafting responses), targets late 2026 for early adopters. Agents run on secure LLM platforms including Anthropic and Amazon Bedrock. |
| GxP / validation posture | Strongest verified posture in the set, and the reason they win regulated-record deals. Vault is purpose-built for regulated industries on single-tenant architecture with built-in validation support, out-of-the-box 21 CFR Part 11 features including comprehensive immutable audit trails and configurable electronic signatures capturing name, time and meaning; customers inherit Veeva's validation lifecycles and regulatory updates automatically. |
| Pricing signal | Never published; negotiated multi-year contracts. Third-party estimates (not vendor-confirmed): roughly $50–$200 per user per month for standard Vault fees; ~$15K–$45K/yr for a small biotech with 1–3 RA users; ~$45K–$120K/yr at 3–8 users. Veeva is expected to bundle Safety+RIM and fold AI credits into base contracts. Market context: RIM software market projected at $2.7B in 2026. |

<details><summary>Sources</summary>

- https://www.veeva.com/products/vault-ai/
- https://www.veeva.com/resources/veeva-ai-agents-to-be-released-across-all-veeva-applications/
- https://intuitionlabs.ai/articles/veeva-ai-roadmap-crm-bot-agents-2026
- https://www.clinicaltrialvanguard.com/conference-coverage/veeva-unveils-falcon-ai-platform-and-agentic-authoring-at-2026-summit/
- https://intuitionlabs.ai/articles/veeva-vault-pricing-2026-cost-breakdown
- https://intuitionlabs.ai/articles/veeva-vault-rim-cost-small-biotech
- https://intuitionlabs.ai/articles/veeva-vault-rim-guide-2
- https://intuitionlabs.ai/articles/gxp-collaboration-platforms-21-cfr-part-11
- https://www.gartner.com/reviews/market/life-science-regulatory-information-management-solutions

</details>

## Capability rubric

Our score is cited to `file:line` in this repository. Theirs is cited in the competitor sections above. Scored on what **ships and is reachable**, not what is architected — an unreachable or unvalidated capability scores low regardless of code quality.

| Dimension | Weight | Us | Best competitor | Their score | Our evidence |
|---|---|:--:|---|:--:|---|
| Continuous regulatory-change monitoring & alerting (the defining job of the category) | critical | **0** 🔻 | Rimsys | 5 | server/routes/reg-change.routes.ts:39 — a SELECT from c2c_reg_changes is the ONLY reference to that table in the entire repository. `grep -rn c2c_reg_changes` returns exactly one hit; there is no INSERT, no crawler, no feed poller, no scheduled job, no seed. db/migrations/20260717_reg_change_store.sql:12 creates the table and its `affects` JSONB impact column. The RegChange surface (client/src/concept2cure/v2/surfaces/RegChange.tsx) is reachable and will render an empty list forever for every customer. |
| Jurisdictional breadth (markets/agencies with real encoded requirements) | critical | **1** 🔻 | Freyr GRI | 5 | server/services/global-ri/regulatory-pathway-advisor.ts:51 — `export type Market = 'US' \| 'EU' \| 'JP' \| 'CA' \| 'UK' \| 'AU'` is the WIDEST union in the whole global-ri layer. Three other services narrow to `'FDA' \| 'EMA' \| 'PMDA'` only. A repo-wide scan of jurisdiction keys across all 47 services returns exactly 6 distinct markets. Competitors: 80+ (Cortellis), 90+ (Rimsys), 120+ (RegDesk), 140+ (Citeline), 200+ (Freyr). |
| Content currency operations — who keeps the corpus fresh, and how | critical | **1** 🔻 | Clarivate Cortellis | 5 | server/services/regulatory-currency/currency-registry.ts:77 — REGULATORY_FACTS contains 11 hand-curated facts, and all 11 carry the identical `lastVerified: '2026-06-29'`, i.e. one manual sweep, no process. server/services/regulatory-currency/guidance-ingestion-service.ts:79 — the ICH change-detection registry hardcodes 6 guidelines, against 64 in the static catalog. Worse, guidance-ingestion-service.ts:128 sets `DEFAULT_FDA_URL = 'https://api.fda.gov/other/substance.json'` — that is the openFDA Substance Data Reports (chemical substance registry) endpoint, not a guidance-document API, and results are mapped `title: r.substance_name` at line ~170. The 'live FDA guidance fetch' returns chemical substance names. Freyr runs 2,300+ crawlers; Clarivate runs a 30-year analyst operation. |
| Portfolio impact assessment — change maps to MY products/registrations/labels | critical | **1** 🔻 | Rimsys | 5 | db/migrations/20260717_reg_change_store.sql:24 defines `affects JSONB NOT NULL DEFAULT '[]'` for per-product impact, but with no writer (see dimension 1) it is永 empty. The one genuinely relevant asset is server/services/global-markets/market-readiness.ts:1-97 (assessMarketReadiness scores an artifact set against a market's required elements) — but it is scored against a static market descriptor, not against a live change feed, and has no UI (see dimension 8). Rimsys ships AI triage prioritized to each customer's specific products and markets; Veeva has the registration record natively. |
| GxP / CSV / 21 CFR Part 11 posture on the RI surface | critical | **0** 🔻 | Veeva Vault RIM | 5 | server/routes/global-ri/_shared.ts:16,19 — the complete middleware stack for all 92 global-ri endpoints is a rate limiter plus `requireRole('regulatory-author')`. Zero audit-trail writes, zero e-signature, zero record immutability across all 39 sub-routers (grep for part11/auditTrail/esign/signature over server/routes/global-ri/*.ts returns no functional hits). shared/constants/ui-surface-registry.ts:523 declares the global-ri surface `compliance: [A11Y, TONE]` — deliberately omitting PART11, which 33 other surface entries in that same file do carry. Veeva ships immutable audit trails, configurable e-sig with meaning, and inherited validation lifecycles. |
| Answer provenance & determinism — can you defend the answer to an inspector | critical | **5** 🔺 | Clarivate Cortellis | 3 | server/services/ana/tool-pedigree.ts:190 — a pure classifier assigning every AnA tool a DeterminismPedigree across five ranked classes (deterministic_registry / deterministic_query / rim_learned / external_api_live / model_assisted), conservative by construction so anything not provably a pure registry lookup defaults to model_assisted. All 26 global-RI tools classify as deterministic_registry (tool-pedigree.ts:137). server/services/ana/AnaToolExecutor.ts:2265-2273 returns every global-RI result stamped `deterministic: true` with the computing service named. 613 tests across 46 files pass in 5.5s, several asserting determinism explicitly. No competitor publishes an equivalent per-answer provenance taxonomy — Clarivate's assistant gives citations, which is a weaker guarantee than reproducibility. |
| Computed regulatory answers vs. document retrieval (exclusivity dates, fees, stability zones, change vehicles) | high | **4** 🔺 | Clarivate Cortellis | 3 | 47 deterministic services / 11,320 LOC under server/services/global-ri/, e.g. exclusivity-periods.ts (313 lines computing NCE/orphan/pediatric LOE), pharmacovigilance-obligations.ts (292), global-review-timeline.ts (280), regulatory-fee-estimator.ts, stability-requirements.ts, post-approval-changes.ts. 46 test files / 613 tests, all passing (verified by running `npx vitest run server/services/global-ri/__tests__`). This genuinely computes answers rather than returning PDFs — the incumbents largely do not. Capped at 4 because the computation only spans 3–6 jurisdictions. |
| Global market-planning surface — market entry sequencing and readiness, visible to a user | high | **1** 🔻 | Veeva Vault RIM (Registrations) | 5 | server/services/global-markets/market-registry.ts (795 lines) encodes 15 markets + MDSAP with unusually honest capability flags (13 canTransmit:true, 4 false; only 4 canAssemble:true). server/bootstrap/register-inline-routes.ts:184 mounts it at /api/global-markets. But `grep -rn 'global-markets' client/` returns ZERO hits — the entire market-planning half of this category has no UI, no surface, no AnA tool, and no front door of any kind. It is a working API nobody can invoke from the product. Score is 1 not 0 only because a determined integrator could call the API. |
| Reference corpus size and citation depth | high | **2** 🔻 | Clarivate Cortellis | 5 | server/services/global-ri/ich-guideline-catalog.ts:33 — ICH_GUIDELINES holds 64 guidelines (Q1–Q14, S1A–S11, E1–E19, M1–M12), which is genuinely near-complete ICH coverage and the single best content asset we have. But a repo-wide extraction of unique legal citation strings (21 CFR §, Reg (EU)/(EC) No, ICH codes) across all 47 services yields 126 distinct citations total. Cortellis curates 310,000+ documents; Freyr holds 100,000+ verified regulations. We are three to four orders of magnitude behind on corpus. |
| In-workflow reachability — can a user actually find and use it | critical | **4** 🔻 | Veeva Vault RIM | 5 | VERIFIED AGAINST THE STATED HYPOTHESIS AND IT DOES NOT HOLD FOR THIS CATEGORY. global-ri IS in NAV_HIDDEN (client/src/concept2cure/v2/registryModel.ts:161) and is NOT one of the 5 rail destinations (registryModel.ts:117-123). BUT client/src/concept2cure/v2/V2App.tsx:214 renders <Home> at the bare /concept2cure base, and client/src/concept2cure/v2/surfaces/Surfaces.tsx:65 + :216-245 renders getSegmentModules(segment) as a clickable module grid where 'Global regulatory intelligence' sits under 'Intelligence & risk' and calls onNav('global-ri') — that is ONE CLICK from the app landing screen, for all 6 segments (verified programmatically). Additionally reachable via Projects → project-home (ProjectHome.tsx:625), via ⌘K (Shell.tsx:981-993 searches all UI_SURFACES including hidden ones), via deep-link /concept2cure/global-ri, and via 26 AnA chat tools. The surface itself is real and live-bound: Surfaces.tsx:316-401 GlobalRiBrowser renders from GET /api/global-ri/catalog with no fixture fallback. Docked one point because the 'global market planning' half (global-markets) has no front door at all, and because ui-surface-registry.ui-v2.ts:403,419 references a tool `global_ri_market_access` that does not exist in the 26-tool set — stale registry metadata. |
| AI assistant answering regulatory questions in context | high | **4** | Clarivate Cortellis AI Assistant | 4 | server/services/global-ri/ana-tools.ts:31-36 exposes 26 global_ri_* tools; server/services/ana/AnaToolDefinitions.ts:2114 registers the specs into the assistant's tool list; server/services/ana/AnaToolExecutor.ts:2265 loop-registers the handlers. Chats is the #1 rail destination (registryModel.ts:118), so a user can ask 'what's my NCE exclusivity in the EU' in the primary surface and get a deterministic, non-hallucinated answer. Docked one point: no multilingual support, no document summarization, no draft-vs-final guidance diff — all three of which Clarivate shipped in Dec 2025. |
| Programmatic access / API & embeddability | medium | **5** 🔺 | Clarivate Cortellis (Cortellis Labs API) | 4 | 92 endpoints across 39 sub-routers (verified by counting router.get/post across server/routes/global-ri/*.ts: 61 GET + 31 POST). global-ri.openapi.json carries 87 paths (57 GET / 30 POST) and is machine-generated from the capability catalog by server/services/global-ri/openapi-builder.ts, with a test asserting a path exists for every catalog route. server/routes/global-ri/catalog.routes.ts:21 exposes one-call discovery returning 41 capabilities in 9 groups with per-tool JSON input schemas, which the UI consumes to build dynamic forms with zero hard-coded endpoints. This is materially better API hygiene than anything the incumbents publish except Cortellis Labs. |

## Where we stand

**Where we win**

- Determinism and defensible provenance. Every one of the 26 global-RI answers is computed by a pure service with no LLM in the path and is stamped `deterministic: true` (AnaToolExecutor.ts:2265-2273), classified by a five-class provenance taxonomy that is conservative by construction (tool-pedigree.ts:190). No competitor ships anything equivalent — Clarivate's assistant offers citations, which tells you where a claim came from but not that the same question yields the same answer tomorrow. In a category where the buyer's nightmare is defending an AI-derived regulatory position to an inspector, reproducibility beats retrieval.
- Computed answers rather than document lookup. 47 services / 11,320 LOC / 613 passing tests actually calculate NCE and orphan exclusivity expiry, review-clock projections, agency fee estimates, ICH stability zones, post-approval change vehicles and designation eligibility. Cortellis and Citeline hand you the guidance; we hand you the number. That is a genuine product-shape difference, not a feature gap.
- API and contract hygiene. 92 endpoints, a machine-generated 87-path OpenAPI spec that a test proves is in sync with the catalog, and a one-call discovery endpoint that lets a client render the entire surface — including dynamic forms from per-tool JSON schemas — without hard-coding a single route (catalog.routes.ts:21). For an acquirer intending to embed this into an existing platform, this is the most valuable engineering asset in the package.
- Engineering quality as due-diligence signal. 46 test files, 613 tests, 5.5s runtime, zero failures, pure functions throughout with no DB/network/clock dependencies in the core services. This is a codebase an acquirer can safely modify, which is not true of most assets at this stage.
- ICH corpus completeness. 64 ICH guidelines encoded (ich-guideline-catalog.ts:33) with a test asserting every ICH code referenced elsewhere resolves to a real catalog title — no citation drift. Narrow, but genuinely complete and correct.

**Where we reach parity**

- Reachability of the intelligence surface itself. Contrary to the platform-wide pattern, global-ri is one click from the app landing screen (V2App.tsx:214 → Surfaces.tsx:65,216-245), plus Projects, ⌘K, deep-link and chat. The surface is live-bound to the real catalog with honest loading/empty/error states and no fixture fallback (Surfaces.tsx:316-352). This is at parity with how competitors surface RI, and it is one of the better-wired offerings in this product.
- Having a shipping AI assistant at all. Our 26 chat-callable tools put us level with Clarivate's Dec-2025 GA assistant on the basic 'ask a regulatory question in natural language, get a grounded answer' loop — and ahead of Veeva, whose Regulatory AI Agents are not GA until August 2026. Parity, not advantage, because the capability is now table stakes.
- Honest capability disclosure. market-registry.ts encodes canAssemble/canTransmit flags that admit what the platform cannot do (only 4 of 16 markets canAssemble). Competitors are vaguer, but this is a trust asset rather than a scoring win — buyers do not pay for it, they just stop discounting for it.

**Where we lose**

- Regulatory change monitoring — the category's defining capability — does not function. c2c_reg_changes has exactly one reference in the entire repository, a SELECT (reg-change.routes.ts:39). No writer, no crawler, no feed, no seed. The horizon-scan surface renders empty forever. Rimsys ships AI triage across 90+ countries prioritized to each customer's own products; Freyr runs 2,300+ crawler bots. We ship a table. This alone loses the standard bake-off in the first minute.
- Jurisdictional breadth is 6 markets at absolute best and 3 for several services (regulatory-pathway-advisor.ts:51). Cortellis 80+, Rimsys 90+, RegDesk 120+, Citeline 140+, Freyr 200+. We are 13x to 33x behind the field. Any RFP with an emerging-markets column eliminates us on page one.
- Zero Part 11 / CSV posture on the RI surface. The whole middleware stack is a rate limiter and a role check (_shared.ts:16,19); the surface registry itself omits PART11 while 33 sibling surfaces declare it (ui-surface-registry.ts:523). Veeva's verified immutable audit trail and e-signature-with-meaning is exactly what a regulated buyer asks for on question three.
- The global market-planning half of the category is invisible. 795 lines and 15 markets of registry plus a readiness scorer are mounted at /api/global-markets (register-inline-routes.ts:184) with literally zero client references. Half of what the category name promises cannot be reached from the product at all.
- Content currency has no operating process. 11 curated facts sharing a single lastVerified date (currency-registry.ts:77), a 6-entry ICH change registry against a 64-entry catalog, and — the outright defect — a 'live FDA guidance' fetcher pointed at https://api.fda.gov/other/substance.json, the openFDA chemical substance registry, mapping guidance titles from `r.substance_name` (guidance-ingestion-service.ts:128). That code path returns substance names when asked for guidance documents.
- Corpus scale. 126 unique legal citations total. Cortellis curates 310,000+ documents, Freyr 100,000+ regulations. Three to four orders of magnitude.
- Stale metadata that will surface in technical diligence. ui-surface-registry.ui-v2.ts:403,419 declares a tool family `global_ri_market_access` that does not exist among the 26 registered tools — precisely the kind of drift that makes a buyer discount every other self-reported claim in the repo.

## Is the advantage durable?

NOT DURABLE, AND THE CLOCK IS SHORT. Break it into the three things that could be a moat.

1. The 47 deterministic services and 11,320 LOC of encoded frameworks. Rebuild cost is roughly 6–9 engineer-months for a competent team, and materially less in 2026 because the encoding work (statute → typed rule with citation) is exactly what a frontier model plus a regulatory SME does well now. Clarivate, with 310,000 curated documents and a 30-year analyst bench, could encode computed answers over its own corpus faster than we could ever catch up on corpus. This is a head start, not a moat.

2. The determinism-pedigree classifier (tool-pedigree.ts). This is the only genuine differentiator, and it is a ~200-line idea. It is not defensible by code — it is defensible only if it becomes a market expectation we are known for, and we have no market presence to make that happen. Any competitor can implement provenance labeling in a sprint once a customer asks for it in an RFP. Realistic protection: 12–18 months, and only if we publish and evangelize it loudly. Currently we do neither.

3. The API/OpenAPI contract quality. Zero moat. It is good engineering, not defensible IP. Its value is entirely to an acquirer integrating the asset, not against a competitor.

TIME TO CLOSURE, BY COMPETITOR. Veeva closes fastest and hardest: their Clinical/Regulatory/Medical AI Agents land August 2026 — under a month from today — with auto-tagging, regulatory intelligence extraction, submission-timeline prediction and HA-response drafting, sitting on top of the registration record and an already-validated Part 11 envelope, at 1,000+ customers and $15K–$45K/yr entry pricing. When that ships, our AI-assistant parity claim evaporates and our determinism claim becomes the only thing left. Call it 1 month. ArisGlobal's NavaX Intelligence Agents — which "automatically interpret regulatory guidelines, convert them into rule checklists, and assess dossiers with compliance evaluations, justifications and confidence scores" — are stated available Q4 2026: that is a direct functional overlap with our computed-answer differentiator, 3–5 months out. Clarivate already closed the assistant gap in December 2025 and could add computed outputs over its corpus within 2–3 quarters. Rimsys already ships the change-monitoring capability we lack entirely, so there is nothing for them to close.

NET. The defensible window against the platform incumbents is 1–5 months and is measured against announced, dated roadmaps rather than speculation. The direction of travel is against us on every dimension except provenance, and provenance is a 12–18 month lead at best. An acquirer should price this as a time-limited engineering asset with a short integration window, not as a defensible market position. If the intent is to sell into this category standalone, the window has effectively already closed.

## Shortest credible path to parity

1. FIRST, AND ONLY THIS ONE MATTERS FOR THE DEMO — make the change feed real. Build a writer for c2c_reg_changes: a scheduled ingester over the ~6 free authoritative feeds (FDA guidance RSS + Federal Register API, EMA news/guidance, MHRA, Health Canada, TGA, PMDA English releases), normalizing to the existing row shape, plus an impact matcher that joins each change to the org's registrations and populates the `affects` JSONB. The table, the route (reg-change.routes.ts) and the surface already exist — this is a writer plus a cron, not a rewrite. Effort: 4–6 engineer-weeks. Without this, nothing else on this list is worth doing, because the platform cannot survive the standard bake-off question.
2. SECOND — fix the FDA fetcher defect before any diligence or demo. server/services/regulatory-currency/guidance-ingestion-service.ts:128 points DEFAULT_FDA_URL at https://api.fda.gov/other/substance.json (openFDA chemical substance registry) and maps guidance titles from `r.substance_name`. Repoint at the FDA guidance-documents dataset / Federal Register API and fix the field mapping. Effort: 1–2 days. This is a credibility landmine — a technical buyer who opens this file discounts every other claim in the repo.
3. THIRD — give global market planning a front door. server/services/global-markets/market-registry.ts (15 markets, honest canAssemble/canTransmit flags) and market-readiness.ts (0–100 scoring with honest blockers) are mounted at /api/global-markets and have ZERO client references. Add a market-planning tab inside the existing GlobalRiBrowser (Surfaces.tsx:316) and 2–3 AnA tools (global_ri_list_markets, global_ri_market_readiness, global_ri_market_comparison) registered the same way the existing 26 are. Effort: 1–2 engineer-weeks for a capability that is already fully built and tested. Highest ratio of demo value to effort in the entire package.
4. FOURTH — buy breadth instead of building it. Do not attempt to encode 100 markets by hand; that is a content operation, not an engineering project, and it is how we lose to Freyr and Citeline permanently. Either (a) license a wholesale regulatory content feed and let our deterministic layer compute over it, or (b) reposition explicitly as a 6-market DEPTH product ('the deepest computed answers for US/EU/JP/CA/UK/AU') and stop competing on breadth in RFPs we cannot win. Option (b) is free and should be adopted this week regardless of what else happens.
5. FIFTH — put a Part 11 envelope on the RI surface, but only the part that matters. Do not sign every read. Add audit-trail writes for the decision-carrying endpoints (strategy-brief, exclusivity, pathway, fee estimate, designation assessment) recording input, output hash, tool pedigree, user and timestamp, and add PART11 to the surface registry entry (ui-surface-registry.ts:523) only once that is real. The existing determinism stamp makes this unusually cheap — the output is already reproducible, so the audit record is small and verifiable. Effort: 2–3 engineer-weeks. This converts our best technical asset into a compliance claim a buyer will pay for.
6. SIXTH — turn the currency registry into a process, not an artifact. 11 facts with one shared lastVerified date is not a freshness mechanism. Expand the ICH change registry from 6 entries to the full 64 the static catalog already holds, add a staleness SLA that flags any fact older than 90 days at query time, and surface the freshness stamp in the UI next to every answer. Effort: 1–2 engineer-weeks. This is also the cheapest way to make the determinism story complete: reproducible AND dated beats cited.
7. SEVENTH — clean the stale metadata before diligence. ui-surface-registry.ui-v2.ts:403,419 references a tool family `global_ri_market_access` that does not exist among the 26 registered tools. Add a CI test asserting every anaToolFamilies prefix in the surface registry resolves to at least one registered tool, the same way the ICH catalog test already prevents citation drift. Effort: 1 day. Diligence hygiene, not capability.
8. EIGHTH — publish the determinism-pedigree model as a market position, not a code file. It is the only thing in this package no competitor ships, and it is invisible: it appears as a small 'deterministic' chip in the capability browser (Surfaces.tsx:393-396) and nowhere else. Put the pedigree class on every AnA answer in chat, write it into the sales narrative, and make 'can you prove the same question returns the same answer next quarter' the question we ask THEM in every bake-off. Effort: days of engineering, weeks of positioning. This is the only move that extends the moat rather than closing a gap.

## Verdict

**🟠 Niche-viable** — This is not a regulatory intelligence product and should not be valued as one. It is a high-quality deterministic regulatory REASONING engine that has been mislabeled as intelligence, and the distinction decides the price.

The category is defined by one job: continuously watch global regulatory change and tell me which of my products it hits. We do not do that job at all. c2c_reg_changes is referenced exactly once in the entire codebase — a SELECT (reg-change.routes.ts:39) — with no writer, no crawler, no ingestion, no seed anywhere. The surface ships and renders empty forever. Meanwhile the mechanism that was supposed to keep static knowledge fresh has 11 hand-curated facts sharing one verification date, and its "live FDA guidance" fetcher points at the openFDA chemical substance registry (guidance-ingestion-service.ts:128), returning substance names when asked for guidance. On the category's core loop we score 0 and 1 against competitors scoring 5.

Breadth compounds it: 6 markets at best, 3 for several services (regulatory-pathway-advisor.ts:51), against 80+ (Cortellis), 90+ (Rimsys), 120+ (RegDesk), 140+ (Citeline), 200+ (Freyr). That is not a gap to close with engineering; it is a content operation to fund. And there is no Part 11 posture on the surface at all — the full middleware stack is a rate limiter and a role check (_shared.ts:16,19), with the surface registry itself omitting PART11 while 33 siblings declare it (ui-surface-registry.ts:523).

I want to be explicit about one thing I was told to expect and did not find. The reachability hypothesis — complete backends with no front door — is FALSE for the intelligence half of this category. global-ri is one click from the app landing screen for all six segments (V2App.tsx:214 → Surfaces.tsx:65,216-245), plus Projects, ⌘K, deep-link, and 26 chat tools, and the surface is genuinely live-bound with no fixture fallback. It is among the best-wired offerings in the product. The hypothesis IS true for the market-planning half: 795 lines and 15 markets at /api/global-markets with zero client references anywhere. So reachability costs us half the category, not all of it.

What is genuinely valuable, and what an acquirer is actually buying: 47 pure services, 11,320 LOC, 613 tests passing in 5.5 seconds, 92 endpoints behind a machine-generated OpenAPI contract that a test proves stays in sync, a one-call catalog that renders the whole surface without hard-coded routes, 64 ICH guidelines with zero citation drift, and — the one thing nobody else in this market ships — a five-class determinism-pedigree classifier that labels every answer's provenance and refuses to over-claim (tool-pedigree.ts:190). In a market where six vendors shipped LLM assistants in eight months and every one of them answers with citations rather than reproducibility, a system that can prove the same question yields the same answer is a real and defensible asset.

That asset is worth something as an embedded reasoning layer inside a platform that already has the content pipeline, the registration record and the validated envelope — which is to say, worth something to Veeva, Rimsys, RegDesk or a RIM vendor, not to an end customer choosing between this and Cortellis. Niche-viable, verging on not-competitive as a standalone: it cannot win an RI bake-off today, it cannot be honestly demoed against the change-monitoring requirement, and the "not-competitive" call is avoided only because the deterministic compute layer and API contract are real, tested, reachable, and genuinely differentiated.
