# Living Record Spine

> Status: foundational architecture · Owner: platform data architecture · Date: 2026-06-03
>
> This document turns three slogans into mechanisms:
> 1. "Living record" — an explicit object graph, not a metaphor.
> 2. "The Claim is the unit of truth" — a first-class table with a lifecycle.
> 3. "A value entered once agrees everywhere" — a canonical fact store and a
>    reconciliation engine, not a rule.
>
> It is additive. It composes with the wired claim graph (`evidence_claims` /
> `evidence_claim_links`), the cascade router (`server/services/living-file/
> change-router.service.ts`), the freshness read model
> (`server/services/living-file/freshness-report.service.ts`), and the governed
> action ledger (`c2c_ana_actions` + `audit_logs`). It forks none of them.

---

## 0 · Why this exists

Before this spec, the platform had the *plumbing* of a living record but not its
*substance*:

- A wired claim graph — `evidence_claims` (lifecycle `status`, `isCurrent`,
  `code`, supersession) and `evidence_claim_links` (typed `supports` /
  `contradicts` / `references` adjacency to documents and sections).
- A working cascade — `propagateRegulatoryChange` fans an upstream change
  (`claim_changed`, `evidence_superseded`, `standard_withdrawn`, …) out to every
  downstream propagator and to `reactive-dependency-service`.
- A staleness read model — `programFreshnessReport` reports `fresh` / `stale` /
  `needs_evidence` / `superseded` / `expired` across artifact tables.

The gap was that all of this is **artifact-status-centric**. Freshness flips a
`conformance_status` enum on a row; the cascade marks a packet `STALE`. Nothing
holds *the single agreed value* for a quantity, so:

- A `Claim` is **text only** — `evidence_claims` has `claim_text` but no
  normalized `(entity, field, value, unit)`. There is nothing to be consistent
  *about*.
- "Enrollment is 186" in §2.5 and "184 efficacy-evaluable" in §14.1 are two
  unrelated strings. No structure knows they are the same quantity, or that one
  drifted from the other.
- Drift is only ever detected when a human or a status-flip already declared it.
  No job independently re-derives drift by comparing a document value to its
  source of truth.

The Living Record Spine adds the **value layer underneath the existing cascade**:
an explicit graph, a first-class claim that carries a value, a canonical fact
store, and a reconciliation engine whose Drift Sentinel job compares bound
document values to their canonical fact and hands divergence to the cascade that
already exists.

---

## 1 · The object spine (the explicit graph)

The living record is this chain. Each node is a real table; each edge is typed.

```
Program
  └─ Product
       └─ Substance | Device
            └─ Submission
                 └─ Sequence
                      └─ Document
                           └─ Section
                                └─ Claim ───asserts──▶ EvidenceValue (canonical fact)
                                     │                        ▲
                                     └─supported_by─▶ SourceArtifact ─establishes┘
```

### 1.1 Node → canonical table

The codebase grew several candidates per node. This table names the **one
canonical home** for each, so future work stops forking. Where a node was
missing it is created here; where it was fragmented the canonical choice is
named and the others are marked legacy-to-reconcile.

| Node | Canonical table | Id | Status |
|---|---|---|---|
| Program | `regulatory_programs` | uuid | canonical (also legacy `core.programs`; reconcile to this) |
| Product | `regulatory_programs.product_*` + `drug_products` | — | partial — Product is today a facet of Program; FK spine tracked in `spine_edges` |
| Substance / Device | `drug_substances` / `medical_devices`, `device_profiles` | — | orphaned FKs — expressed via `spine_edges` until hard FKs land |
| Submission | `c2cSubmissionPackages` / pathway tables | — | fragmented — canonical pointer is the `submission:` typed target |
| **Sequence** | **`regulatory_sequences`** | uuid | **new (this spec)** — the eCTD sequence node that was missing |
| Document | `c2c_documents` (current) / `documents` (legacy) | text / serial | canonical = `c2c_documents` |
| Section | per-framework (`cer_sections`, `cmc_module3_sections`, …) + `evidence_claim_links.section_id` | varies | canonical adjacency is `evidence_claim_links` |
| **Claim** | **`evidence_claims`** | serial | **canonical, elevated by this spec** (value columns added) |
| **EvidenceValue** | **`canonical_facts`** | uuid | **new (this spec)** — the single agreed value |
| SourceArtifact | `evidence_sources` | serial | canonical |

Two integer-keyed program/org scoping columns (`program_id`, `organization_id`)
are the spine's tenant boundary, matching `evidence_claims`. New spine tables
follow that exact scoping so they join without a cast.

### 1.2 Edge vocabulary

One canonical edge schema, versioned and confidence-scored, as the data audit
asked for ("one graph API and one canonical edge schema with confidence/version
lineage"). Edges are recorded in `spine_edges` (overlay registry) and, where a
typed table already exists, in that table.

| Edge | From → To | Backing |
|---|---|---|
| `contains` | Program → … → Section | `spine_edges` + native FKs |
| `asserts` | Claim → EvidenceValue | `fact_bindings` (claim-kind binding) |
| `supports` / `contradicts` / `references` | Claim → Document/Section | `evidence_claim_links.link_type` |
| `supported_by` | Claim → SourceArtifact | `evidence_claims.source_id` |
| `establishes` | SourceArtifact/Claim → EvidenceValue | `canonical_facts.established_by_*` |
| `derives` | EvidenceValue → EvidenceValue | `fact_bindings.binding_kind='derived'` |
| `supersedes` | Claim → Claim, Fact → Fact | `*.supersedes_id` / `superseded_by_claim_id` |
| `binds_to` | Document value → EvidenceValue | `fact_bindings` (target-kind binding) |

`spine_nodes` / `spine_edges` are a thin **overlay registry**: a node row points
at a concrete table row by `(node_kind, entity_id)`, an edge row connects two
node rows with `edge_kind`, `confidence`, and `version`. The overlay lets the
spine be traversed and validated as one graph without a destructive migration of
the existing tables. It is the seam future hard FKs can collapse into.

---

## 2 · The Claim, elevated to first-class

`evidence_claims` already exists and is wired. This spec elevates it from "a
sentence we extracted" to "the unit of truth that powers verification, cascade,
audit, and consistency simultaneously," by giving it two things it lacked: a
**value** and a **lifecycle contract**.

### 2.1 The value (new columns on `evidence_claims`)

A claim is an assertion. To be reconcilable it must say *what* it asserts in
structured form, not only prose. Added (all nullable, idempotent):

| Column | Meaning |
|---|---|
| `entity` | the subject the claim is about (`study_201.enrollment`, `drug_x.shelf_life`) |
| `field` | the attribute (`n_randomized`, `months`, `mg`) |
| `value_num` / `value_text` | the asserted value (numeric when possible, text otherwise) |
| `unit` | unit of `value_num` (`subjects`, `months`, `mg`) |
| `comparator` | `=`, `≥`, `≤`, `~`, `range` — how the value relates to the entity |
| `value_type` | `count` / `measure` / `date` / `categorical` / `boolean` / `text` |

`(program_id, entity, field)` is the join key into the canonical fact store. A
claim that fills these columns can be reconciled; one that does not stays a prose
claim and is simply never bound.

### 2.2 The lifecycle

The Claim has two orthogonal status axes. Both are enforced by a single state
machine (`server/services/living-record/claim-lifecycle.ts`), and every
transition is a governed action through the existing `/api/c2c/actions/transition`
ledger — no transition writes the row without an `audit_logs` entry.

**Content axis** (`evidence_claims.status`, already present):

```
            ┌──────────────┐
proposed ──▶│  supported   │──┐
   │        ├──────────────┤  │
   ├───────▶│ unsupported  │  ├──▶ withdrawn
   │        ├──────────────┤  │
   └───────▶│ contradicted │──┘
                   │
                   └──────────────────▶ superseded (by a newer claim)
```

**Verification axis** (`evidence_claims.verification` — new):

```
unverified ──▶ verified ──▶ drifted ──▶ verified   (re-reconciled)
     │                          │
     └──────────────────────────┴──▶ disputed (fact has competing claims)
```

- `unverified` — has a value, no canonical fact resolved yet.
- `verified` — its value equals the bound canonical fact.
- `drifted` — the Drift Sentinel found its value diverges from the fact.
- `disputed` — two active claims assert different values for the same fact.

Legal transitions, guards, and the audit action for each are defined in
`CLAIM_LIFECYCLE` (code) and asserted by `claim-lifecycle.test.ts`. Illegal
transitions throw; they never silently no-op.

### 2.3 What the Claim now powers

Because a claim carries a value, a provenance edge to evidence
(`evidence_claim_links` / `source_id`), and a lifecycle, one structure powers all
four product promises at once:

- **Verification** — does the claim's value equal its canonical fact? (§3)
- **Cascading update** — when the fact moves, every claim bound to it drifts and
  the cascade fires. (§3.4)
- **Audit** — every lifecycle transition is a governed `audit_logs` row.
- **Consistency** — two active claims on one `(entity, field)` with different
  values is a `disputed` fact, surfaced like any contradiction.

---

## 3 · The canonical fact store + reconciliation engine

Named components (the user asked for names):

- **Canonical Fact Store** — `canonical_facts`. The single agreed value per
  `(program, entity, field)`.
- **Derived-Value Bindings** — `fact_bindings`. What points at a fact and how.
- **Reconciliation Engine** — `server/services/living-record/
  reconciliation-engine.ts`. Folds claims into facts on write; detects drift.
- **Drift Sentinel** — `runDriftSentinel`, the scheduled job that writes
  `fact_drift` rows and hands divergence to the cascade.

### 3.1 Canonical Fact Store — `canonical_facts`

One **active** row per `(program_id, entity, field)` (partial unique index on
`status='active'`). It records the agreed value, the claim or source that
established it, a confidence, a content hash, and a supersession chain. When a
fact's value changes a new version is written and the prior is `superseded` —
the store is therefore itself a living, append-friendly record, not a mutable
cell.

A fact is the normalized form of `evidence_claims`'s new value columns:
`{ entity, field, value_num | value_text, unit, comparator, value_type }`.

### 3.2 Derived-Value Bindings — `fact_bindings`

A binding says "this location should agree with this fact." The location is a
typed target pointer, reusing the existing mutation-primitive vocabulary
(`claim:`, `document:`, `section:`, `paragraph:`). Binding kinds:

- `mirror` — the target should show the fact's value verbatim.
- `derived` — the target shows a transform of the fact (`transform` JSONB names
  the function and inputs, e.g. round, unit-convert, sum-of-facts).
- `manual_override` — the target intentionally differs; drift is suppressed but
  the override and its reason are recorded (Part 11 reason-for-change).

`observed_value` is the last value seen at the target. `binding_status` is
`bound` / `drifted` / `overridden` / `broken` (target no longer resolves).

### 3.3 The reconcile-on-write path (Reconciliation Engine)

When a claim with a value is created or transitioned:

1. Resolve the active `canonical_facts` row for `(program, entity, field)`.
2. If none exists, the claim *establishes* the fact (the claim becomes the fact's
   `established_by_claim_id`); claim → `verified`.
3. If one exists and the claim agrees, the claim binds (`asserts`) and is
   `verified`; the fact's confidence is reinforced.
4. If one exists and the claim disagrees, the fact is marked `disputed`, both
   claims are `disputed`, and a consistency finding is raised. Resolution
   (which value wins) is a governed action — the engine never silently overwrites
   an agreed value.

`reconcileClaim` returns a structured verdict (`established` / `agreed` /
`disputed`) so callers and the harness can assert behavior without a database.

### 3.4 The Drift Sentinel (the job, and the cascade)

`runDriftSentinel(programId)`:

1. Loads every `bound` / `derived` binding for the program with its fact.
2. For each, compares `observed_value` to the fact's canonical value using the
   pure `detectDrift` comparator (numeric tolerance, unit match, transform
   applied for derived bindings).
3. Writes a `fact_drift` row for each divergence (`value_mismatch`,
   `unit_mismatch`, `stale_source`, `missing_target`), sets the binding to
   `drifted`, and sets any bound claim's `verification` to `drifted`.
4. Hands each drift to the **existing** cascade by calling
   `propagateRegulatoryChange({ event: 'claim_changed' | 'evidence_changed', … })`
   — so defense packets, GSPR mappings, standards applicability, and reactive
   dependencies all restale through the path that already exists. The Sentinel
   adds the *value* signal; the cascade does the fan-out it always did.

`detectDrift` is pure and total; `reconciliation.test.ts` covers tolerance,
unit mismatch, derived transforms, and the no-drift case without a database.

Drift is a read of `fact_drift` (`programFactDriftReport`), and is designed to be
folded into `programFreshnessReport` as a `canonical_fact` artifact bucket so the
living record's value-drift shows up beside artifact staleness. (Seam noted in
the freshness service; folding it in is the only follow-up this spec defers.)

### 3.5 Governed Fact Change (the push path)

The Sentinel is pull: it discovers divergence after the fact. The
**Fact-Change Orchestrator** (`fact-change-orchestrator.ts`, exposed at
`/api/change-propagation`) is push: an operator changes a governed value once
and the platform propagates it under governance.

1. **Preview** — `previewFactChange` classifies every citation
   (`fact_binding`) of the value against the proposed change using the pure
   `classifyBindingImpact` (`fact-change.ts`): `will_drift`, `consistent`,
   `override`, or `not_evaluable`. Overrides and non-evaluable transforms are
   shown, not hidden — the operator sees the full blast radius before acting.
2. **Apply** — `applyFactChange` re-versions the fact via
   `supersedeAndReversion` (history kept; a `disputed` fact may be re-versioned
   to resolve the dispute). **Bindings are carried forward to the new
   version** — without the carry-forward, `fact_bindings.fact_id` would keep
   pointing at the superseded row and the citation set would be orphaned at the
   exact moment the value changed.
3. **Flag** — each now-divergent citation gets a `fact_drift` row immediately
   (`detected_by = 'fact_change'`), its binding goes `drifted`, and bound
   claims' `verification` goes `drifted` — no waiting for the next sweep.
4. **Cascade** — each drifted claim fans out through
   `propagateRegulatoryChange({ event: 'claim_changed', … })`, the same path
   the Sentinel uses.
5. **Govern** — a resolution plan (`trigger 'impact_propagation'`, recommended
   path `harmonize`) is opened listing every affected object, so the
   propagated update travels through review/re-approval rather than as silent
   edits. Requires the legacy program link; skipped (and reported) otherwise.
6. **Audit** — `canonical_fact.governed_change` is written to the audit trail
   with the operator's required reason-for-change, both values, and the
   propagation digest. Operator-declared values enter through
   `establishGovernedFact` (`canonical_fact.established`), which refuses to
   overwrite an existing active fact.
7. **Propagate** — `propagateFactToCitations`
   (`POST /facts/:factId/propagate`) writes the agreed value into every
   divergent **claim** citation: the claim's structured value is set to the
   fact's, verification returns to `verified`, the binding heals to `bound`,
   and the open drift rows resolve — audited as `canonical_fact.propagated`.
   Prose targets (`section:`/`paragraph:`/`document:`) are deliberately
   skipped (reported with reason `prose_target`): running text changes travel
   the resolution rewrite workflow, never a mechanical edit. Manual overrides
   are never overwritten. The pure eligibility rule is
   `propagationEligibility` (`fact-change.ts`).

### 3.6 Source Tracer

`source-tracer.ts` resolves the declared chain
`cited location → fact → establishing claim → source artifact` to actual rows
— the walk §1 promises but the graph read surfaces previously stopped short
of (claim traversals returned `evidence_sources` ids unresolved):

- `GET /api/change-propagation/facts/:factId/trace` — the fact, its
  establishing claim (`established_by_claim_id` resolved), the source
  artifact (`evidence_sources`: file, page count, content hash), and every
  citation each resolved back to its own source.
- `GET /api/change-propagation/bindings/:bindingId/trace` — the reverse walk
  from a single cited location back to the source artifact.

### 3.7 Document Citations (binding facts to CTD/IND sections)

Until a governed fact is bound to a document section, the change-propagation
machinery is dead for pharma dossiers: the reconciliation engine only ever
binds `claim:` targets, so a value change reached the claim graph but no CTD/IND
document. `document-binder.ts` closes that:

- `POST /facts/:factId/bind-section` — an operator/AI declares that a document
  section cites a fact, creating a `fact_binding` with a `section:<docRef>:<key>`
  or `document:<docRef>` target. A mirror citation whose value already
  disagrees is flagged immediately (`fact_drift`, `detected_by='citation_scan'`).
- `POST /programs/:programId/artifacts/:artifactId/scan-citations` — auto-detect
  the facts a CTD artifact's prose cites: `extractNumericalFacts` pulls the
  labelled numbers, `matchCitationsToFacts` (pure, in `document-citations.ts`)
  maps each to an active fact by label↔field affinity and compares values.
  Preview by default; `persist:true` binds the matches and flags any that
  already diverge. This is the inconsistency-intelligence entry point for
  existing dossiers — it finds the sections that cite a value and the ones
  where that value has already drifted.

Once a section is bound, `applyFactChange`, the Drift Sentinel, the source
tracer, and the freshness report all see it for free. Drift on a document- or
section-bound value surfaces in `programFreshnessReport` under a
`document_section` bucket, beside the device artifact buckets, so a stale CTD
section reads in the same health model as a stale defense packet.

### 3.8 The conversational surface (AnA tools)

The engine above is reachable from chat through five AnA tools
(`server/services/ana/changePropagationTools.ts`, handlers in
`AnaToolExecutor.ts`), so an operator can ask "what happens if the sample size
changes to 120?" and drive the governed fix in conversation:

- `list_governed_facts` — the program's canonical values (find the factId).
- `preview_fact_impact` — the read-only blast radius of a proposed change.
- `apply_fact_change` — the governed mutation (re-version → flag → cascade →
  resolution plan); requires an explicit reason-for-change.
- `trace_fact_to_source` — the Source Tracer.
- `explain_resolution_plan` — the structured explanation of the plan the change
  opened, grounded strictly in the stored plan.

All are org-scoped from the tool context; the mutation carries the same
reason-for-change contract as the REST route.

---

## 4 · Mapping to the §13 quality bars

The quality bars are no longer aspirations because each now names a mechanism.

| Quality bar (intent) | Mechanism in this spec |
|---|---|
| A value entered once agrees everywhere | `canonical_facts` + `fact_bindings` + Drift Sentinel |
| Every assertion is traceable to evidence | `evidence_claims.source_id` + `evidence_claim_links` (`asserts` / `supported_by`) |
| Changes cascade to everything affected | Drift Sentinel → `propagateRegulatoryChange` (existing cascade) |
| Contradictions are detected, not discovered late | `disputed` facts + reconcile-on-write |
| Every change is auditable | governed transitions via `c2c_ana_actions` + `audit_logs` |
| The record is current, or it tells you it is not | `verification` axis + `programFactDriftReport` |

---

## 5 · Composition, non-goals, and rollout

**Composes with (does not replace):**
- `evidence_claims` / `evidence_claim_links` — extended with value + verification.
- `change-router.service.ts` — the Sentinel calls it; it is the cascade.
- `freshness-report.service.ts` — gains a canonical-fact bucket (seam noted).
- `c2c_ana_actions` / `audit_logs` — every transition and resolution flows here.
- `contradiction-engine-service.ts` — `disputed` facts are a contradiction source.

**Non-goals (explicitly out of scope here):**
- Collapsing the three evidence representations (`evidence.*` schema,
  `evidence_objects`, `evidence_*`) into one — this spec names the canonical one
  (`evidence_*`) and builds on it; the merge is a separate migration.
- Hard FKs from Substance/Device/Product to Program — expressed via `spine_edges`
  now; hardened later.
- Extraction of values into `evidence_claims` columns at scale — the extraction
  worker populates them going forward; backfill is a separate job.

**Rollout:**
1. Migration `migrations/20260603_living_record_spine.sql` (idempotent) —
   new tables, claim columns, indexes, drift view.
2. Drizzle module `shared/schema/living-record-spine.ts` (types) — exported via
   `shared/schema/index.ts`.
3. Engine `server/services/living-record/*` + tests.
4. Reconcile-on-write and the sweep are wired: `reconcileClaimById(claimId)`
   resolves the uuid program via the program-id bridge
   (`living_record_program_links`) and reconciles; `startDriftSentinelSchedule()`
   runs the periodic sweep on boot behind `ENABLE_DRIFT_SENTINEL`. Routes live
   under `/api/regulatory-graph/*`.

---

## 6 · Data-model reference

See `migrations/20260603_living_record_spine.sql` for authoritative DDL and
`shared/schema/living-record-spine.ts` for the typed mirror. Summary:

- `regulatory_sequences` — the eCTD Sequence node (program-scoped, ordered,
  status `planning|compiling|validated|submitted|superseded`).
- `canonical_facts` — the fact store (one active per program+entity+field).
- `fact_bindings` — derived-value bindings (typed target, kind, transform,
  observed value, status).
- `fact_drift` — Drift Sentinel output (expected vs observed, type, severity,
  resolution).
- `spine_nodes` / `spine_edges` — the canonical graph overlay (node kind +
  entity pointer; typed, versioned, confidence-scored edges).
- `evidence_claims` += `entity`, `field`, `value_num`, `value_text`, `unit`,
  `comparator`, `value_type`, `verification`, `canonical_fact_id`.
- `living_record_program_links` — bridges the integer claim program
  (`evidence_claims.program_id`) to the uuid fact program
  (`regulatory_programs.id`) so a claim reconciles from its id alone. There is no
  native FK; the link is explicit and operator/UI-populated, and reconcile
  no-ops when it is absent rather than guessing a mapping.
