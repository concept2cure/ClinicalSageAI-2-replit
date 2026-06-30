# Human Factors & Usability Engineering Specification

**Date:** 2026-06-15
**Author:** Human-factors / usability engineering review (IEC 62366-1; FDA "Applying Human Factors and Usability Engineering to Medical Devices"; WCAG 2.2 AA)
**Method:** Grounded against the two companion implementation specs and the product design system. No code. Design only.
**Companions:**
- `REPORTING_INTELLIGENCE_AUDIT_AND_SPEC_2026-06-15.md` — the Report OS reporting/prediction layer (the **Report Workspace** surface).
- `DEVICE_IVD_SUBMISSION_ASSEMBLY_SPEC_2026-06-15.md` — the device/IVD submission-assembly path (the **eSTAR / device assembly** surface).
- `README.md` — the design system: reviewer-grade calm voice, 21 CFR Part 11 UX, WCAG 2.2 AA enforcement, no emoji, no exclamations, no cheerleading.

---

## 0 — Scope and framing

This document specifies the **human-needs layer** that sits across both builds. The two companion specs define *what the software does and why it is honest*; this document defines *how a human safely operates it under the conditions where a use error has a regulatory consequence.*

The product is not a regulated medical device in the 510(k) sense — it is the software that life-sciences professionals use to assemble and reason about regulated submissions. We therefore apply IEC 62366-1 and the FDA HFE guidance as a **discipline**, not a clearance requirement: the framework is the right tool because in this product, a use error (a misread number, a wrong export, a wrong region) propagates directly into a regulatory filing or a board decision. The cost of a use error is borne downstream, by the user's organization and by patients. That is exactly the risk profile the HFE process is built for.

Two invariants from the companion specs anchor everything here. They are the **truthfulness defaults**, and the entire human-factors design treats them as load-bearing safety controls, not features:

- **Report OS truthfulness defaults:** `isSample` guard on fixture data (sample data is visibly labeled and never exportable as a governed artifact); every number carries **confidence + freshness + source**; "final-ready" is blocked when a required dependency is missing, stale beyond budget, or a prediction is below confidence threshold; predictions degrade honestly at cold-start (no high-confidence number when n is below threshold) rather than fabricating.
- **Device/IVD assembly truthfulness defaults:** `officialEstarPdf: false` until the official FDA eSTAR PDF is actually filled and validated — a ZIP of loose section PDFs is never labeled "submittable"; per-market `canTransmit = false` for the eight advisory-only markets and for any market without configured credentials; no pathway reports "ready to submit" without the authority's real artifact plus a validation pass.

Roles in scope: **regulatory affairs (RA) lead**, **program / project manager (PM)**, **QA / audit**, **executive / board**, **CRO account lead**.

---

## 1 — Use specification (IEC 62366-1 §5.1)

### 1.1 Intended users (user profiles)

| User group | Domain expertise | Regulatory literacy | Frequency of use | Relevant impairments / constraints to design for |
|---|---|---|---|---|
| **RA lead / head of regulatory** | High — owns the submission and the agency relationship | Expert — reads readiness, blockers, precedent natively | Daily, deep | Time-pressured near deadlines; high cost of a wrong submittable; may use a screen reader or high-zoom |
| **Program / project manager** | High on timeline/risk, moderate on regulatory specifics | Intermediate — needs plain-language blockers and statuses | Daily, broad (portfolio) | Cognitive load from many programs at once; relies on at-a-glance status |
| **QA / audit** | High on Part 11, provenance, signatures | Expert on controls, not on content authoring | Periodic, intensive (audit windows) | Needs every claim traceable; will deliberately probe for unprovenanced or sample data |
| **Executive / board** | Low on regulatory mechanics, high on decision stakes | Novice-to-intermediate — consumes sealed packs | Infrequent, high-stakes | Reads conclusions, not method; most at risk of reading a low-confidence prediction as certain |
| **CRO account lead** | High; operates across multiple client organizations | Expert | Daily across tenants | At risk of cross-tenant/cross-client confusion; multi-account context errors |

**Design consequence:** the population spans expert (RA, QA) to novice-of-method (board). The honest-uncertainty controls (confidence/freshness on every number) exist primarily to protect the **novice-of-method** reader — the executive who would otherwise read a forecast as a promise. The accessibility controls protect the **expert under load** (RA at deadline, on zoom or screen reader).

### 1.2 Use environment

- **Physical:** office and home-office desktops; standard lighting; no sterile field, no gloves, no alarms. Mobile is a constrained overlay, not a primary assembly surface (panels become fixed overlays per the design system; assembly and sealing are desktop tasks).
- **Social / organizational:** work is audited under 21 CFR Part 11 / GxP. Multiple people act on the same artifact (drafting, review, sign-off). Decisions made on these surfaces enter regulatory filings and board minutes. CRO context means one operator legitimately moves between client tenants in one session.
- **Technical:** browser-based SPA; async report runs and streaming AnA responses introduce latency the user must not misread as completion. Submission gateways are credential-gated; absence of credentials is a normal, frequent state that must read as "not configured," never as failure or as a silent success.
- **Temporal / stress:** the highest-risk moments are **deadline pressure** (filing windows) and **board-prep crunch**. The HFE design assumes the worst error is made by a competent, hurried expert, not a confused novice.

### 1.3 User task list (per surface)

**Report Workspace (Report OS)**
1. Select a scope (account / program / project / study / submission / document) or a saved program group.
2. Select a report type from the governed taxonomy (Exec/Board, RA Lead, QA/Audit, plus Regulatory Forecast and CRL/RTF Pre-Mortem).
3. Run the report (async); monitor run status to completion.
4. Read the insight: readiness, predicted approval probability / review time / deficiency count, top risks with precedent, prioritized fix list — each with confidence, freshness, source.
5. Distinguish live data from sample/empty-state preview.
6. Resolve or acknowledge blockers ("what's missing to make this final").
7. Export to sealed PDF/A or DOCX-ledger; finalize and e-sign.
8. Schedule a recurring run / subscribe recipients (later slice).
9. Invoke a run from AnA and pin the governed result.

**eSTAR / Device Assembly**
1. Select project + pathway (510(k) / De Novo / PMA / EU MDR / IVDR).
2. Select target market/region.
3. Review readiness and gap mapping for the chosen pathway.
4. Assemble the submission artifact (`assembleDeviceSubmission`).
5. Distinguish a **draft package** (loose-PDF ZIP, `officialEstarPdf: false`) from the **official filled eSTAR PDF** (validated).
6. Run validation (`eSTARValidator`; external eValidator when licensed) and read the validation report and blockers.
7. Freeze, e-sign, and export the governed artifact.
8. Dispatch / transmit (only where `canTransmit = true` and credentials are configured).

---

## 2 — Critical tasks & use-related risk analysis (IEC 62366-1 §5.3–5.5)

A **critical task** is one where a use error can cause harm with regulatory consequence. Harm here is downstream: a defective or non-submittable filing, a misinformed high-stakes decision, an unattributable signature, a confidentiality breach across tenants. Severity uses a calm three-band scale — **Minor** (rework, delay), **Serious** (regulatory rejection, audit finding, misinformed decision), **Critical** (filing of false/defective record, signature repudiation, cross-tenant disclosure).

Each mitigation ties to a named truthfulness default and a named design-system control. The principle throughout: **the safe state is the default**, and overriding it requires a deliberate, attributable act.

| # | Critical task | Use error (hazard) | Potential harm | Severity | UI mitigation (truthfulness default + design-system control) |
|---|---|---|---|---|---|
| 1 | Export a report for distribution | Exporting **sample / fixture data** as if it were a governed report | A board or agency receives fabricated numbers presented as real; loss of trust; misinformed decision | **Critical** | `isSample` guard: sample data renders only in a labeled empty-state preview ("Sample — run a report to see live data") and the **export/finalize action is disabled** while any value on the surface is sample-sourced. Disabled state uses the design-system disabled pattern (`opacity 0.5; pointer-events:none`) with a visible reason, never a silent no-op. Governed export path never accepts `isSample` content (enforced + tested). |
| 2 | Treat the assembled package as filed | Mistaking a **draft eSTAR ZIP** (loose section PDFs) for a **submittable** | A non-submittable package is sent to CDRH; filing rejected; deadline missed | **Serious–Critical** | `officialEstarPdf: false` is the explicit, visible state on any loose-ZIP output. The artifact carries a calm, factual status pill — **"Draft — not an official eSTAR"** — and the dispatch/transmit action is blocked until the official FDA eSTAR PDF is filled and `eSTARValidator` passes. The word "submittable" never appears on a draft (honesty gate from the device spec). |
| 3 | Choose the filing destination | Selecting the **wrong market / region** | Submission assembled or "transmitted" toward the wrong authority; wasted cycle or, worse, a misdirected confidential filing | **Serious** | Per-market `canTransmit = false` for the eight advisory-only markets and for any market lacking credentials. Region selector shows each market's true capability state inline (Advise / Assemble / Transmit) so the user cannot select a transmit action that does not exist. Transmit returns the honest `gateway_not_configured` state rather than a fabricated ACK. Region change near a sealed artifact requires confirmation (calm dialog, clear action label — not "Are you sure?"). |
| 4 | Act on a prediction | Reading a **low-confidence prediction as certain** | A board funds/kills a program, or an RA lead times a filing, on a number the model itself does not stand behind | **Serious–Critical** | Every predicted value (approval probability, review-time days, deficiency count) renders with its **confidence band, freshness timestamp, and denominator/source** adjacent to the number — never the number alone. At cold-start (n below threshold) the surface shows the model's honest "insufficient data — confidence: low" output, and the value is visually de-emphasized and excluded from "final-ready." Confidence is communicated by **text label + band, never color alone** (see §3). |
| 5 | Seal / e-sign an artifact | Sealing or e-signing the **wrong artifact** (wrong version, wrong scope, wrong project) | A Part 11 signature is bound to the wrong record; non-repudiation is compromised; an unintended record becomes immutable | **Critical** | Finalize/seal is a two-stage, role-gated act (manager+). The signature manifestation step restates **what is being signed** — artifact title, scope, version, and a content hash — in a calm confirmation that the signer must read, not a one-click toggle. Draft exports are watermarked "Draft — not sealed." Seal/verify is round-trippable and every seal is audit-logged (Part 11). The autosave/version pill ("Autosaved · v0.4") keeps the active version unambiguous at all times. |
| 6 | Operate across clients (CRO) | Acting in the **wrong tenant / client context** | Confidential client data exported, mixed, or signed under the wrong organization | **Critical** | Active tenant/client context is persistently shown in the top bar (not buried in a menu). Tenant isolation is enforced server-side on every Report OS read (contract-tested), so a context error cannot leak data even if mis-selected. Changing client context mid-task surfaces a calm confirmation when an unsaved or unsealed artifact is open. |
| 7 | Interpret a partial / degraded report | Reading a **partial report** as complete | Decision made on an incomplete picture; missing blockers unseen | **Serious** | The orchestrator's `partial` state is shown explicitly; blockers ("what's missing to make this final") render at the **top** of the report, not buried. Degradation is never hidden. Freshness chips on each section reveal stale providers. |
| 8 | Trust an AnA-generated narrative | Treating AnA's **natural-language framing** as the source of the numbers | A hallucinated or paraphrased figure is acted on as governed data | **Serious** | AnA never invents figures; it frames deterministic engine output. Numbers in chat carry the same provenance hooks as the artifact and link back to the governed run. AI persona styling (muted blue, per design system) visually distinguishes assistant framing from the governed artifact pane, which renders in its own sandboxed render tree. |

**Risk-control verification note:** every mitigation above maps to a test named in the companion specs (fixture-never-exported; no-high-confidence-at-cold-start; tenant-isolation contract; seal/verify round-trip; no "submittable" without the real artifact + validation). HFE risk controls are only credible if they are tested; these are.

---

## 3 — Human-needs heuristics

### 3.1 Cognitive load

- **One canonical surface per task.** Report Workspace is a single workspace with a persona-filtered report-type list (taxonomy `allowedPersonas`), not five per-role screens. Device assembly funnels through one `assembleDeviceSubmission` contract and the existing submission center, not the current fragmented entry points. Consolidation is a usability requirement, not only an architectural one: parallel surfaces are how users end up in the wrong one.
- **Progressive disclosure.** Blockers and confidence summarize at the top; method, provenance, and per-provider freshness reveal on hover/expand (`data-prov` hooks). The board reader sees the conclusion and its confidence; the QA reader expands to the audit ID.
- **Numbers over adjectives** (design system). "Approval probability 0.62, confidence: low, n=24, as of 2026-06-10" carries its own caveat. No "strong chance," no "looking good."
- **Density without crowding.** Compact rows (`h-8`–`h-10`), 768px content cap for long-form, asymmetric 65/35 artifact/intelligence split so the eye rests where the work is.

### 3.2 Error prevention and recovery

- **Safe default state.** Sample data is non-exportable; drafts are not submittable; markets default to non-transmit; final-ready is off until earned. The user must act deliberately to leave the safe state, and that act is attributable.
- **Block, don't warn-and-allow, for Critical tasks.** Tasks 1, 2, 5, 6 are *blocked* (disabled with a visible reason) rather than permitted-with-a-warning. Tasks 3, 4, 7 are *guarded* (state shown inline + confirmation on consequential change).
- **Reversibility where safe; confirmation where not.** Optimistic autosave with version history for drafting (no save buttons; versioned). Irreversible acts (seal, e-sign, dispatch) get a calm confirmation that names the artifact and consequence — never "Are you sure?", always a clear action label.
- **Honest, recoverable errors.** Errors state what failed and what to try (design system). `gateway_not_configured` reads as a configuration state with a next step, not a failure or a fabricated success.

### 3.3 Trust calibration

The product's competitive moat is honest uncertainty (companion spec, "confidence-as-a-feature"). Trust calibration is therefore a primary usability goal: the user's confidence in a number must track the system's actual confidence.

- **Every number carries confidence + freshness + source.** No bare figures anywhere in a governed surface.
- **Blockers are first-class.** "Submission readiness 87% — 3 items blocking" (design-system canonical example) is the house style: the caveat travels with the headline.
- **De-emphasize what the model doesn't stand behind.** Cold-start and below-threshold predictions are visually subordinate and excluded from finalize.
- **Provenance on demand.** Every artifact paragraph reveals source file, model, model version, confidence, and audit ID — the Part 11 traceability hook doubling as a trust control.

### 3.4 Accessibility (WCAG 2.2 AA — specifics)

- **Focus management.** Visible focus on every interactive element: 2px terracotta offset outline for keyboard, 3px subtle ring on form fields; focus is never removed (design system). When an async report run completes or a dialog (seal confirmation, region change) opens, focus moves deliberately to the new content / first action and returns to the trigger on close. Modal focus is trapped.
- **ARIA live regions for async and streaming.** Async report-run status (queued → running → complete / partial / failed) is announced via an `aria-live="polite"` region so non-sighted users learn of completion without polling the screen. Streaming AnA responses announce start and completion politely (not per-token, to avoid speech flooding); an injected error uses `aria-live="assertive"`. A spinner alone is never the only completion signal (mitigates Task 7, reading running as done).
- **Color is never the only channel.** Confidence bands, status pills (Drafting / In review / Approved / Blocked / Locked / Ready), and the draft-vs-official eSTAR distinction all carry a **text label and/or icon and shape**, not just the earthy color. A user with color-vision deficiency must be able to tell "low confidence" and "Draft — not an official eSTAR" from the words, not the hue. This directly protects Critical tasks 2 and 4.
- **Keyboard-navigable scope tree.** The scope selector (account → program → project → study → submission → document) and the eCTD/device tree drawer are fully keyboard operable with proper `tree`/`treeitem` roles, arrow-key traversal, expand/collapse, and a clear current-node indication — so an RA lead on keyboard or screen reader can select the correct scope (mitigates wrong-scope contribution to Tasks 1 and 5).
- **Targets and contrast.** Minimum 24×24 CSS px target size (WCAG 2.2 §2.5.8); compact rows still meet the floor. Text and essential UI meet AA contrast on the warm-cream canvas; the muted palette is verified against AA, not assumed.
- **Reduced motion.** `prefers-reduced-motion` collapses all animation to ~1ms (design system); staggered reveals and the write-head caret must not be the only indication of state.
- **No new accessibility debt.** The `accessibility-enforcement` skill runs on every new surface in both builds (named in both specs' test/hardening steps).

### 3.5 Microcopy and tone

- Calm, factual, second person. Sentence case. No emoji, no exclamation marks, no cheerleading, ever (design system, restated because the temptation is strongest in empty states and success moments).
- The system **confirms, it never celebrates.** A successful seal reads "Sealed · v1.0 · 2026-06-15," not "All set."
- Empty states describe what will appear; errors say what failed and the next step.
- Status vocabulary is the fixed factual set; predictions always read with their confidence inline. No "Oops," no "Something went wrong," no "Are you sure?"

---

## 4 — Formative + summative usability evaluation plan (FDA HFE guidance)

### 4.1 Formative evaluation (during build — find and fix use errors)

- **Cadence:** at the end of each shippable slice (Report OS Slices 1–4; Device Slices 1–4 from the companion specs).
- **Method:** moderated think-aloud, 5–8 participants per round drawn from the role mix, on realistic seeded data including deliberately degraded states (sample data present, a stale provider, a cold-start prediction, an unconfigured gateway, a draft-only eSTAR).
- **Representative formative tasks:**
  - Run an RA Lead report at program scope and tell us whether the program is ready to file, and why or why not.
  - Find the number you would put in front of the board, and tell us how confident you are in it.
  - Produce something you would send to the FDA for this 510(k). (Probe: do they recognize the draft ZIP is not submittable?)
  - Distribute this report to the board. (Probe: do they attempt to export sample data? Is it blocked clearly?)
  - File this for the EU IVDR market. (Probe: do they understand transmit is unavailable, and why?)
  - Sign off on this submission. (Probe: do they verify what they are signing?)
- **Output:** a use-error log mapped to the §2 critical-task table; each new or unmitigated use error is a fix before the next slice. Formative rounds explicitly test whether the safe-default and color-never-alone controls actually prevent the error, not just whether users like the screen.

### 4.2 Summative (validation) evaluation (pre-GA — demonstrate safety of use)

- **Method:** simulated-use validation, 15+ participants **per distinct user group** for the critical-task set, on production-representative data and environment (desktop, real latency, credential-gated gateways in their true unconfigured state). Tasks performed without assistance; no training beyond what GA users will receive.
- **Critical tasks validated (the §2 set):** export with sample data present; draft-vs-submittable eSTAR recognition; correct market/region selection; correct interpretation of a low-confidence prediction; sealing/e-signing the correct artifact; (CRO) operating in the correct tenant.
- **Success / failure criteria per task:**
  - **Success:** the participant completes the task with the safe outcome — does not export sample data, does not treat a draft as submittable, selects the right market, states uncertainty correctly, signs the intended artifact, stays in the right tenant.
  - **Failure (use error):** any safe-default override that produces an unsafe outcome, or any misinterpretation of confidence/draft/region/tenant state. Close calls and difficulties are recorded and root-caused even when the task ultimately succeeds.
  - **Root-cause every failure and close call** against the design; residual use-related risk must be reduced as far as possible and any remaining risk justified.

### 4.3 What "validated" means per surface

- **Report Workspace is validated when:** across the role groups, participants reliably (a) never export or distribute sample/fixture data, (b) correctly state the confidence and freshness of any number they would act on, and (c) correctly read partial/blocked states — with all critical-task use errors root-caused and mitigated, and the truthfulness tests (fixture-never-exported, no-high-confidence-at-cold-start, tenant isolation, seal/verify, Part 11 audit-on-export) green.
- **eSTAR / Device Assembly is validated when:** participants reliably (a) distinguish a draft package from an official filled, validated eSTAR and do not attempt to file the draft, (b) select the correct market and correctly understand transmit availability, and (c) sign/seal the intended artifact — with the honesty gate enforced (no "submittable" without the real artifact + validation pass) and the device truthfulness tests green.

---

## 5 — GA usability acceptance checklist

Concrete pass/fail items the team runs before release. Each maps to a §2 critical task and/or a named truthfulness default. **Any "fail" blocks GA.**

**Truthfulness / safe-default controls**
- [ ] Sample/fixture data is visibly labeled and the export and finalize actions are disabled while any value on the surface is `isSample` — verified in the UI and by the fixture-never-exported test. (Task 1)
- [ ] No loose-PDF ZIP is labeled "submittable"; `officialEstarPdf: false` artifacts carry the "Draft — not an official eSTAR" pill and the dispatch action is blocked. (Task 2)
- [ ] Region selector shows true per-market capability (Advise / Assemble / Transmit); `canTransmit = false` markets and unconfigured gateways cannot trigger a transmit; transmit without credentials returns `gateway_not_configured`, never a fabricated ACK. (Task 3)
- [ ] Every predicted and reported number renders with confidence + freshness + source adjacent; no bare numbers on governed surfaces; cold-start/below-threshold values are de-emphasized and excluded from finalize. (Task 4)
- [ ] Finalize/seal restates artifact title, scope, version, and content hash before signing; seal is role-gated; draft exports watermarked "Draft — not sealed"; seal/verify round-trips and is audit-logged. (Task 5)
- [ ] Active tenant/client context is persistently visible; tenant-isolation contract tests pass on all Report OS reads. (Task 6)
- [ ] Partial/degraded reports are labeled `partial` and blockers render at the top, never hidden. (Task 7)
- [ ] AnA numbers carry provenance and link to the governed run; the artifact pane is visually and structurally distinct from assistant framing. (Task 8)

**Accessibility (WCAG 2.2 AA)**
- [ ] Visible, non-removed focus on all interactive elements; focus moves to new content on async completion and dialog open, returns on close; modal focus trapped.
- [ ] `aria-live` announces async run status (polite) and injected errors (assertive); streaming start/complete announced without per-token flooding; a spinner is never the sole completion signal.
- [ ] Confidence bands, status pills, and draft-vs-official eSTAR are distinguishable by text/shape/icon, not color alone.
- [ ] Scope selector and tree drawer are fully keyboard-operable with correct `tree`/`treeitem` semantics and clear current-node indication.
- [ ] Minimum 24×24 px targets; AA text/UI contrast verified on the cream canvas; `prefers-reduced-motion` honored.
- [ ] The `accessibility-enforcement` skill passes on every new surface in both builds.

**Microcopy / tone**
- [ ] No emoji, no exclamation marks, no cheerleading, no "Are you sure?", no "Oops/Something went wrong" anywhere in either surface.
- [ ] All titles, headings, and buttons are sentence case; status uses the fixed factual vocabulary; success states confirm, never celebrate.
- [ ] Empty states describe what will appear; errors state what failed and the next step.

**Process gate**
- [ ] Summative validation complete for every role group on the critical-task set; all use errors and close calls root-caused; residual risk reduced as far as possible and any remainder justified.
- [ ] Each §2 risk control has a passing automated test.

---

## Appendix — Traceability (use error → control → spec invariant → test)

| Critical task | Primary control | Truthfulness default | Verifying test |
|---|---|---|---|
| 1 Export sample as governed | Disabled export while `isSample`; labeled preview | `isSample` guard | fixture-never-exported |
| 2 Draft ZIP read as submittable | "Draft — not an official eSTAR" pill; dispatch blocked | `officialEstarPdf: false` | no "submittable" without real artifact + validation |
| 3 Wrong market/region | Capability-aware region selector; honest gateway state | `canTransmit = false`; `gateway_not_configured` | tenant/region capability + honest-transmit test |
| 4 Low-confidence read as certain | Confidence + freshness + source on every number; cold-start de-emphasis | honest cold-start; confidence-as-feature | no-high-confidence-at-cold-start |
| 5 Seal/sign wrong artifact | Restated-content seal step; role gate; draft watermark | final-ready gate; Part 11 seal | seal/verify round-trip; audit-on-export |
| 6 Wrong tenant (CRO) | Persistent context; server-side isolation | tenant isolation | tenant-isolation contract |
| 7 Partial read as complete | `partial` label; blockers at top | honest degradation | partial-state rendering test |
| 8 AnA framing read as source | Provenance on AnA numbers; sandboxed artifact pane | AnA frames, never invents | grounding eval; AI-gateway audit |
