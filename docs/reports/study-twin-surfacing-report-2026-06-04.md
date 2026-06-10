---
title: Study digital twin + AnA simulation — Claude Design surfacing report
date: 2026-06-04
audience: Claude Design
branch: concept2cure-v2
basis: feature shipped this session (9ebef46) — service + AnA tool + REST + migration
module: study / protocol design (the `protocol` rail item / Intelligence · Protocol)
status: backend loaded + wired; UI to build
---

# Study digital twin + AnA simulation — what's built, and what the UI needs

The backend for **study digital twins** is built, tested, and on `concept2cure-v2`.
This report tells Claude Design what exists (so you surface it) and what UI to
build, grounded in the real contracts — including the two product non-negotiables
that are enforced in code so the UI must render them.

---

## 1. What shipped (backend)

A **study digital twin** is a persisted `StudyDesign` object (the design-as-data
spine — phase, indication, objectives, endpoints, framework, population, arms,
statistical plan, safety). AnA **simulates** a twin to predict outcomes —
probability of success on the primary endpoint, expected effect vs. the powered
assumption, enrolment/dropout feasibility, and the top design risks — **across any
therapeutic area and any phase (FIH→4)**.

**The probability of success is computed by a deterministic, seeded simulation
engine** (`simulateTrial` — Monte Carlo assurance cross-validated against the
closed-form integral, type-I error calibrated under the null), **not guessed by a
language model.** The effect prior is built from the client's structured CSR history
when available, otherwise from the design's own effect assumption — flagged as an
assumption, never laundered as data. The design's defensibility gates ride along
(risk level + blocking findings). When the design lacks what an honest simulation
needs (an effect assumption, a sample size, a controlled comparison), the twin
reports **no probability** and says why — it never fabricates one. So the result is
a faithful, reproducible projection (it carries a provenance seed), not a second
weaker estimate.

**Two non-negotiables, enforced in the service (the UI must surface them):**
1. **Mandatory disclaimer** — every simulation result carries `disclaimer`
   (`STUDY_TWIN_DISCLAIMER`): an AI estimate, not a guarantee of outcome, not
   regulatory advice, confirm with a biostatistician. There is no flag to suppress
   it.
2. **CSR/history upload prompt** — when the org has no learnable history, the
   result carries `needsHistoryUpload: true` + `historyRequest`
   (`HISTORY_UPLOAD_REQUEST`) asking the client to upload prior CSRs/records so AnA
   can learn from and cite them.

Two entry paths, both live:
- **Conversational** — AnA tool `simulate_study_design` (agentic): AnA runs the
  simulation in chat and the tool result already embeds the prediction + disclaimer
  (+ upload request when applicable).
- **Programmatic** — REST `/api/c2c/study-twin` (create / list / simulate).

---

## 2. Contracts the UI binds to

**REST** (`/api/c2c/study-twin`, org-scoped via JWT):
- `POST /` — create a twin. Body: `{ design: StudyDesign, projectId?, programId? }` → `{ id, title }`.
- `GET /` — list twins → `{ twins: [{ id, title, phase, indication, status, updated_at }] }`.
- `POST /:id/simulate` — run a simulation. Body: `{ question? }` →
  ```
  {
    prediction: string,          // prose composed FROM the computed figures (render as the summary)
    quantitative?: {             // present when a probability could be computed (else absent — show why)
      probabilityOfSuccess,      // 0–1, from the seeded engine — the headline number
      powerAtPlanned,            // 0–1, power at the planned point effect (contrast)
      effectBasis,               // 'evidence' | assumption kind — drives the grounding badge
      riskLevel,                 // design defensibility risk
      canAdvance,                // true = no approval-blocking findings
      provenanceSeed             // reproducibility seed
    },
    disclaimer: string,          // ALWAYS present — render it attached to the result
    needsHistoryUpload: boolean, // true → show the upload-CSR CTA
    historyRequest?: string,     // the upload ask, present iff needsHistoryUpload
    grounded: boolean,           // grounded on uploaded history vs general priors
    phase: string,
    indication: string
  }
  ```
  Note: `prediction` is composed from the computed figures (probability, expected-effect
  interval, type-I error under the null, defensibility, top risks) — it is not free prose.
  When `quantitative` is absent, the design was insufficient for an honest number; surface
  the missing inputs rather than a fabricated figure.

**Conversational**: the `simulate_study_design` AnA tool (in `ALL_ANA_TOOLS`). Input
fields the model fills: `phase, indication, product_type, structural_design,
control_type, inferential_frame, primary_endpoint(+_type), planned_sample_size,
power, alpha, dropout_rate, effect_size, question`. The tool result string contains
the prediction, the disclaimer, and the upload request — render those faithfully.

**The twin object** = `StudyDesign` (`server/services/study-design/study-design-types.ts`)
— the canonical shape your builder form edits.

---

## 3. What Claude Design must build (the surfaces)

| Surface | Purpose | Binds to | Verdict |
|---|---|---|---|
| **Twin builder/editor** | Capture/edit a `StudyDesign` (phase, indication, endpoints, framework, statistical plan) | `POST /` + the `StudyDesign` shape | BUILD |
| **Twins list** | Browse the org's twins (name, phase, indication, status) | `GET /` | BUILD |
| **Simulate runner + results panel** | Run a simulation and render the **computed `quantitative` figures** — probability of success as the headline (with power-at-planned as a contrast), the expected-effect interval and type-I error from the `prediction` summary, the **defensibility/risk** state, the **grounding/effect-basis** badge (evidence vs assumption), and the **provenance seed** — plus the **always-visible disclaimer** and (when `needsHistoryUpload`) the **upload-CSR CTA**. When `quantitative` is absent, show the missing inputs, not a number | `POST /:id/simulate` | BUILD (highest value) |
| **CSR/history upload affordance** | The CTA the upload prompt drives — wire to the existing project upload → knowledge/CSR learning flow | `POST /api/concept2cure/documents/upload` (existing) | BUILD (wire to existing) |
| **Conversational rendering** | When AnA runs `simulate_study_design` in chat, render the prediction + disclaimer + upload prompt as a structured card, not a raw blob | the AnA tool result | BUILD |

---

## 4. Non-negotiables for the UI (regulated + product)

- **The disclaimer is always rendered, prominently, and is not dismissible into
  oblivion.** Every result payload carries `disclaimer` — show it attached to the
  prediction (not hidden behind a tooltip). This is a compliance requirement, not a
  style choice.
- **The upload-CSR prompt is a real CTA, not prose.** When `needsHistoryUpload`,
  surface `historyRequest` with a button that opens the upload flow (prior CSRs /
  study records) for the active project — that's how AnA learns. Tie it to the
  existing upload → project-knowledge path.
- **Grounding transparency.** Show whether the prediction was grounded on uploaded
  history (`grounded: true`) or rests on general priors (`false`, lower confidence).
  Do not present a priors-only prediction as if it were evidence-grounded.
- **No false precision.** The probability is a seeded-simulation estimate with
  uncertainty (carry the expected-effect interval and the power contrast); do not
  render a single point estimate as a certainty. When the design is insufficient and
  `quantitative` is absent, show **why** (the missing effect assumption / sample size
  / controlled comparison) — never invent a number to fill the gap.
- **Show the effect basis.** Render whether the prediction's prior was
  evidence-grounded (`effectBasis: 'evidence'`, with the CSR sources) or an assumption
  — an assumption-based number is honest only if it is labelled as one.
- **Surface defensibility.** `canAdvance: false` (blocking findings) must be visible
  next to the probability — a good-looking number must not hide a broken design.
- **Voice + tokens + motion + a11y** (design constitution): sentence case, no emoji,
  no exclamation marks, second person, numbers over adjectives; one restrained teal
  accent; 200ms ease-out; Lucide; WCAG 2.2 AA. Predictions and risk are status
  colors — never color alone (pair with label/icon).

---

## 5. Where it lives

The study/protocol design module — the home rail's `protocol` item / the
Intelligence cluster **Protocol** surface (`client/src/concept2cure/intelligence/`).
The twin builder + simulate runner are a new surface there; the conversational path
renders inside the existing AnA chat/dock.

---

## 6. Honest status

- **The simulation works now and is deterministic** — the probability comes from
  the seeded `simulateTrial` engine, not a model provider, so the headline number is
  reproducible and available without an LLM key. AnA's `simulate_study_design` tool
  and the REST `:id/simulate` both return the computed `quantitative` figures +
  disclaimer (+ upload request). Design and wire the results panel against this live.
- **The number strengthens with real CSRs** — the effect prior is grounded on the
  client's structured CSR history (`gatherCsrEffectEvidence`); with no history it is
  an explicit assumption (lower confidence, and the upload CTA fires).
- **REST persistence goes live when** `migrations/20260604_study_twins.sql` is
  applied in the running env (idempotent; preview/CI loop). Until then the
  create/list and run-persistence calls error while the simulation itself still
  returns — design the surfaces now; persistence lights up on migrate.

The contract for the UI is §2–§4; the disclaimer and the CSR-upload CTA are the two
things that must never be optional.
