# Handoff to design — Living Record Spine, surfaces needed

> For Claude design. The Living Record Spine backend landed on `concept2cure-v2`
> (commit adding `server/services/living-record/*`, `canonical_facts` /
> `fact_bindings` / `fact_drift` / `regulatory_sequences`, and the value +
> verification columns on `evidence_claims`). Full design rationale is in
> `docs/architecture/LIVING_RECORD_SPINE.md`. This document lists only the
> surfaces the shipped backend now needs to reach human users, and the data each
> one binds to.
>
> Follow the design-system non-negotiables in `CLAUDE.md` / `README.md`: sentence
> case, no emoji, no exclamation marks, 13px body, Claude orange as the single
> focal point per screen (reserve it here for drift and dispute, nothing else),
> 200ms ease-out, Lucide icons, second person, numbers over adjectives. The
> governed-action surfaces below must follow the `regulatory-compliance-ux`
> pattern (visible audit trail, reason-for-change capture, e-signature on
> high-risk moves, immutable history).

---

## Why there is a handoff

The backend now holds, for each program, the single agreed value of every
quantity (a "canonical fact"), records which document locations are bound to it,
and runs a job (the Drift Sentinel) that flags when a bound value diverges from
its fact. None of this is visible to a human until a surface shows it. Until the
surfaces below exist, the trust the spine creates does not reach the user: a
reviewer still cannot see that enrollment says 186 in one section and 184 in
another, that a value is verified against its source, or that a fact is disputed.

Each surface maps to a concrete data structure that exists today. Where a read
route is not yet built, the proposed route contract is given and marked
**proposed (backend follow-up)** so design has a concrete shape to bind to. The
governed write actions already exist (`/api/c2c/actions/*` via the
`useC2cAction` hook and `EsignModal`); reuse them, do not invent new mutation
paths.

## The five things a human must now be able to see

1. **A value's verification state** — is this number verified against its
   canonical fact, drifted from it, disputed, or intentionally overridden.
2. **Open drift** — every place a document value no longer matches its fact,
   ranked by severity, with a way to resolve it.
3. **A dispute** — two claims assert different values for the same fact; which
   one becomes canonical is a governed decision.
4. **The canonical fact** itself — the single agreed value, what established it,
   and everything bound to it.
5. **Lineage** — from a value on screen down to the source artifact that proves
   it (the object spine, traversed).

---

## Surface 1 · Value verification state, inline in authored content

This is the headline surface. Everything else supports it.

**Backend contract:** every `evidence_claims` row now carries `verification`
(`unverified` | `verified` | `drifted` | `disputed`), a structured value
(`entity`, `field`, `value_num` / `value_text`, `unit`, `comparator`,
`value_type`), and `canonical_fact_id`. A `fact_bindings` row ties a document or
section location (`target` such as `section:doc_8a21f:m2.5`) to a fact, with
`binding_status` (`bound` | `drifted` | `overridden` | `broken`).

**Needed surface:** wherever an authored value appears in the document workbench
(`client/src/concept2cure/mdx/workbench/`), attach a quiet inline state chip to
bound values:

- `verified` — quiet. A small check, low-contrast. Not a focal point. The
  default, calm state.
- `drifted` — Claude orange. This is the one place orange earns the screen. A
  Lucide `triangle-alert`, the observed value, and the canonical value it should
  match.
- `disputed` — orange outline, distinct from drift. Signals "two sources
  disagree," not "this one is wrong."
- `overridden` — neutral, with a visible reason on hover (the Part 11 reason the
  override was recorded with).

**Why:** a verified number a reviewer can trust at a glance, and a drifted number
that announces itself, is the entire point of the spine. Keep verified quiet so
drift is legible.

**Empty/honesty state:** a value with no binding shows no chip at all — do not
imply verification that does not exist. Absence of a chip means "not yet a
tracked value," which is honest.

---

## Surface 2 · The drift inbox (reconciliation queue)

**Backend contract:** `fact_drift` rows, read per program. Proposed route:

- `GET /api/regulatory-graph/programs/:programId/drift` **proposed (backend
  follow-up)** — returns `programFactDriftReport(programId)`:
  `{ openDriftCount, bySeverity, drift: [{ id, factId, bindingId, expectedValue,
  observedValue, driftType, severity, detectedAt, target }], hasOpenDrift }`.

**Needed surface:** a per-program queue, sibling to the existing freshness view
(`GET /api/regulatory-graph/programs/:programId/freshness`). Each row: the target
(where), `expectedValue` vs `observedValue` (what), `driftType`
(`value_mismatch` | `unit_mismatch` | `stale_source` | `missing_target`), and
`severity`. Sort by severity. Resolving a row is a governed action — wire the
"Resolve" control to `useResolve()` (`/api/c2c/actions/resolve`,
`target: 'drift:<id>'`), which opens the reason-for-change capture; `high` /
`critical` severity must route through `EsignModal` re-auth.

**Where it attaches:** a new MDX surface alongside
`client/src/concept2cure/mdx/surfaces/` (for example a `LivingRecordSurface`),
and a compact count on `Overview.tsx` / project home.

**Why:** drift detected but not surfaced is the same as no drift detection. The
queue is the operator's "what is now out of agreement" list.

**Empty state:** "No open drift. Every bound value agrees with its source." No
celebration, no emoji — a calm, factual all-clear.

---

## Surface 3 · Dispute resolution

**Backend contract:** when two active claims assert different values for one
`(program, entity, field)`, the fact's `status` is `disputed` and both claims'
`verification` is `disputed`. The competing claims are readable via the existing
claim trace (`GET /api/regulatory-graph/claims/:claimId/evidence`).

**Needed surface:** a focused panel (not a full screen) that shows the two (or
more) competing values side by side, each with its provenance — the claim text,
its source artifact, confidence, and who entered it. The human picks the value
that becomes canonical. That choice is a governed sign-level action
(`useSign()` / `/api/c2c/actions/sign`, meaning `approval`), because it sets the
single source of truth: it must capture a reason and re-authenticate.

**Why:** the spine deliberately refuses to silently overwrite an agreed value.
The dispute surface is where a human, not the system, resolves the conflict — on
the record.

---

## Surface 4 · The canonical fact registry

**Backend contract:** `canonical_facts`, one active row per
`(program, entity, field)`. Proposed routes:

- `GET /api/regulatory-graph/programs/:programId/facts` **proposed (backend
  follow-up)** — list: `{ id, entity, field, value (num or text), unit,
  comparator, valueType, status, confidence, establishedByClaimId, version }`.
- `GET /api/regulatory-graph/facts/:factId/bindings` **proposed (backend
  follow-up)** — the bindings and drift for a fact.

**Needed surface:** a browsable, filterable table — the program's "facts of
record." Columns: entity.field, the value, status (`active` | `disputed` |
`superseded` | `retracted`), how many locations are bound, and how many are
drifted. This is the made-visible "single source of truth." A fact's row expands
to its bindings (Surface 5 lineage) and its version history (supersession is
already tracked via `supersedes_id`).

**Where it attaches:** the same new Living Record surface; also reachable from a
value chip ("see this fact").

**Why:** "a value entered once agrees everywhere" is only credible if a human can
open the list of those values and see their agreement and their history.

---

## Surface 5 · Value lineage (the object spine, traversed)

**Backend contract:** the spine is explicit — `spine_nodes` /`spine_edges`
overlay plus the native edges (`evidence_claims.source_id`,
`evidence_claim_links`, `canonical_facts.established_by_*`). The chain is
`Program → Product → Substance|Device → Submission → Sequence → Document →
Section → Claim → EvidenceValue → SourceArtifact` (see
`server/services/living-record/object-model.ts`).

**Needed surface:** a lineage drawer, opened from any value chip or fact row,
showing the path from the on-screen value down to the source artifact that
proves it: value → canonical fact → establishing claim → source document/section.
Read-only, quiet, audit-detail styling (like the reproducibility provenance
affordance in the study-protocol handoff). One node highlighted at a time; 200ms
ease-out on expand.

**Why:** lineage is what lets a client defend a number to a reviewer — "this
figure traces to CSR table 14.1.1." It is the spine's payoff made navigable.

---

## Surface 6 · Binding and manual override, from the editor

**Backend contract:** `fact_bindings` with `binding_kind` (`mirror` | `derived` |
`manual_override`). A `manual_override` requires `override_reason`. Governed
write via `/api/c2c/actions/*`.

**Needed surface:** extend the selection toolbar in the workbench (the same
inline-action pattern as the Moat #1 "Apply fix" control). On selecting a value:

- "Bind to fact" — link this location to its canonical fact (mirror binding).
- "This intentionally differs" — record a `manual_override` with a required
  reason. Reason capture is mandatory (Part 11 reason-for-change); the override
  then suppresses drift on that location but shows the neutral `overridden` chip
  from Surface 1.

**Why:** not every divergence is an error — sometimes a section quotes a
historical value on purpose. The override path lets a human say so, on the
record, instead of fighting the Drift Sentinel.

---

## Surface 7 · The Sequence node in dossier navigation

**Backend contract:** `regulatory_sequences` — the eCTD sequence node that was
missing from the spine. `{ id, sequenceNumber ('0000', '0001'), sequenceType,
status ('planning' | 'compiling' | 'validated' | 'submitted' | 'superseded'),
submittedAt }`, program-scoped and ordered.

**Needed surface:** surface the sequence level in submission/dossier navigation
(project home and the pathway shell), so a document is shown inside its sequence,
not floating under the program. Show the sequence number and status as a quiet
breadcrumb segment.

**Why:** regulated users think in sequences. The navigation should match the
object model now that the node exists.

---

## Surface 8 · Program living-record health, and the AnA dock

**Backend contract:** `programFactDriftReport` (open drift by severity) plus the
existing `programFreshnessReport`. New audit actions exist for the trail:
`c2c.claim.verify`, `c2c.claim.drift`, `c2c.claim.dispute`,
`c2c.claim.withdraw`, `c2c.claim.supersede`.

**Needed surfaces:**

- A compact health readout on `Overview.tsx` / project home: facts of record,
  open drift count (by severity), disputed facts. Numbers, not adjectives. Drift
  count is the only candidate for orange, and only when non-zero.
- AnA dock (`client/src/concept2cure/pdev/shell/AnaDock.tsx`): AnA should
  proactively surface new drift and disputes as governed-action cards ("3 values
  drifted from their source; review"), using the existing "Approve and run" card
  pattern wired to `useC2cAction`. The new `c2c.claim.*` actions should render in
  the audit-trail view like any other governed mutation.

**Why:** the health readout answers "is this program's record currently
trustworthy" in one glance; the dock makes resolution one action away from where
the user already works.

---

## Surface inventory

| # | Surface | Binds to | Read route | Status |
|---|---|---|---|---|
| 1 | Inline value verification chip | `evidence_claims.verification`, `fact_bindings` | served with section content | needs design |
| 2 | Drift inbox | `fact_drift` | `…/programs/:id/drift` (proposed) | needs design + route |
| 3 | Dispute resolution | disputed `canonical_facts` + competing claims | `…/claims/:id/evidence` (exists) | needs design |
| 4 | Canonical fact registry | `canonical_facts`, `fact_bindings` | `…/programs/:id/facts` (proposed) | needs design + route |
| 5 | Value lineage drawer | `spine_nodes`/`edges`, claim, source | `…/claims/:id/evidence` (exists) | needs design |
| 6 | Bind / override (editor) | `fact_bindings` | write via `/api/c2c/actions/*` (exists) | needs design |
| 7 | Sequence in dossier nav | `regulatory_sequences` | `…/programs/:id/sequences` (proposed) | needs design + route |
| 8 | Health readout + AnA dock | drift report, audit actions | exists / proposed | needs design |

---

## What design owns next

1. These are **new surfaces**. Per `CLAUDE.md`, a surface that is not yet in
   `ui_kits/` has not been designed — so the first move is to add the Living
   Record surfaces (drift inbox, fact registry, dispute panel, lineage drawer)
   and the value chip to `ui_kits/`, then hand the implementation contract back.
2. The governed-action surfaces (drift resolve, dispute sign, manual override)
   are the highest-compliance items — run them through the
   `regulatory-compliance-ux` and `accessibility-enforcement` skills before
   build. Reason-for-change and e-signature are not optional on these.
3. Confirm the proposed read-route shapes (Surfaces 2, 4, 7) so the backend
   follow-up builds exactly what the surfaces consume. The write side
   (`/api/c2c/actions/*`) is already there.

## Backend follow-ups this handoff assumes (not design's to build)

These are tracked on the backend side so design can bind against them:

- Read routes for facts, bindings, drift, and sequences under
  `/api/regulatory-graph/*` (shapes given above).
- Wire `reconcileClaim` into the claim write path so values reconcile on entry,
  and schedule `runDriftSentinel` per program so drift is detected continuously.
- Fold the fact-drift bucket into `programFreshnessReport` so Surface 8 reads one
  health model, not two.

Until those land, Surfaces 1, 4, 7, and 8 will have data only for programs whose
claims have been reconciled. Design to the populated state, but include the
honest empty state for the not-yet-reconciled case.
