# ADR-0008: Canonical contradiction and regulator-overlay stores

## Status

**Proposed**

- Date: 2026-07-24
- Deciders: control-tower session (WO-00); requires human approval
- Technical Story: WO-00 conflict C-3

## Context

Three contradiction-engine tables are each defined **twice**, across the two
competing migration lineages (ADR-0006):

| Table | Definition A | Definition B |
|---|---|---|
| `contradiction_findings` | `migrations/20260524_contradiction_engine_schema.sql:24` | `db/migrations/20260323_assumption_decision_contradiction.sql:143` |
| `contradiction_overlay_rules` | `…20260524…:82` | `…20260323…:241` |
| `contradiction_consequence_log` | `…20260524…:118` | `…20260323…` |

A fourth table, `contradiction_links`, is defined once
(`migrations/0010_operating_system_foundation.sql:356`) but is written directly by
`assumption-registry-service.ts:173,205` — the same service implicated in C-1.

Both definitions of each table use `CREATE TABLE IF NOT EXISTS`, so which one
exists is decided by deployment history.

### Why this specifically blocks WO-07

WO-07 migrates FDA/EMA/PMDA overlay seed rules into governed, sourced, versioned
doctrine records. Its acceptance gate requires that "every active rule has a
source and approval record" and that "historical findings replay with the
historical rule version."

**The seed rules may be sitting in whichever `contradiction_overlay_rules`
definition lost the race.** Migrating from the wrong table would silently produce
an empty or partial doctrine set while appearing to succeed — the failure mode
would be a doctrine service that looks populated but is missing rules that still
exist in the other table.

### Distinct concepts that must not be swept up

These are differently scoped and appear intentional. They are **not** duplicates
and must survive reconciliation untouched:

- `intelligence.pattern_contradictions` (`db/migrations/20260520_growth_mindset_extensions.sql:129`)
- `evidence.contradiction_scans` (`db/migrations/20260206_phase5_contradiction_scanner.sql:37`)
- `cmc_contradictions` (`db/migrations/20260401_cmc_convergence_os.sql:48`)

### Consumers

`contradiction-engine-service.ts` (1,600 lines) and `regulator-overlay-engine.ts`
(431 lines) are the primary readers. `/api/operating-system` and
`/api/resolution` — the routes that expose this stack — have **no client
consumer**, and the unit tests mock the database. As with C-1, nothing has
exercised these tables against a real schema.

## Decision

We will:

1. **Extend the ADR-0006 environment survey** to cover all four contradiction
   tables: actual column set, constraints, row counts, and — critically — **how
   many overlay rules exist in each candidate table, per regulator body.**
2. **Adopt the same lineage decision as ADR-0006.** These tables are not decided
   independently; splitting the operating-system stores across two lineages is
   what created the problem.
3. **Reconcile `contradiction_findings` preserving history.** Findings are
   regulated evidence — a finding that was raised, reviewed, and resolved is part
   of the audit record. Where both tables hold rows, both are migrated into the
   canonical shape with provenance recording which lineage each row came from.
4. **Treat overlay-rule migration as WO-07's first step, not a WO-00 fix.**
   ADR-0008 determines *which table is canonical*; WO-07 governs *how seed rules
   become sourced doctrine*. Do not silently grant seed rules approved status
   (master WO-07 requirement 2).
5. **Route `contradiction_links` writes through a service, not raw SQL.**
   `assumption-registry-service.ts` writing this table directly is the same
   pattern that let C-1 diverge.
6. **Explicitly exempt** `intelligence.pattern_contradictions`,
   `evidence.contradiction_scans`, and `cmc_contradictions` from reconciliation,
   and record the exemption so a future cleanup does not merge them.

## Consequences

### Positive

- WO-07 can begin against a known table with a known rule population.
- Contradiction findings — regulated evidence — are preserved rather than
  silently halved.
- Removes the last raw-SQL writer against operating-system tables.

### Negative

- Blocked on the same external dependency as ADR-0006 (production DB access).
- If both tables hold findings, the merge needs a de-duplication rule that a
  domain owner must approve — two rows may describe the same real contradiction.
- WO-07 slips by however long the survey takes.

### Neutral

- The three exempted tables keep their own lifecycles and are unaffected.

## Alternatives Considered

### Option A: Decide contradiction tables independently of ADR-0006

**Description:** Pick whichever contradiction definition is richer, regardless of
which migration lineage wins.

**Pros:** Could unblock WO-07 sooner.

**Cons:** `contradiction_findings` references assumptions and decisions. Splitting
the operating-system stores across two lineages reproduces the original defect in
a new place.

**Why not chosen:** These tables are one semantic unit with ADR-0007's tables.

### Option B: Start fresh — new canonical tables, abandon both

**Description:** Define new tables; leave both legacy definitions in place, unread.

**Pros:** Clean shape, no merge/de-duplication problem.

**Cons:** Abandons existing findings and overlay rules. If any deployed
environment holds real findings, this destroys regulated history — a master §9
stop condition.

**Why not chosen:** Unacceptable for regulated evidence unless the survey proves
both tables are empty everywhere. **Revisit only in that case**, where it becomes
the cheapest correct option.

## Implementation Notes

Survey addendum — rule population per candidate table:

```sql
SELECT regulator_body, count(*) AS rules
FROM contradiction_overlay_rules
GROUP BY regulator_body ORDER BY rules DESC;

SELECT count(*) AS findings,
       count(*) FILTER (WHERE review_state IS NOT NULL) AS reviewed
FROM contradiction_findings;
```

If both candidate tables hold rows, the merge carries provenance:

```sql
ALTER TABLE contradiction_findings
  ADD COLUMN source_lineage TEXT;  -- 'migrations/20260524' | 'db/migrations/20260323'
```

## Related Decisions

- [ADR-0006](0006-canonical-migration-lineage.md) — **must be decided first**.
- [ADR-0007](0007-canonical-operating-system-schema.md) — same lineage decision; findings reference those tables.
- ADR-0009 — receipts record contradiction state at execution time.

## References

- `docs/architecture/C2C_SCHEMA_AND_ENUM_CONFLICT_LEDGER.md` (C-3)
- `docs/architecture/C2C_CANONICAL_SERVICE_AND_STORE_MAP.md` §5

---

## Revision History

| Date       | Author | Description   |
| ---------- | ------ | ------------- |
| 2026-07-24 | WO-00 control tower | Initial draft |
