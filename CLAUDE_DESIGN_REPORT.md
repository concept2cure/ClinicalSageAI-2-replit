# Report to Claude Design — backend shipped, and what the UI needs

**From:** Claude Code (backend) · **Branch:** `concept2cure-v2` · **Audience:** Claude Design

This is the master index for a session of backend work. It summarizes what now
exists beneath the UI, what the UI must build on top, and the prerequisites to go
live. Three detailed, per-surface advisories carry the exact endpoint/payload
contracts — **read those before building each surface**:

- `AI_GOVERNANCE_UI_ADVISORY.md` — the Trust/governance surface + the groundedness review gate.
- `PV_UI_ADVISORY.md` — the eight-tab Pharmacovigilance surface.
- `COMMITMENTS_UI_ADVISORY.md` — the regulatory-commitments surface.

Per `CLAUDE.md`, design each surface in `ui_kits/` first. Tokens, sentence case,
no emoji, Claude orange once per screen, Lucide, 200ms ease-out — all still apply.

---

## 1. What shipped (backend), and the UI it unlocks

### A. AI governance / trust (GxP credibility)
Per-capability governance contract (intended use, risk tier, human-oversight,
groundedness threshold, GxP flag) on `ana_capability_registry`; reproducibility
logging at the gateway (model, prompt hash/version, temperature, seed, fallback
chain); model cards + version-pinning lockfile + a model-swap **drift gate**; a
**groundedness → human-review gate**; daily audit-chain integrity sweep; model
cards / evidence pack generators.
- **UI to build:** a **Trust surface** (capabilities register with risk-tier
  badges, model cards, drift status, audit-chain "verify" + last-sweep result,
  eval scorecards) and — highest priority — the **groundedness review-gate UX**
  (handle `422 GROUNDEDNESS_REVIEW_REQUIRED`, show score vs threshold + intended
  use, require a human-review acknowledgement + reason-for-change to proceed).
- Read endpoints for the Trust surface partly exist now (`/api/c2c/governance/*`,
  landed off this advisory); the rest are listed in the governance advisory §3.4.
- Generated artifacts to render/link: `docs/ai-governance/{MODEL_CARDS,EVIDENCE_PACK,LLM_GXP_VALIDATION,CONTROL_TRACEABILITY_MATRIX}.md`.

### B. Pharmacovigilance — eight tabs, now genuinely persistent
Fixed a latent bug (the service queried tables that were never created → silent
no-op) by creating the tables the service uses; added the **E2B(R3) intake fields
end-to-end** (MedDRA PT/code/SOC, suspect product, expectedness vs RSI, reporter,
narrative, case status), a **MedDRA lookup**, **Submit-to-triage** (assigns the
reporting clock + writes a Part-11 audit), and the **day-6-of-15 reporting clock**.
- **UI to build (8 tabs):** Cases (MedDRA-coded ICSR line listing + clock) ·
  Case intake (E2B(R3) form + MedDRA PT picker + Save-draft/Submit-to-triage) ·
  Reporting (PBRER/PSUR/DSUR/PADER + gateway ACK) · RMP · Signals · ICSR clocks ·
  PSUR/PBRER · Benefit-risk. Endpoints + shapes in `PV_UI_ADVISORY.md §3`.

### C. Regulatory commitments — the post-approval lifecycle loop
New `c2c_commitments` model (inbound PMR/PMC/REMS/Annex-II/522 + outbound
self-made), **source-anchored extraction** from documents, governed status
tracking with Part-11 audit, an **outbound contradiction check** ("the minutes
committed to X but the submission did Y"), and a **promote-to-task** spec builder.
- **UI to build:** a commitments surface — register (inbound/outbound, clocks),
  extract→review with **inline source quotes**, track-to-closure, contradiction
  findings, inspection view. Endpoints in `COMMITMENTS_UI_ADVISORY.md §3`.

### D. Biopharma — the four submission pathways
All four are real workstreams with live surfaces and AnA coverage: **NDA·505(b)**
and **BLA·351(a)** are rich; **MAA·EU-centralized** is good; **JNDA·Japan** I
brought toward parity (fixed a capability-matching bug; added `draft-jnda-section`
+ `draft-bridging-strategy`). No new UI needed — the surfaces exist. JNDA's deeper
structural depth (pyramid, PMDA Module-1 subsections, `jnda:pmda` authoring
outline) remains a backend follow-up (~5–7 days), not UI.

---

## 2. Cross-cutting contracts the UI relies on

- **Governed actions + reason-for-change.** Mutations route through
  `/api/c2c/actions/*` (or feature routes) and require a `reason` (≥8 chars);
  high-risk (sign/lock) require re-auth via the e-sign modal. Reuse the
  `regulatory-compliance-ux` patterns.
- **The 422 groundedness gate.** `accept-ai-suggestion` (and the legacy authoring
  accept) returns `422 GROUNDEDNESS_REVIEW_REQUIRED` with `{ gate, riskTier,
  groundednessThreshold, groundednessScore, intendedUse }`; the UI resolves it by
  re-submitting with `groundednessReviewAck: true` + a reason.
- **Part-11 audit + provenance.** Status changes write a SHA-256 hash-chained
  `audit_logs` row; the governance verdict (model/score/source/review) is
  persisted on the action payload — surface it as a provenance disclosure.
- **Clocks are status, not alarm** — calm treatments; only a genuine overdue /
  breached / day-6-draft is a focal escalation.

---

## 3. Prerequisites before the UI goes live (operator/CI, not UI)

1. **Apply the migrations** — the three `20260603` migrations (governance / PV /
   commitments) are raw `.sql` and are **not auto-applied on boot**. Run
   `APPLY_C2C_MIGRATIONS=true npm run db:apply-c2c` against the preview/prod DB
   (idempotent), then verify. Until then the features degrade to empty/in-memory.
2. **Enable enforcement (optional)** — `AI_GROUNDEDNESS_ENFORCE=1`,
   `ENABLE_AUDIT_CHAIN_CHECK=true` (documented in `.env.example`).
3. **Load the MedDRA dictionary** per org — the PT picker returns nothing until
   the licensed dictionary is ingested.

---

## 4. What's NOT done (so the UI doesn't assume it)

- Groundedness gate **records but doesn't block by default** — the client must
  pass `capabilityKey` + content/score on accept calls for it to bite (and/or the
  org enables enforcement).
- New tables have **no DB-level RLS** (app-layer org scoping only).
- Eval harnesses are **seed-only** (per-document-type accuracy "not yet measured"
  — model cards say so; don't render fabricated numbers).
- Benefit-risk / DLP-schedule / signal-disproportionality are **schema-only** (no
  endpoints yet); `reg_obligations` and `c2c_commitments` not yet reconciled;
  `extract_commitments` is a service+route, not a formal AIActionType.
- The PV gateway ACK automation (MDN parsing) and commitment→task auto-creation
  into the tasking table are documented follow-ups.

---

## 5. Suggested cross-surface build order
1. **Groundedness review-gate UX** (live enforcement point; changes user flow today).
2. **PV Cases + Case intake** (the operational heart; backend fully persistent now).
3. **Commitments** extract→review (highest differentiating value).
4. **Trust surface** (Capabilities + Model cards render from docs/endpoints today).
5. PV remaining tabs · commitments tracking/inspection · provenance disclosures.

Open questions for the designer: add them under a new section in the relevant
per-surface advisory; I answer the backend ones and add any missing read endpoints.
