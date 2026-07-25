# ADR-0007: Canonical operating-system schema (assumptions and decisions)

## Status

**Proposed — SUPERSEDED IN PART, revision required**

> **WO-02 update (2026-07-25).** The core recommendation below — adopt the
> Drizzle-typed schema as canonical — is **contradicted by execution-path
> evidence gathered after this ADR was drafted.** See
> `docs/architecture/C2C_SCHEMA_AND_ENUM_CONFLICT_LEDGER.md` §C-9.
>
> In short: `migrations/0010_operating_system_foundation.sql` has **no execution
> path**. It is not journaled (`migrations/meta/_journal.json` has one entry),
> `shared/schema.ts` does not export `./schema/operating-system` so `drizzle-kit
> push` never creates it, and `apply-c2c-migrations.mjs` does not include it. The
> **raw-SQL shape is what deploys.**
>
> Adopting the Drizzle shape would therefore migrate production data away from the
> shape that exists and toward one that has never run. **Decide the direction
> against C-9 before executing anything in this ADR.** The alternative previously
> recorded as "Option A: adopt the raw-SQL shape" is now the leading candidate.
>
> The parts of this ADR that remain valid regardless of direction: splitting
> `domain_track` into modality vs. discipline, keeping decision action/approval/
> escalation orthogonal, eliminating raw SQL in favour of typed access, and the
> ADR-0010 test tier.


- Date: 2026-07-24
- Deciders: control-tower session (WO-00); requires human approval
- Technical Story: WO-00 conflicts C-1, C-2, C-7

## Context

`assumption_records` and `decision_records` are each defined **twice**, with
mutually incompatible DDL, in the two competing migration lineages (see ADR-0006).
Both use `CREATE TABLE IF NOT EXISTS`, so the physical shape is decided by
deployment history.

### `assumption_records`

| | `migrations/0010_operating_system_foundation.sql:84` | `db/migrations/20260323_assumption_decision_contradiction.sql:12` |
|---|---|---|
| identity | `name`, `description` | `assumption_code`, `title` |
| value | `value_type`, `numeric_value`, `text_value`, `json_value` | `assumed_value TEXT` |
| category | pgEnum, 12 modeling values (`effect_size`, `variance`, `attrition`, `multiplicity`…) | TEXT CHECK, 17 domain values (`efficacy`, `dosing`, `manufacturing`, `cost`…) |
| confidence | `strong`/`moderate`/`provisional`/`uncertain` | `definitive`/`high`/`moderate`/`low`/`speculative` |
| status | pgEnum `draft`/`review`/`approved`/`superseded`/`rejected` | not enum-typed |
| `domain_track` | `biotech`/`device`/`diagnostics`/`combination`/`biosimilar` (**modality**) | `clinical`/`nonclinical`/`cmc`/`biostatistics`/… (**discipline**) |
| FKs | `organizations`, `projects`, `concept2cure_artifacts` | none |

`category` overlaps in 4 of 17 values. **`domain_track` overlaps in zero** — the
same column name carries two unrelated concepts.

### Two live consumers, different assumptions

- `shared/schema/operating-system.ts:146` (Drizzle) → the `migrations/0010` shape.
- `server/services/assumption-registry-service.ts` (raw SQL at `:224`, `:297`,
  `:351`, `:365`, `:466`, `:479`, `:498`, `:557`) → the `db/migrations/20260323` shape.

The service writes status values `active`, `under_review`, `withdrawn`,
`challenged` (`:56`, `:316`). **None exist in the `assumption_status` pgEnum.** If
the `migrations/0010` table won, every such write fails at runtime.

### `decision_records` (C-2) and service drift (C-7)

Same collision pattern. Additionally, `decision-record-service.ts:40-46` uses
action states `proposed`/`approved`/`rejected`/`executed`/`escalated`, while
`decisionActionStateEnum` defines
`recommended_only`/`prepared`/`executed`/`rejected`/`superseded` — overlap of 2 of 5.

The service writes `actionState: 'approved'` (`:265`, `:450`) and `'escalated'`
(`:274`, `:477`). The schema models approval as a **separate** orthogonal enum
(`decision_approval_state`) and escalation as a **third** (`decision_escalation_state`).
The service collapses three state machines into one column. This is a semantic
conflict, not a naming mismatch.

A third concept, `ai_kernel_decision_records`
(`db/migrations/20260324_ai_kernel_decision_records.sql:5`), does not collide but
must be classified.

### Why this was never caught

`server/services/__tests__/operating-system.test.ts:31` calls
`vi.mock('../../db')`, replacing the entire Drizzle surface with stubs. The suite
passes (98 tests green at this SHA) **without touching a real schema**.
`/api/operating-system` has no client consumer. Nothing — no user, no test — has
driven this stack against a real database.

## Decision

We will:

1. **Wait for the ADR-0006 environment survey.** The deployed shape decides which
   definition is real. Choosing on aesthetics risks reinterpreting regulated
   history (master §9).
2. **Adopt the Drizzle-typed schema (`shared/schema/operating-system.ts`) as the
   canonical contract**, because it carries real enums, real foreign keys to
   `organizations`/`projects`/`concept2cure_artifacts`, and is the shape the
   type system already enforces repo-wide.
3. **Preserve both vocabularies via explicit mapping**, not by discarding one:
   - `domain_track` splits into two columns — `modality_track` (biotech/device/…)
     and `discipline_track` (clinical/cmc/biostatistics/…). They are different
     facts and must not share a column.
   - `category` becomes the union of both vocabularies, with a documented
     mapping table for the 13 values unique to the raw-SQL side.
   - `confidence` maps 5→4 with an explicit, reviewed table; no silent collapse.
   - `status` maps `active`→`approved`, `under_review`→`review`,
     `withdrawn`→`rejected`, `challenged`→`review` **only if** the survey shows
     no semantic loss; otherwise the enum is extended.
4. **Keep decision action, approval, and escalation as three orthogonal columns.**
   `decision-record-service.ts` is rewritten to set them independently. The
   collapsed single-column model is not preserved.
5. **Rewrite `assumption-registry-service.ts` onto Drizzle**, eliminating raw SQL
   against these tables. Raw SQL is what allowed the vocabularies to diverge
   undetected.
6. **Classify `ai_kernel_decision_records`** as canonical-separate, transitional,
   or dead before WO-03; it must not become a fourth decision store.
7. **Add schema-contract tests** per ADR-0010 that run against a real database, so
   an enum divergence fails CI rather than passing against a mock.

## Consequences

### Positive

- One shape, one vocabulary, type-enforced end to end.
- Runtime enum failures become compile-time errors.
- Unblocks WO-01 and WO-03; makes the Proof Packet's assumption/decision
  aggregation implementable.
- Splitting `domain_track` fixes a genuine modeling error, not just a collision.

### Negative

- Data migration for whichever shape is deployed, with regulated-history risk.
- `assumption-registry-service.ts` (640 lines) and `decision-record-service.ts`
  (515 lines) both require substantial rewrites.
- 7 downstream consumers must be updated in step:
  `operating-system-integration.ts`, `contradiction-engine-service.ts`,
  `contradiction-consequence-service.ts`, `governance-boundary-service.ts`,
  `routes/operating-system.ts`, `routes/assumption-decision-contradiction.ts`,
  `routes/governed-intelligence-inconsistency-routes.ts`.
- The confidence 5→4 mapping is lossy in one direction and needs sign-off from
  someone who owns the regulatory meaning.

### Neutral

- API response shapes change; `/api/operating-system` has no client consumer, so
  external breakage is limited — but per master §2 the change still requires
  contract tests and migration notes.

## Alternatives Considered

### Option A: Adopt the raw-SQL shape as canonical

**Description:** Keep `assumption_code`/`title`/`assumed_value` and the discipline
`domain_track`; regenerate the Drizzle schema from it.

**Pros:**
- The service layer is already written against it.
- Its `category` vocabulary is more domain-legible (`efficacy`, `dosing`).
- Its 5-level confidence scale is finer-grained.

**Cons:**
- No foreign keys — loses referential integrity to organizations, projects, artifacts.
- `TEXT CHECK` instead of enums — weaker typing, harder to evolve.
- `assumed_value TEXT` erases the numeric/text/json/range distinction, which the
  statistical engines need.

**Why not chosen:** Losing FKs and typed values in a regulated system is a larger
cost than rewriting two services. **Revisit if the survey shows this is the
deployed shape with material row counts.**

### Option B: Keep both, add a compatibility view

**Description:** Retain both tables; expose a view.

**Pros:** No data migration; both services keep working.

**Cons:** Two sources of truth for the same regulated fact. Directly violates
master §2 ("do not add a parallel regulated-artifact lifecycle") and §9.

**Why not chosen:** Institutionalizes the defect.

### Option C: Widen the enums to accept both vocabularies

**Description:** Add `active`, `under_review`, etc. to `assumption_status`.

**Pros:** Smallest change; unblocks writes immediately.

**Cons:** Produces a status enum with two synonyms for the same state
(`active`/`approved`). Does nothing about `domain_track` carrying two concepts,
or about decision states collapsing three machines into one.

**Why not chosen:** Papers over a semantic conflict — explicitly warned against in
the conflict ledger.

## Implementation Notes

```ts
// domain_track splits — these are different facts
modalityTrack:   domainTrackEnum('modality_track'),        // biotech | device | …
disciplineTrack: disciplineTrackEnum('discipline_track'),  // clinical | cmc | …

// decision states stay orthogonal — never collapsed
actionState:     decisionActionStateEnum('action_state'),      // recommended_only | prepared | executed | …
approvalState:   decisionApprovalStateEnum('approval_state'),  // not_required | pending_review | approved | …
escalationState: decisionEscalationStateEnum('escalation_state'),
```

Mapping tables live in `shared/schema/operating-system-compat.ts`, are exported,
and are covered by contract tests so the mapping is reviewable rather than
implicit.

## Related Decisions

- [ADR-0006](0006-canonical-migration-lineage.md) — **must be decided first**.
- [ADR-0001](0001-use-drizzle-orm-over-prisma.md) — Drizzle as ORM.
- ADR-0008 — contradiction stores reference these tables.
- ADR-0010 — the test tier that prevents recurrence.

## References

- `docs/architecture/C2C_SCHEMA_AND_ENUM_CONFLICT_LEDGER.md` (C-1, C-2, C-7)
- `docs/architecture/C2C_CANONICAL_SERVICE_AND_STORE_MAP.md` §5

---

## Revision History

| Date       | Author | Description   |
| ---------- | ------ | ------------- |
| 2026-07-24 | WO-00 control tower | Initial draft |
