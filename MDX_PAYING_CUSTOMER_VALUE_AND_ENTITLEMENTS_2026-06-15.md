# MDX & Global Capabilities — Paying-Customer Value & Entitlements

**Date:** 2026-06-15
**Author:** Product strategy + platform engineering (life-sciences SaaS)
**Status:** Strategy doc + companion to a shipped, tested entitlements module.
**Method:** Code-grounded. Tiers, credits, and capability boundaries below are taken from live code, not from prior marketing. Every tier name matches what `billing.ts` and `usage-metering.ts` actually key on.

**Companion documents**
- `REPORTING_INTELLIGENCE_AUDIT_AND_SPEC_2026-06-15.md` — the reporting/prediction layer (the "Report OS", Regulatory Forecast, CRL/RTF Pre-Mortem). This doc monetizes that layer.
- `DEVICE_IVD_SUBMISSION_ASSEMBLY_SPEC_2026-06-15.md` — the device/IVD assembly and global-market scope. This doc monetizes its advisory/readiness/planning surface.
- `HUMAN_FACTORS_AND_USABILITY_SPEC_2026-06-15.md` — the honest-uncertainty and safe-default UX rules the gating UX (§4) must obey.

**Companion code (shipped with this doc)**
- `server/services/entitlements/types.ts` — `Tier`, `FeatureKey`, `FeatureEntitlement`.
- `server/services/entitlements/mdx-entitlements.ts` — pure `featureTier`, `isEntitled`, `entitlementsForTier`, `entitlementMatrix`.
- `server/services/entitlements/index.ts` — barrel.
- `server/services/entitlements/__tests__/mdx-entitlements.test.ts` — vitest coverage (17 tests, all passing).

---

## 0 — Scope and the one honesty rule that governs everything

This doc covers the *paying-customer value and entitlements* for four NEW capabilities the platform is bringing to market:

1. **Governed reporting + prediction** ("Report OS"): governed report families plus the prediction-backed **Regulatory Forecast** and **CRL/RTF Pre-Mortem** reports.
2. **Device & IVD submission-assembly readiness**: readiness/gap scoring and the eSTAR/Annex assembly surface.
3. **Global-market planning**: per-market submission planning across the world's regulated markets.
4. **AnA advisory**: grounded, structured device/IVD + global-market guidance the assistant can call.

**The honesty rule (non-negotiable, and the actual moat).** The companion audit found the platform's defining strength is that it *degrades honestly* rather than fabricating: predictions return a network-prior / "insufficient data, confidence: low" output at cold-start instead of a fake number; submission gateways return `transmitted:false, gateway_not_configured` without credentials instead of a fabricated ACK; the new global-markets and AnA-advisory modules are "honest by construction — no transmission capability is ever asserted." Pricing and entitlements must reinforce this, never undercut it. We sell **decision confidence with its denominator attached**, not certainty.

---

## 1 — Paying personas and their jobs-to-be-done

These are the people who hold or influence budget. Each pays for an *outcome*, not a feature.

| Persona | Job to be done | Outcome they pay for | Primary new capability |
|---|---|---|---|
| **RA lead** (Regulatory Affairs) | Get a submission to the right authority, complete and defensible, on time | Fewer RTF/CRL surprises; a readiness picture they can act on; a per-market plan that tells the truth about what is and isn't possible | Device/IVD assembly readiness; global-market planner; CRL/RTF Pre-Mortem |
| **Program / project manager (PM)** | Keep the program on schedule and surface risk early | Recurring, drift-triggered status without chasing people; a forecast that flags slip risk before it lands | Scheduled reports; Regulatory Forecast; report families |
| **QA / audit lead** | Be inspection-ready and prove provenance | Every number traces to a source with freshness + confidence; sample data can never leak into a governed export; Part-11-style audit on export | Governed report families (the QA/Audit family specifically) |
| **Exec / board** | Make a go/no-go call without reading the raw dossier | A plain-language portfolio view they can read correctly — including honest uncertainty so a forecast is not misread as a promise | Report families (Exec/Board); portfolio rollup |
| **CRO / consultancy account lead** | Serve many clients/programs from one place and show value | Cross-account rollup; per-client device assembly and global planning they can resell | Portfolio rollup; device assembly readiness; global-market planner; AnA advisory |

The novice-of-method reader (the board member) is exactly why honest-uncertainty controls exist (HF spec §"Design consequence"): the executive who would otherwise read a forecast as a guarantee is protected by confidence/freshness on every number. That protection is a *selling point*, not a caveat.

---

## 2 — Value & ROI framing (defensible only)

**Ground rule (from the reporting audit).** Do **not** repeat unsupported, headline ROI such as a "Takeda 100h → 2.6h" style claim. The audit was explicit that the credibility of any time/cost number is gated by corpus depth, and that the corpus tables are near-empty until ingestion is run. Quantified savings below are framed as *defensible mechanisms with customer-specific ranges to be validated*, never as a fixed marketing number. Where we cannot defend a number, we sell the mechanism and the risk avoided.

### 2.1 Governed reports + prediction (Report OS)

- **What is real:** the prediction layer is a *trained logistic-regression risk model* for RTF / CRL / first-cycle approval, with holdout AUC/Brier and an activation gate that refuses regressions; it blends a cold-start network prior below ~n=30, then the trained model. It is transparent about ML vs heuristic vs rules and degrades honestly. (Audit §2.) The gap the audit flagged is that this lives inside tool calls, not in a *report a buyer can read and act on* — that report surface is the new product.
- **Value mechanism (defensible):** a single RTF (Refuse-to-File) or CRL (Complete Response Letter) costs a program a *review-cycle* of delay — typically multiple months of runway and re-work, plus the opportunity cost of a delayed launch window. A pre-mortem that surfaces one avoidable RTF trigger before submission pays for the subscription many times over. We sell **the cost of one avoided cycle**, sized to the customer's own program economics, not a fixed hour count.
- **Value mechanism (defensible):** scheduled + drift-triggered reports replace the manual "pull the weekly status together" ritual. The honest claim is *labor reallocated from assembling status to acting on it* — quantify per customer from their current cadence and headcount, not a platform-wide figure.
- **Trust as value:** every number carries its denominator, freshness, and confidence; "final-ready" is blocked when a dependency is missing or stale. In a regulated tool this *honest uncertainty is a trust moat* against competitors that overstate (audit §"Confidence-as-a-feature").

### 2.2 Device & IVD submission-assembly readiness

- **What is real today:** readiness/gap mapping and a governed package of section content exist; the proven FDA AcroForm form-fill machinery exists (IND Forms 1571/1572/3674). What is *missing* is the official filled eSTAR PDF and a single canonical assembly contract (device spec §1). So today's monetizable surface is **readiness and gap intelligence**, not "we file it for you."
- **Value mechanism (defensible):** readiness scoring concentrates an RA team's effort on the *actual* gaps to a complete submission, and the draft-vs-official distinction (carried in text + icon, never color alone — HF spec) prevents the expensive error of treating an internal package as submittable. We sell *fewer rejected/incomplete filings and faster gap closure*, sized to the customer's filing volume.
- **Honesty boundary to price against:** the UI and the entitlement must never imply transmission where there is none. Assembly readiness is advisory + packaging; it is sold as such.

### 2.3 Global-market planning

- **What is real:** a self-contained registry of the world's major regulated device/IVD markets plus pure readiness scoring, and a per-market planner that composes registry + readiness into a dossier/pathway/readiness/actions plan — **honest by construction, asserting no transmission**. Beyond FDA/EMA/PMDA, the platform is *knowledge-only* (no gateway, no assembly) for Health Canada, NMPA, ANVISA, TGA, MFDS, MHRA, Swissmedic, India (audit §1; device spec §1.4).
- **Value mechanism (defensible):** a global expansion decision normally requires assembling fragmented, country-specific regulatory knowledge — typically billable consulting hours per market. The planner replaces the first, repetitive pass of that research with a structured, current per-market plan, leaving experts to do judgment work. We sell *consulting-pass replacement per market*, quantified against the customer's current spend, and we are explicit that for non-FDA/EMA/PMDA markets this is planning intelligence, not submission.

### 2.4 AnA advisory

- **What is real:** a new, self-contained advisory layer the regulatory-intelligence assistant calls for grounded device/IVD + global-market guidance — pure, deterministic, no LLM fabrication, never a transmission claim. The governance rule (audit §Step 8) is that AnA *calls the deterministic engine for all numbers/governed content* and only adds natural-language framing; it never invents figures.
- **Value mechanism (defensible):** advisory turns the platform's structured intelligence into answers in the user's flow, lowering time-to-first-answer for an RA or PM question. We sell *grounded answers in context*, with the trust property that the numbers are engine-derived and auditable.

---

## 3 — Feature → tier entitlement matrix

### 3.1 The real tiers (as found in code)

The platform keys on exactly **four** tier ids. Confirmed in:
- `server/services/usage-metering.ts` — `TIER_CREDITS` keys: `free`, `standard`, `professional`, `enterprise`.
- `server/services/billing.ts` — `DTC_PRICING[].tier`, `PRICING[].tier`, and `provisionModulesForTier`'s `tierLevel` map (`free: 0, standard: 1, professional: 2, enterprise: 3`).

The same four ids carry different *display names* per pricing surface, but the entitlement layer uses the canonical id:

| Canonical tier id | DTC display name | Industry display name (pharma/medtech) | Academic display name |
|---|---|---|---|
| `free` | Researcher (free) | — | — |
| `standard` | Startup Biotech ($499/mo) | Standard | Research ($149/user) |
| `professional` | Growth ($1,499/mo) | Professional | Department |
| `enterprise` | Enterprise (custom) | Enterprise (custom) | Institution |

The companion module's `Tier` union is exactly `'free' | 'standard' | 'professional' | 'enterprise'`. No tier is invented.

### 3.2 The matrix

Minimum tier that unlocks each NEW capability (this is the single source of truth in `mdx-entitlements.ts` and is enforced by tests):

| Feature key | Capability | Free | Standard | Professional | Enterprise | Min tier |
|---|---|:---:|:---:|:---:|:---:|---|
| `report_families` | Governed report families (Exec/Board, RA Lead, QA/Audit) | — | ✅ | ✅ | ✅ | **standard** |
| `device_assembly_readiness` | Device & IVD submission-assembly readiness | — | ✅ | ✅ | ✅ | **standard** |
| `global_market_planner` | Global-market submission planner | — | ✅ | ✅ | ✅ | **standard** |
| `ana_advisory` | AnA device & global-market advisory | — | ✅ | ✅ | ✅ | **standard** |
| `prediction_forecast_report` | Regulatory Forecast (prediction-backed) | — | — | ✅ | ✅ | **professional** |
| `crl_rtf_premortem` | CRL/RTF Pre-Mortem (prediction-backed) | — | — | ✅ | ✅ | **professional** |
| `scheduled_reports` | Scheduled & drift-triggered reports | — | — | ✅ | ✅ | **professional** |
| `portfolio_rollup` | Portfolio / cross-account rollup reporting | — | — | — | ✅ | **enterprise** |

### 3.3 Rationale (aligned to the actual credit shape in `usage-metering.ts`)

- **Entry value at `standard`** (report families, device assembly readiness, global planner, AnA advisory). `standard` is where the credit grid first turns features on (e.g. `csr_builder: 10`, `biologics_intelligence: 20`). Free is preview-only by design (`free` has almost everything at `0` credits). The new capabilities' *advisory/readiness/planning* surface is the entry hook of a paid plan.
- **Prediction-backed reports at `professional`.** `ctd_builder` is `0` at `free`/`standard` and only opens at `professional` (`25`) — the platform already treats the heaviest, most differentiated work as professional-tier. The Regulatory Forecast and CRL/RTF Pre-Mortem are the prediction moat (audit §2.6: their credibility is corpus-gated and their value is highest); they belong at the same premium tier. Scheduled/drift automation is a scale feature, not an entry feature, so it sits here too.
- **Portfolio rollup at `enterprise`.** Cross-pathway / cross-account aggregation is the CRO and holding-company surface; the audit calls multi-account aggregate reporting partial and enterprise-shaped (audit §"Enterprise/cross-org reporting"). It maps to the tier whose credits are unlimited (`-1`).

This entitlement layer is intentionally **separate from credit metering**. Entitlements answer *"is this feature available at all on this plan?"*; `usage-metering.ts` answers *"how many runs remain this period?"* The gating UX (§4) consults entitlements first, then metering.

---

## 4 — Honest gating UX (locked, never dead)

The HF spec is explicit: states must read truthfully, never as a fabricated success or a silent failure, and color is never the only channel. The gating UX follows the same rules.

1. **Locked features show an upgrade path, never a dead button.** A feature above the current tier renders as an enabled, labeled affordance with a **Locked** status pill (text + icon + shape, not color alone — HF spec §"Color is never the only channel"). Activating it opens an honest panel: what the feature does, the **minimum tier required** (`featureTier(feature)` from the module), and a single next step (start a trial / upgrade / contact sales for `enterprise`). It never appears as a disabled, reasonless control.
2. **The minimum tier shown is the real one.** The panel reads its required tier from `featureTier(feature)` and its current entitlement from `isEntitled(feature, currentTier)`. Because the module is pure and tested, the upgrade copy can never name a fabricated tier or a wrong minimum.
3. **Two distinct "you can't do this right now" states, never conflated.**
   - *Not entitled* (feature above tier) → the **Locked / upgrade** path above. Owned by this entitlements layer.
   - *Entitled but out of credits* (feature available on the plan, period quota exhausted) → the existing `usage-metering.ts` `QuotaCheck` path: show remaining/limit and, when `upgradeRequired` is set, the same calm upgrade affordance. This is a *usage* state, not a *capability* state, and the copy says so.
4. **Enterprise = contact, not checkout.** `enterprise` pricing is custom in `billing.ts` (`baseMonthly: 0`, custom). Locked `enterprise` features (e.g. `portfolio_rollup`) route to "contact sales", not a self-serve checkout, matching billing reality.
5. **Honest microcopy.** Calm, factual, second person, sentence case, no cheerleading (HF spec §"Voice & tone"). Empty/locked states describe what will appear after upgrade; they never overstate the capability (e.g. global planning for non-FDA/EMA/PMDA markets is described as *planning intelligence*, never *submission*).
6. **Gating never weakens the honesty moat.** A locked prediction report still, in preview, communicates that outputs carry confidence/freshness and degrade honestly at cold-start — the upgrade sells the *honest* forecast, not a promise.

**How this ties to existing metering.** The order of checks for any new-capability action is: (a) `isEntitled(feature, tier)` from this module — if false, Locked/upgrade; (b) if entitled, `checkQuota(orgId, featureId)` from `usage-metering.ts` — if blocked, the out-of-credits state. Two independent, honest gates; neither fabricates the other's reason.

---

## 5 — Out of scope / open pricing questions

**Out of scope for this slice**
- Stripe price-id wiring for the new features, and any change to existing tier *credit numbers* in `usage-metering.ts` (this layer is capability gating only; it does not set quotas).
- Mapping new features into `usage-metering.ts` `TIER_CREDITS` (e.g. should `prediction_forecast_report` consume credits, and how many per run). The entitlement minimum tier is set; the per-run credit cost is a separate, deliberate decision.
- Any UI implementation; §4 is a contract for the UI, not the UI.
- Submission *transmission* for any market — explicitly never asserted (audit §1; global-markets/AnA modules are "honest by construction").

**Open pricing questions (for the next pricing review)**
1. **Credit metering for prediction reports.** Should `prediction_forecast_report` / `crl_rtf_premortem` be metered (like `deep_research`) on top of the `professional` gate, or unlimited within the gate? Recommended: meter them, because corpus-backed runs have real cost and metering reinforces deliberate use.
2. **Device assembly readiness vs. future assembly.** Today's monetized surface is *readiness/advisory*. When the official filled eSTAR (device spec §2) ships, is it the same `device_assembly_readiness` entitlement at a higher tier, or a new `device_assembly_submit` feature key? Recommended: a new key, so the honesty boundary (advise vs. assemble vs. transmit) stays legible in the matrix.
3. **Global planner market coverage by tier.** Should non-FDA/EMA/PMDA *planning* (knowledge-only markets) be gated identically to the core three, or be a higher-tier "global expansion" add-on? Open; depends on corpus depth per market.
4. **Portfolio rollup granularity.** Is cross-*program* rollup a `professional` feature while cross-*account* rollup stays `enterprise`? Currently both sit under one `enterprise` `portfolio_rollup`; splitting is a future option.
5. **CRO/consultancy packaging.** Reseller/multi-client packaging may warrant a dedicated commercial motion rather than a tier — to be decided with the enterprise sales model.
6. **Corpus-readiness gate on prediction GA.** Per the audit, prediction-report *credibility* is gated by running corpus ingestion. A pricing/marketing decision is needed on whether prediction reports are sold before the corpus sweep is complete (recommended: sell only the honest cold-start behavior until ingestion lands, never a high-confidence forecast on a thin corpus).
