# AI governance — UI advisory for Claude Design

**Audience:** Claude Design (the design system).
**Author:** Claude Code (backend).
**Status:** backend shipped on `concept2cure-v2`; UI not started (this advisory directs it).

This advisory tells you (1) **what exists** in the backend AI-governance layer,
(2) **what the UI must do**, and (3) **every dependency** the UI binds to. Per
`CLAUDE.md`, design these surfaces in `ui_kits/` first; do not build product code
until the kit ships. No backend in this advisory needs your changes except the
read endpoints called out explicitly in §3.4 (those are mine/operator's to add —
they are flagged so you can design against the contract now).

---

## 1. What exists (the substrate you design over)

A complete AI-governance backend now ships. Four controls, all on
`concept2cure-v2`:

1. **Per-capability governance contract** — every AnA capability has an
   intended-use statement, risk tier (`minimal|low|moderate|high`), human-
   oversight mode (`none|suggest_only|requires_review|requires_approval`), a
   groundedness threshold, and a GxP flag.
   `server/services/ai-governance/risk-tiers.ts`; columns on
   `ana_capability_registry`.
2. **Reproducibility** — the AI gateway logs model, model/prompt version, prompt
   SHA-256 hash, temperature, seed, and fallback chain per request
   (`ai.gateway_audit_log`). Models are version-pinned with a drift gate
   (`ai-governance/approved-models.ts`).
3. **Groundedness → human-review gate** — generated claims are scored; below a
   capability's threshold, acceptance is blocked until a human acknowledges
   review. `ai-governance/{groundedness,review-policy}.ts`.
4. **Eval + model cards** — `server/eval/{rag,doc-quality}/`;
   `docs/ai-governance/MODEL_CARDS.md`.

Reference docs (read these; they are the source for the UI's content/strings):
- `docs/ai-governance/EVIDENCE_PACK.md` — auto-generated current-state snapshot.
- `docs/ai-governance/MODEL_CARDS.md` — per-model cards.
- `docs/ai-governance/LLM_GXP_VALIDATION.md` — narrative.
- `docs/ai-governance/CONTROL_TRACEABILITY_MATRIX.md` — control → regulation map.

---

## 2. What the UI must do

Design four things. The first is the new surface; the rest layer onto existing
surfaces (authoring, audit, admin).

### 2.1 Governance / Trust surface (new) — fits the MDX/admin tier

A read-only, inspector-facing surface (think "trust center"). Tabs:

1. **Capabilities** — table of every AnA capability: name, category, **risk-tier
   badge**, human-oversight mode, groundedness floor, GxP flag, intended-use
   statement (expandable). Filter by risk tier / category. This is the
   per-feature intended-use + risk register a regulated buyer asks to see.
2. **Models** — render the model cards: id, provider, **pinned version**,
   governance role (primary/fallback), quality tier, context window, intended
   use, known limitations, eval status. Plus a **drift status** banner
   (PASS/FAIL) for "no unreviewed model swap."
3. **Audit integrity** — a **"Verify audit chain"** action that calls the verify
   endpoint and shows intact / broken-at-row, plus the last scheduled-sweep
   result and timestamp.
4. **Evaluation** — per-document-type scorecards (extraction F1, generation
   coverage) and RAG metrics, with the honest "seed-stage / not yet measured"
   state shown where applicable. Never invent a number.

### 2.2 Groundedness review gate UX (highest priority interaction)

When the user accepts AI-generated content and the server returns **422
`GROUNDEDNESS_REVIEW_REQUIRED`**, the UI must **not** show a generic error. It
must present a governed review step:

- Show: the groundedness **score vs. the threshold**, the **risk tier**, and the
  **intended-use** statement (all in the 422 body, §3.2).
- Require the reviewer to read the content, then **confirm human review** — which
  re-submits the same accept with `groundednessReviewAck: true` **and a
  reason-for-change** (≥ 8 chars). This is a Part 11 governed action: reuse the
  existing reason-for-change / e-sign confirmation pattern (see the
  `regulatory-compliance-ux` skill). For `requires_approval` capabilities, route
  to the e-signature flow.
- After acceptance, the governance verdict (score, source, reviewer ack) is
  recorded in the ledger — surface it in history (§2.3).

### 2.3 AI provenance / disclosure on accepted content

Wherever AI-generated content is shown or its history is viewed (authoring
provenance popovers, audit log), surface the **`aiGovernance` verdict** that is
persisted on the action payload (§3.3): model context, groundedness score +
source, risk tier, whether review was acknowledged. This is the "which model /
which prompt / which sources produced this claim" disclosure.

### 2.4 Reproducibility drill-down (audit surface)

In the audit/admin view, for a generation, show the reproducibility record from
the gateway audit log: provider, model, **model/prompt version**, **prompt
hash**, temperature, seed, and the **fallback chain**. (Needs the read endpoint
in §3.4.)

---

## 3. Dependencies (exact contracts)

### 3.1 Accept endpoint (exists)

`POST /api/c2c/actions/accept-ai-suggestion` — body (`ActionEnvelope`):

```jsonc
{
  "target": "section:cerv2:123",        // typed pointer (required)
  "reason": "Accepting AnA draft",       // required, >= 8 chars
  "payload": {
    "capabilityKey": "draft-csr",        // drives the governance contract
    "category": "drafting",              // optional; refines lookup
    "content": "<the accepted text>",    // enables accept-time groundedness scoring
    "groundednessScore": 0.91,           // optional explicit score (0..1 or 0..100); always enforced
    "enforceGroundedness": true,         // opt in to blocking on a low computed score
    "groundednessReviewAck": true        // set by the review step to clear the gate
  },
  "idempotencyKey": "..."                // optional
}
```

Success → `200 { actionId, auditId, sha256Chain, state }`.

### 3.2 The 422 gate contract (exists) — design for this

```jsonc
{
  "error": "GROUNDEDNESS_REVIEW_REQUIRED",
  "gate": "review_required",             // or "approval_required"
  "riskTier": "high",
  "groundednessThreshold": 0.8,
  "groundednessScore": 0.55,
  "intendedUse": "…statement…",
  "detail": "Groundedness 0.55 is below the 0.80 threshold…"
}
```

The UI resolves it by re-POSTing the same accept with `groundednessReviewAck:
true` + reason. High-risk (`sign`/`lock`) actions also return `401` with
`WWW-Authenticate: ReAuth required` — reuse the e-sign modal.

### 3.3 Persisted governance verdict (exists, in the ledger payload)

`c2c_ana_actions.payload.aiGovernance`:

```jsonc
{
  "capabilityKey": "draft-csr", "category": "drafting",
  "riskTier": "high", "humanOversight": "requires_review",
  "groundednessThreshold": 0.8, "groundednessScore": 0.55,
  "groundednessAssessed": true, "groundednessSource": "computed", // explicit|computed|none
  "groundednessEnforced": true, "citationCoverage": { "coverage": 0.55, "claims": 11, "cited": 6 },
  "gate": "review_required", "requiresHumanReview": true,
  "reviewAcknowledged": true, "blocked": false, "evaluatedAt": "ISO-8601"
}
```

### 3.4 Read endpoints the UI needs — NOT yet built (my/operator's follow-up)

Design against these shapes; I will add the read routes (they do not exist yet):

- `GET /api/c2c/governance/capabilities` → rows from `ana_capability_registry`
  incl. `intended_use, risk_tier, human_oversight, groundedness_threshold,
  gxp_applicable`.
- `GET /api/c2c/governance/models` → model cards (the shape produced by
  `server/services/ai-governance/model-cards.ts` `buildModelCard`).
- `GET /api/c2c/governance/drift` → `{ ok, findings[] }` from `detectModelDrift`.
- `GET /api/c2c/governance/audit/:requestId` → the gateway reproducibility record
  (`ai.gateway_audit_log` columns).
- `GET /api/c2c/governance/eval` → latest RAG + doc-quality scorecards.

`GET /api/c2c/actions/verify-chain` (audit integrity) **already exists**.

### 3.5 Data field reference (for table columns / detail panes)

- `ana_capability_registry`: `capability_key, category, name, description,
  intended_use, risk_tier, human_oversight, groundedness_threshold,
  gxp_applicable`.
- `ai.gateway_audit_log`: `provider, model, prompt_hash, prompt_version,
  temperature, seed, tried_models, input_tokens, output_tokens, latency_ms`.
- `c2c_ana_actions`: `command, target, risk, state, payload (incl. aiGovernance),
  proposed_by, decided_by, decision_reason, audit_row_id`.

### 3.6 Operator-facing config (surface as read-only status, not toggles)

- `AI_GROUNDEDNESS_ENFORCE=1` — enforce computed groundedness org-wide.
- `ENABLE_AUDIT_CHAIN_CHECK=true` — enable the daily integrity sweep.
- npm: `ai:model-cards`, `ai:evidence-pack`, `ai:eval-doc-quality`,
  `ci:gateway-bypass`.

---

## 4. Design-system non-negotiables (from `CLAUDE.md` / `README.md`)

- Sentence case everywhere; no Title Case, no ALL CAPS (except 10px metadata).
- No emoji, no exclamation marks, no cheerleading. Second person ("you").
- Body 13px; max title 18–24px. Numbers over adjectives.
- Claude orange (`#d97757`) once per screen, for the single focal point.
- Lucide icons only. 200ms ease-out motion; no bounce/spring.
- Risk tiers and gate states are **status, not alarm**: use the calm status
  treatments, not red warnings, except for an actual audit-chain break or a
  blocked-for-review state (which is informational, not an error).

## 5. Suggested build order

1. Groundedness review gate UX (§2.2) — it is the live enforcement point and the
   one interaction that changes user flow today.
2. Governance / Trust surface §2.1 tabs Capabilities + Models (static-friendly;
   can render from the docs until §3.4 endpoints land).
3. Provenance disclosure §2.3 on authoring/audit.
4. Audit integrity §2.1.3 + reproducibility drill-down §2.4 once §3.4 ships.

Open questions for the designer go in this file under a new "Open questions"
section; I will answer the backend ones and add the §3.4 endpoints to match.
