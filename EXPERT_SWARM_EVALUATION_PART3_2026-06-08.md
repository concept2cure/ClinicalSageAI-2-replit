# Expert Swarm Evaluation — Part 3: Primary-Source Forensics, Corrected Claims & Costed Remediation

**Date:** 2026-06-08
**Companion to:** Parts 1 and 2.
**What's different here:** Parts 1–2 leaned partly on the platform's *own* audit reports. Part 3 goes to the **primary source** — the actual code, read at file:line — to (a) verify which fabrications are still live, (b) **correct several now-stale audit claims** (credit where the team has already remediated), and (c) turn the findings into an hours/days-level punch list and a costed roadmap. It closes with a **live demonstration** of the data flywheel the product is missing.

> **Headline update:** The credibility gap is **real but narrower and closing faster** than Parts 1–2 implied. The team is running a visible, honest remediation campaign — many fabrication sites now carry `// Previously: Math.random()…` comments with real logic in their place, and several "failures" are *honest* failures (return `failed`/throw rather than fake success). The remaining live fabrications are **few, specific, and fixable in hours, not weeks.** The hard work that remains is structural (publisher, CDISC/Module 5, Veeva, SOC 2, corpus) — not the fabrications.

---

## A · Why read the code directly

In an evaluation whose central charge is "don't trust claims you can't verify," it would be hypocritical to trust the audit *reports* without checking the code. So every finding below was confirmed by reading the file. Three of the audit's most-cited findings turn out to be **already fixed or overstated** — and saying so is the point: it's both fair to the team and a demonstration of the standard the product itself should meet.

---

## B · Corrections — findings the audits got stale (credit to the team)

### B1 · The "hardcoded HMAC secret undermines tamper-evidence" claim is no longer true in production
`server/lib/tamper-proof-audit.ts:125-138`:
```ts
if (process.env.NODE_ENV === 'production') {
  throw new Error('[FATAL] AUDIT_HMAC_SECRET is required in production. … Refusing to start.');
}
console.warn('[SECURITY WARNING] AUDIT_HMAC_SECRET not set. Using a non-production development fallback …');
// Development-only fallback. Never reached in production (throws above).
this.hmacSecret = 'INSECURE_DEV_SECRET_CHANGE_IN_PRODUCTION';
```
The insecure secret is **dev-only and unreachable in production** (the process refuses to boot without a real secret). This is the *correct* pattern. The audit's framing is outdated — the audit trail's tamper-evidence is not undermined in a real deployment.

### B2 · The "trial success prediction is a hardcoded 0.5" claim is stale
`server/services/foresight/index.ts:52-72` now delegates to a real engine:
```ts
const result = await engine.calculatePredictiveSuccessScore({
  organizationId, studyId, phase, indication,
  biomarkerData, preclinicalData, competitorData,
});
return { …, confidence: result.successProbability, value: result.successProbability,
         rationale: result.goNoGoRecommendation, supportingEvidence: result.keyDrivers… };
```
The predictor is now a **multi-factor heuristic engine** consuming biomarker/preclinical/competitor inputs; the residual `return 0.5` lines are **edge-case fallbacks** (e.g., no biomarker data), which is defensible. *Caveat:* whether `calculatePredictiveSuccessScore` is **calibrated/validated** against outcomes is unverified — it's an honest heuristic, and should be labeled as such in the UI, not as a "prediction."

### B3 · The "EU MDR CER service is broken" claim overstates it
`server/services/cer/index.ts:50-60` — the *underlying* `cerGenerationService.generateCER` exists and works given `deviceId`, `userId`, `regulatoryFramework`. It is the **convenience facade** (`UnifiedCERService`) that isn't wired to those inputs, and it **fails honestly** rather than fabricating:
```ts
// Until the facade is wired to those inputs, surface a failed result
// rather than a partial/fabricated report.
return { reportId: '', status: 'failed', sections: [], … };
```
So: the CER capability exists; the wrapper is an honest stub. "Broken" → should read "**facade unwired; underlying service present**." Still a gap, but a much smaller one.

### B4 · There is a visible, honest Math.random remediation campaign
Real logic now sits where fabrications used to, each annotated:
- `server/routes/protocol_routes.ts:644` — *"Previously `Math.floor(70 + Math.random()*25)`, a random …"*
- `server/routes/authoring.router.ts:4716` — *"Previously: `85 + Math.random()*15` — a fabricated …"*
- `server/routes/real-world-evidence.ts:529` — *"The prior implementation fabricated the entire result with Math.random();"*
- `server/services/aiProviderRouter.ts:273` — *"Deterministic round-robin cursor — replaces a Math.random() pick …"*
- `server/services/fdaIntegrationService.ts:717` — now **honestly documents** that real ESG transport (AS2/SFTP) is not implemented.

This is exactly the engineering integrity Part 1 credited. The team is converging on truth-alignment on its own.

---

## C · The fabrications that are still LIVE (verified) — and the one-line honest fix for each

These are the remaining sites a buyer's compliance team could still find. All are small fixes.

| # | Location | What it does today | Honest fix | Effort |
|---|---|---|---|---|
| **C1 — most serious** | `server/services/ESGSubmissionService.ts:314-321` (`transmitToESG`, **non-test/production path**) | Comment says *"For now, return a mock response"*; returns `acknowledgmentNumber: \`ACK${year}${Math.random()…}\``, `status: 'submitted'` — and `updateSubmissionStatus` (`:379-389`) then **persists it as submitted** with `submittedAt`/`submittedBy`. A production "submit to FDA" returns a fabricated success. | Throw a structured `not-implemented` error — exactly as the sibling `downloadAcknowledgment` already does at `:491-496` — so the UI/audit never record a fake submission. | ~1 hr |
| **C2** | `ESGSubmissionService.ts:352-356` (`checkSubmissionStatus`, test mode) | Returns `Math.random()` ACK + `status: 'accepted'`. Test-gated (lower risk) but inconsistent with the deterministic test response used elsewhere. | Make deterministic like `simulateESGSubmission` (`:331-340`). | ~15 min |
| **C3** | `server/services/DocumentOrchestrationService.ts:641` & `:687` | Generates fake FDA identifiers: `kNumber: 'K'+year+Math.random()…` and `submissionNumber: 'K'+year+Math.random()…` — embedded into **FDA Form 3881** and **Form 3654** (the latter asserting `truthfulAndAccurate: true`). K-numbers are **assigned by FDA**, never self-generated. | Leave blank or `"To be assigned by FDA"`. Fabricating a regulatory ID on a certification form is the single worst look here. | ~30 min |
| **C4** | `server/services/cognitive-ecosystem/digital-twin-runtime.service.ts:826-827` | CQA "measurements" fabricated as `98 + Math.random()*4` (code itself references the forensic audit). | Gate behind an explicit `simulation: true` flag, or compute from real process inputs; never surface as data. | ~1-2 hr |
| **C5** | `server/intelligence-service.ts:189` | `alignedWithSuccessful = Math.floor(Math.random()*5)+1; // Simulate 1-5 alignments` | Compute from real signal data, or remove the metric. | ~1 hr |

**Total to finish truth-alignment on the live sites: roughly half a day to a day of engineering.** That is the entire gap between "a demo a compliance officer distrusts" and "a demo that survives the hood being opened." It is the highest ROI work in the whole backlog.

---

## D · The data flywheel — demonstrated, not asserted

Parts 1–2 flagged that the "precedent intelligence" / "learns from past studies" thesis sits on an **empty corpus** (4 PDFs, ~8 CSV rows). To make that concrete, I ran the exact kind of query the product's Precedent Intelligence and study-design modules promise — against the *same* live source the product already integrates (ClinicalTrials.gov v2):

**Query:** Phase 3, non-small cell lung cancer, started since 2021.
**Returned, in one call:**
- **100 trials analyzed**, **140 primary endpoints**, **797 secondary endpoints**
- Canonical endpoint landscape surfaced automatically: **Overall Survival (OS), Progression-Free Survival (PFS), Objective Response Rate (ORR), Duration of Response (DOR), Disease Control Rate (DCR)**, and design specifics like *"PFS by BICR (RECIST v1.1)"* and *"DFS assessed by IRC."*

**Two takeaways:**
1. **The flywheel is one API call away.** The plumbing exists (`live-ctgov-fetcher.ts`); what's missing is *ingestion + persistence into the RIM corpus*. The gap between "empty shells" and "real precedent intelligence" is a data-engineering job, not a research project. This is the most under-exploited asset in the codebase.
2. **A subtler, important gap the raw data exposes:** the endpoints come back **unnormalized** — `OS`, `Overall Survival (OS)`, and `Overall survival (OS)` are three strings for one concept. Real precedent intelligence therefore needs an **endpoint/outcome ontology and normalization layer** (map to a controlled vocabulary; collapse synonyms; structure timeframes and assessment methods). The product has neither. So the flywheel isn't merely "ingest data" — it's "**ingest, normalize against a controlled vocabulary, and index**." That ontology *is* a real, defensible moat, far more so than the heuristic RIM. **This is the single highest-leverage thing to build.**

---

## E · Costed remediation roadmap (sequenced)

| Horizon | Item | Rough effort | Unlocks |
|---|---|---|---|
| **Now (≤1 day)** | Fix live fabrications C1–C5 | ~0.5–1 dev-day | Removes the only "fabricated output" findings a POC can surface. Biggest credibility ROI. |
| **Now (≤1 wk)** | Retract/substantiate the Takeda/ROI claim everywhere; relabel "predictions" as "heuristic estimates" | ~1–2 days | Removes sales-liability + sets defensible (~30%, à la Certara) ROI framing |
| **Weeks** | Wire the `UnifiedCERService` facade to the working `cerGenerationService` (B3); MEDDEV/GSPR checklist pass | ~1–2 wks | Makes EU MDR demos honest |
| **Weeks** | Word round-trip fidelity (styles, track-changes) for the editor | ~3–5 wks | Table-stakes for any medical-writing buyer |
| **1 quarter** | **CT.gov → RIM corpus ingestion + endpoint ontology/normalization** (Section D) | ~4–8 wks | Turns "precedent intelligence" from shell to real; the durable moat |
| **1 quarter** | Part 11 evidence pack: unified audit trail + chain verifier + IQ/OQ/PQ | ~4–6 wks | Passes CSV/quality gate; required for GxP buyers |
| **1 quarter** | Pick + win one beachhead workflow (biostats copilot **or** CMC stability+2.3 QOS) end-to-end | ~6–10 wks | A reference customer and a wedge |
| **2–3 quarters** | Real ESG transport (AS2/SFTP) + eCTD publisher (build or OEM) + Module 5 via CDISC/ADaM | ~1–2 qtrs | Earns the "submission system" claim |
| **2–3 quarters** | Veeva coexistence connectors; SOC 2 Type II + pen test | ~1–2 qtrs | Unlocks enterprise + CRO tiers |

---

## F · Revised bottom line

Reading the primary source **improves** the verdict on the team and **sharpens** the verdict on the product:

- **On integrity:** Better than Parts 1–2 implied. The fabrications are being actively, honestly removed; the audit log is correctly fail-closed in production; several "broken" things fail *honestly*. The team holds itself to the right standard.
- **On the remaining credibility gap:** It is now a **half-day-to-a-day** punch list (C1–C5) plus one sales-claim retraction — not a multi-week remediation. **Do it this week and the single biggest deal-killer is gone.**
- **On the real work:** The multi-quarter effort is structural — **publisher, Module 5/CDISC, Veeva coexistence, SOC 2, and above all a normalized precedent corpus.** The CT.gov demonstration in Section D proves the corpus is reachable *now*; the missing piece is ingestion + an outcome ontology, which is also the most defensible moat available.

The "Harvey for life sciences" ambition remains reachable. The nearest mile is almost run: finish truth-alignment (hours), relabel heuristics honestly (days), then pour the quarter into **one** workflow and the **normalized corpus** that makes the intelligence real.

---

*Part 3 of 3. All code findings verified by direct inspection at the cited file:line on branch `claude/biotech-pharma-evaluation-UBJzJ`. The endpoint-landscape demonstration used the live ClinicalTrials.gov v2 source the product already integrates; figures (100 trials / 140 primary / 797 secondary endpoints) are reproducible.*
