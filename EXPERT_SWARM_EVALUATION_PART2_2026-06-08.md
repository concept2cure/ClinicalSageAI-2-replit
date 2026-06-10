# Expert Swarm Evaluation — Part 2: Additional Lenses, Competitive Landscape & Buyer POC

**Date:** 2026-06-08
**Companion to:** `EXPERT_SWARM_EVALUATION_2026-06-08.md`
**Purpose:** Extend the swarm with the buyer/user lenses not yet covered, position the product against the *real* 2026 competitive set, and predict what a prospect's proof-of-concept actually tests.

> **Part 1 verdict held:** strong copilot + UX, real Part 11 infrastructure and biostatistics, but a credibility gap (fabricated outputs, over-claims) and partial regulatory substance. **Part 2 adds the market reality:** the incumbents are shipping the exact AI capabilities C2C pitches, *and* the best-of-breed authoring tools plug into the platform-of-record (Veeva) rather than competing with it. That changes the strategy more than any single feature gap.

---

## 13 · The lenses Part 1 didn't cover

### 13a · Medical Writer — the person who'd actually live in this tool

**Impression:** The editor (TipTap + serif reading surface, slash commands, citations, review mode) is the surface I'd spend 6 hours a day in, and it's well-considered. The reviewer-grade tone enforcement is genuinely helpful for first drafts.

**What's missing for my daily job:**
- **Microsoft Word is my world, and my QC reviewer's world.** Certara CoAuthor and Yseop both win by living *inside* Word with track-changes and styles intact. A browser-only editor that can't round-trip to a styled, track-changed Word doc with intact comments is a non-starter for the QC/sign-off step. Export fidelity (numbered headings, cross-refs, ToC, agency styles) is everything and I see no evidence of it.
- **No template-conditional logic** — real reg-writing templates branch on study type, phase, population. The 13 templates here are static.
- **No reference manager** (EndNote/Zotero) or in-text citation styles (Vancouver/AMA) — citations exist but not citation *management*.
- **No "consistency across documents"** — my hardest job is keeping the same number/claim identical across protocol, CSR, 2.5, and 2.7. The "cross-section consistency" here is heuristic string-matching, not a managed content-reuse/single-source-of-truth model.

**Suggestion:** Win the *drafting* step where you're strong, but you must solve Word round-trip before a medical-writing group adopts you for anything they sign.

### 13b · Market Access / HEOR — an entire missing pillar

**Impression:** Absent. There is no payer dossier (AMCP), no HTA submission support (NICE/IQWiG/ICER), no value dossier, no budget-impact or cost-effectiveness modeling, no GVD.

**Why it matters:** "Concept to cure" implies getting a therapy to patients, which means *reimbursed*. Regulatory approval is necessary but not sufficient; market access is where launches succeed or die. A platform claiming the full arc that stops at FDA filing is solving half the commercial problem. The CMS coverage and ICD-10 data sources are even *available* in this environment — the raw material for a payer-evidence module exists and is unused.

**Suggestion:** Even a thin AMCP dossier + HTA-readiness module would differentiate from the pure reg-writing incumbents, none of whom own market access either.

### 13c · Clinical Operations / Data Management — the CDISC gap

**Impression:** Study *design* is good (Part 1 §7), but study *conduct and data* are absent. No CDISC SDTM/ADaM/SEND awareness, no define.xml, no CRF/EDC concepts, no TMF (trial master file), no site/enrollment operational tracking beyond forecasting math.

**Why it matters:** Module 5 and the CSR are *generated from CDISC datasets and TLFs*. Without any data-standards layer, the product can never author the clinical core of a submission from source — it can only template prose around numbers a human pastes in. This is the structural reason Module 5 is missing, not an oversight.

**Suggestion:** A define.xml/ADaM-aware TLF-to-narrative generator would be a genuine moat and directly feeds the missing Module 5. It's hard, which is exactly why it's defensible.

### 13d · Discovery / Translational Scientist — the "Concept" in Concept2Cure is unserved

**Impression:** The name promises the arc from *concept* (target/molecule) to *cure*. The product begins at roughly IND/regulatory and does nothing for discovery, target validation, lead optimization, IND-enabling tox, or translational strategy. The environment even exposes ChEMBL (bioactivity/ADMET), bioRxiv/medRxiv, and PubMed tools — the connective tissue for a discovery-through-translation story — and the product touches none of it.

**Why it matters:** It's a positioning mismatch. Either narrow the name/promise to "regulatory intelligence" (honest, and what it is), or build toward the discovery end to earn "Concept2Cure." Right now the brand writes a check the product doesn't cash.

### 13e · CRO Commercial Lead — multi-tenant is the business model, and it's the risk

**Impression:** The Client Portal and external-persona scaffolding show the team understands the CRO motion (a CRO running many sponsors' work). That's the *right* wedge — CROs buy tools that make billable hours more efficient, and they bring many logos at once.

**But:** the security audit found **five cross-tenant IDOR routes** (Part 1 §9). For a CRO holding *competing sponsors'* pre-submission IP in one instance, cross-tenant leakage isn't a bug — it's a breach-of-contract, lose-the-master-services-agreement event. The contract tests exist; live-DB isolation tests are still outstanding. **No CRO procurement team signs without a pen test and SOC 2.**

**Suggestion:** The CRO channel is your fastest path to revenue *and* your highest isolation bar. Lead the security investment here.

### 13f · Investor / Technical Diligence — is this venture-scale, and is the moat real?

**Impression (candid):** The engineering quality, design taste, and breadth are impressive for the team size implied. The honesty in most of the code (null over fabrication, typecheck ratchet) signals a team I'd trust to execute. But three diligence flags:

1. **Breadth over depth.** ~30 layoutModes, 19 AI surfaces, every pathway partially done. Classic pre-PMF sprawl. The dead-code audit (211 files / 55k lines removed, ~157 dead schema tables) confirms a lot was built and abandoned. **Focus is the #1 ask.**
2. **The moat is curated knowledge, not technology.** The RIM is replicable by any RA-staffed competitor (Part 1 §10); the LLM/RAG plumbing is commoditized; the corpus that *would* be the moat is empty. The defensibility thesis needs proprietary data — real submissions and *outcomes* — which means landing customers who'll let you learn from their dossiers. Chicken-and-egg.
3. **The incumbents are already here** (see §14). The window is the 12–24 months before Veeva's RIM AI Agents ship broadly. That's the whole investment thesis: can C2C win a defensible workflow and a data flywheel *before* the platform-of-record commoditizes the category.

**Verdict:** Fundable as a focused wedge (biostats copilot, or CMC authoring, or CRO efficiency) with a credible data-flywheel story. Not fundable as "the AI platform for all of life-sciences regulatory" — that lane is being paved by a $30B incumbent.

---

## 14 · Competitive landscape — the part that should reshape strategy

The category C2C is entering is **not greenfield in 2026.** The honest map:

| Player | What they are | Why it matters to C2C |
|---|---|---|
| **Veeva Vault RIM** | The platform of record for regulatory in pharma. **AI Agents for RIM shipping ~Aug 2026** — auto-tagging, regulatory-intelligence extraction, predictive submission dates, paragraph labeling, missing-content detection, drafting HA-question responses. | This is *almost exactly C2C's pitch*, coming from the system the data already lives in. C2C cannot out-distribute Veeva; it must coexist with or specialize beneath it. The missing Veeva integration (Part 1 §1) is therefore the single most important roadmap item. |
| **Certara CoAuthor** | Word-integrated generative AI for reg writing, eCTD templates, human-in-the-loop. **Joined Veeva AI Partner Program Oct 2025.** ~30% drafting-time reduction (substantiated). | Best-of-breed authoring that *plugs into* Veeva rather than fighting it. Sets the realistic, defensible ROI bar (~30%, not "100h→2.6h"). C2C's editor competes directly here and currently lacks Word round-trip. |
| **Yseop** | Regulatory-grade AI for clinical narratives/CSRs/summaries. 2026 BIG Innovation Award; TIME Best Inventions 2025. | Owns the auto-narrative niche (CSR/SAE) C2C only stubs. Validated, branded, enterprise-deployed. |
| **AlphaLife AuroraPrime** | GenAI agents that synthesize Veeva data to auto-draft CSRs and Module 2 summaries, up to 50% reduction. | Already doing the *Module 2/5 generation from real data* that C2C cannot (no CDISC layer). |
| **Clarivate Cortellis / IQVIA** | Regulatory intelligence + RWE data depth. | C2C's "regulatory intelligence" claim competes with decades of curated content + the data C2C's corpus lacks. |

**The strategic read:** The market has bifurcated into (1) the **platform of record** (Veeva) adding native AI, and (2) **specialist AI authoring tools** (Certara, Yseop, AlphaLife) that *integrate into* the platform of record. There is no obvious room for a third "platform" that replaces Veeva. **C2C's viable positions are: (a) a specialist that integrates with Veeva/ESG and out-executes on one workflow, or (b) the tool for the segment Veeva underserves — small/early biotech and CROs without a Vault license.** Option (b) is plausibly C2C's real beachhead and aligns with the Client Portal/CRO scaffolding.

**Regulatory tailwind to use:** FDA's **Jan 2025 draft guidance on AI "model credibility" and validation** for AI used in regulatory submissions is a *gift* to a platform built audit-first. C2C's deterministic, auditable RIM and provenance model are exactly what that guidance rewards — *if* the fabricated outputs are removed first. "Credibility by construction" is a sharper, more honest wedge than "proprietary AI."

---

## 15 · The buyer's POC scorecard — what a prospect will actually test

When a real RA/quality/biostats team runs a 2-week proof-of-concept, here's what they test and the predicted result based on the current build:

| POC test | What they do | Predicted result today |
|---|---|---|
| "Draft our 2.5 from our data" | Upload protocol + CSR, ask for Clinical Overview | ⚠️ Plausible prose, but not grounded in their CDISC data; reviewer-grade *style* helps |
| "Export it to our Word template, track-changed" | Round-trip to styled Word for QC | ❌ Likely fails — no evidence of fidelity round-trip |
| "Produce a valid eCTD sequence" | Generate backbone + leaves, validate in eValidator | ❌ Validator exists, publisher doesn't |
| "Submit to ESG test gateway" | Actually transmit | ❌ No AS2/SFTP transport |
| "Show me the audit trail for an inspector" | Pull a single canonical Part 11 trail + verify integrity | ⚠️ Real infra, but fragmented stores + unverified chain |
| "Power our adaptive Phase 2" | Sample size, alpha spending, OC | ✅ This passes — and impresses |
| "Predict our trial's success" | Ask the predictor | ❌ Returns hardcoded 0.5 — credibility damage |
| "Build our 510(k) SE table" | Predicate comparison matrix | ❌ Predicate list only, no SE logic |
| "Generate our EU MDR CER" | Run CER | ❌ Service returns failure |
| "Security questionnaire + isolation proof" | SOC 2, pen test, cross-tenant test | ❌ Not yet; recent IDOR history surfaces |
| "Show the Takeda 100h→2.6h result" | Ask for the source | ❌ No source exists |

**Pattern:** the POC *demos* well (design + biostats + drafting) and *fails on procurement-grade verification* (export, submission, audit-as-evidence, security attestation, claim substantiation). That is precisely the profile of a product sold one tier above its readiness. **The fix is to either lower the claim to match (copilot) or raise the build to match (submission system) — not to keep demoing across the gap.**

---

## 16 · Pricing, packaging & GTM read

- **Don't price as a platform you can't yet validate.** Price the **biostatistics/study-design copilot** and the **authoring copilot** as seat-based tools a biotech can buy without IT/security committee sign-off (land), then expand into governed submission workflows once SOC 2 + real publishing land (expand).
- **CRO channel** is the efficient logo-multiplier — but gated on isolation proof.
- **Avoid head-to-head with Veeva.** Sell to who Veeva doesn't: pre-Series-B biotech, academic translational groups, small device shops, and CROs serving them.
- **Substantiate every quantified claim** before it enters a deck. Use Certara's *defensible* ~30% benchmark framing, backed by a real customer pilot, not a template-sourced 97% reduction.

---

## 17 · Consolidated "do this next" (both parts)

**This week (truth-alignment — days of work, removes deal-killers):**
1. Delete every fabricated value (`Math.random()` ESG acks/statuses, reviewer-twin probabilities, 0.5 predictor, fabricated priors).
2. Retract or substantiate the Takeda/ROI claim everywhere it appears.
3. Hide or fix the broken EU MDR CER service before any device demo.

**This quarter (earn one workflow completely):**
4. Pick the beachhead: **biostatistics copilot** (strongest) or **CMC stability + 2.3 QOS** (highest-ROI gap). Go deep enough to win a POC outright.
5. Word round-trip fidelity for the editor (table-stakes for any writing buyer).
6. Working Part 11 evidence pack: unified audit trail + chain verifier + IQ/OQ/PQ.

**This year (unlock larger tiers):**
7. Real Veeva + ESG integration (coexist, don't replace).
8. eCTD publisher (build or OEM) + Module 5 via a CDISC/TLF layer.
9. SOC 2 Type II + pen test (gates CRO and enterprise).
10. Populate the corpus — the data flywheel is the only durable moat.

**Strategy:** Position as **"regulatory credibility by construction"** — an auditable copilot that integrates with the systems of record — aimed at the biotech/CRO segment the incumbents underserve. Win one workflow, earn the data flywheel, then widen. The "Harvey for life sciences" ending is reachable; the path runs through honesty and focus, not breadth.

---

*Part 2 of 2. Competitive facts are sourced from public 2025–2026 reporting (Veeva AI Agents roadmap, Certara CoAuthor / Veeva AI Partner Program, Yseop, AlphaLife AuroraPrime, FDA Jan-2025 AI credibility draft guidance). Product findings remain grounded in direct code inspection.*
