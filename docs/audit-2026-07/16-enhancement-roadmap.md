# Chapter 16 — Enhancement roadmap: where to invest to win

Chapter 15 gets the product to *safe*. This chapter is about *valuable* — and they are
different questions. A platform can clear every gate in Chapter 14 and still lose every deal.

The competitive scoring per category lives in Chapter 13. This chapter is the strategic read
across it, grounded in what the audit actually found in the code.

---

## 16.1 The three real assets

Everything worth building next should compound one of these. They are the things this
codebase has that are genuinely hard to copy.

### Asset 1 — Honest degradation, enforced in code

This is the most valuable and least visible thing in the product.

The platform does not fabricate when it lacks grounds. Verified in code: the AI gateway
**throws in production** rather than serving demo content when no provider is configured
(`gateway.ts:531-537`); reject-lists match `/lorem ipsum/i` and "coming soon" before content
can be sealed (`governed-ana-execution.ts:43,47`); `qc.routes.ts` returns
`notImplemented:true` for Certificate-of-Analysis generation and batch release, **replacing
stubs that previously returned `{released:true}` unconditionally**; the submission gateway
returns `gateway_not_configured` rather than a fabricated ACK; the prediction layer returns a
network prior with `confidence: low` at cold start instead of a made-up number.

In a category where the buyer's fear is *"the AI will confidently invent a regulatory claim
and I will sign it"*, a tool that refuses is worth more than a tool that is fluent. The
repo's own strategy documents call this *"the actual moat"* and they are right.

**But it is currently unmeasured and invisible.** `eval:grounding` and
`ai:eval-doc-quality` exist and are invoked by **no workflow** (Chapter 11 §11.7). And the
28 result panels built to *show* verification state, seal status, concordance and
confidence — `VerificationPanel`, `SealBadge`, `ConcordancePanel`, `ReadinessGatePanel` — are
**dead code**, unreferenced by the shipping rail (Chapter 09 §9.4).

So the moat exists in the engine, is never measured, and is never shown to the buyer.

### Asset 2 — Breadth that is real, not slideware

697 registered tools. 94 files of Global RI domain logic across 39 routers. 65 files of IND
lifecycle. 57 of Report-OS. 49 of eCTD. Three OpenAPI specs. A 20-app registry spanning
governance, submission, CMC, nonclinical, clinical, biostatistics, device safety,
diagnostics, labeling, PV and market access.

Incumbents in this market typically sell **one** of those and integrate the rest. The breadth
is a genuine differentiator for a customer who would otherwise buy four systems — *if* it can
be reached, which today it largely cannot: 5 of ~101 surfaces are in the navigation.

### Asset 3 — Part 11 machinery that survives inspection

A SHA-256 audit chain with `SELECT … FOR UPDATE` anti-fork locking inside the caller's
transaction, a secret-keyed HMAC seal, a fail-closed boot matrix, and a **populated**
clause→code→test traceability matrix. Most competitors in the AI-native tier have none of
this and will need years to build it. Most incumbents that have it lack the AI layer.

**The combination is the position.** Neither half alone is defensible.

---

## 16.2 What to build, in order

### Tier 1 — Make the existing moat visible and measurable (weeks)

Highest return in the roadmap. All of it is surfacing work on capability that already exists.

| # | Investment | Why it wins |
|---|---|---|
| **E1** | **Ship a "why should I trust this?" surface.** Wire the dead verification panels into the rail: for any generated content — its sources, the grounding verdict, freshness, confidence with its denominator, seal state, and what the system *declined* to assert. | Converts an invisible engineering property into the thing a buyer evaluates in a demo. This is the single highest-leverage item in the audit. |
| **E2** | **Put the grounding evals in CI and publish the number.** `eval:grounding` and `ai:eval-doc-quality` already exist. Track hallucination rate, citation-verification pass rate and refusal rate over time. | An unmeasured moat is a hypothesis. A published, trending number is a procurement asset — and nobody else in this category publishes one. |
| **E3** | **Make refusal a feature, not an error.** When the system declines — insufficient corpus, missing dependency, unconfigured gateway — say what is missing and what would unblock it, rather than showing an empty state or a 501. | Turns the platform's most differentiated behaviour from a perceived defect into the reason to buy. |
| **E4** | **Surface the tool catalogue.** 697 tools with no picker. Ship discovery — by discipline, by document type, by regulatory question. | Breadth that cannot be found is not breadth. |

### Tier 2 — Convert breadth into a workflow (months)

| # | Investment | Why it wins |
|---|---|---|
| **E5** | **Pick one end-to-end journey and make it excellent.** Most credible on this codebase: **device/IVD 510(k)** — the assets are already deep (`cer2v/`, predicate intelligence in `shadow_service/`, eSTAR sections, `ivd-platform.openapi.json`). Source → evidence → drafted section → review → e-sign → assembled package, with grounding visible at every step. | Buyers do not buy 20 modules. They buy one job done end to end and then expand. A single flawless journey outsells broad partial coverage. |
| **E6** | **Cross-document consistency as a product surface.** The contradiction engine, concordance and consistency panels already exist in code. A "your Module 2.7 contradicts your CSR on the primary endpoint" alert is a genuinely differentiated capability. | This is the failure mode that causes real regulatory pain, and it is exactly what a multi-module platform — and *only* a multi-module platform — can catch. It is a direct argument against buying four point solutions. |
| **E7** | **Make the precedent/CRL corpus a first-class product.** The clinical-regulatory-evidence layer and CRL corpus exist but are flag-gated and demoted to `NAV_HIDDEN`. | "What did FDA actually say to companies like me?" is a question buyers pay consultants for today. |
| **E8** | **Retire or complete the half-offerings.** Translation has 31 service files, a mounted route and zero reachable UI. The regulatory digital twin is `Math.random()` behind an honest disclosure. Ship them or remove them. | Half-offerings cost credibility in a demo and maintenance forever. |

### Tier 3 — Platform leverage (quarters)

| # | Investment | Why it wins |
|---|---|---|
| **E9** | **Sell the API.** Three OpenAPI specs already exist (87 + 63 + 34 paths). A documented, versioned, entitlement-gated public API turns 556 orphaned endpoints from dead weight into a product. | Changes the ceiling from seats to platform. Also the cheapest path to CRO and consultancy channel revenue. |
| **E10** | **Multi-client architecture for CROs and consultancies.** Portfolio rollup and client-scoped workspaces are partially built. This segment buys many seats and resells the platform. | The account-level buyer with the most upside — but it demands the tenant isolation work in Chapter 15 §2.2 first, because they hold *competitors'* data side by side. |
| **E11** | **Validation-as-a-product.** Once IQ/OQ/PQ is executed (Chapter 15 §3.4), package the artifacts as a customer-facing validation pack. | Every regulated buyer must validate their vendor. Doing that work once, well, and handing it over shortens enterprise sales cycles materially. It converts the most expensive item on the remediation list into a revenue argument. |
| **E12** | **Fix the i18n story or drop the claim.** A global-language strategy document exists; 13 client files call a translation function. | Global submissions is a stated positioning. Today the UI is effectively English-only. |

---

## 16.3 What NOT to build

Discipline matters more than ideas here — this codebase's dominant failure mode is breadth
outrunning depth.

- **No new modules until the existing ~101 surfaces are navigable.** Adding a 21st app to a
  product with a 5-item rail makes the problem worse.
- **No new AI tools until the 697 existing ones have audited tenant scope** (Chapter 06
  §6.3.2) and a UI that can render their output.
- **Do not chase incumbent feature parity on publishing/validation.** Lorenz, Extedo and the
  established RIM suites have decades of accumulated edge-case handling in eCTD publishing.
  Integrate with validators rather than rebuilding them.
- **Do not weaken the honest-degradation behaviour to demo better.** It is the moat. Every
  instinct in a sales cycle will push toward making the system answer confidently when it
  should refuse. Resist it — and instead do E1/E3, which make refusal *look* like the
  sophisticated behaviour it is.

---

## 16.4 The strategic read

The audit's technical finding and its commercial finding are the same finding.

**Technically:** the hard parts are built and the connective tissue is missing — RLS
compiled but inert, controls built but unscheduled, 697 tools with no UI, 15 schemas the
installer never creates, gates that pass on a crash.

**Commercially:** the differentiated capability is built and the connective tissue is
missing — a grounding engine nobody can see, breadth nobody can navigate, Part 11 machinery
that cannot be claimed because the system is unvalidated, and an honest-degradation property
that is never measured and therefore cannot be sold.

Both are convergence problems, not invention problems. That is a far better position than
the reverse, and it is the single most important thing for a buyer to understand about this
asset: **the expensive, slow, hard-to-copy work is largely done. What remains is the work of
connecting it — and of proving it, which is the part this codebase has consistently deferred.**
