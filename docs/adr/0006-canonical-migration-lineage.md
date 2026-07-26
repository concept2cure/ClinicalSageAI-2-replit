# ADR-0006: Canonical migration lineage

## Status

**Proposed**

- Date: 2026-07-24
- Deciders: control-tower session (WO-00); requires human approval before execution
- Technical Story: WO-00 conflict C-6

## Context

The repository has **two unrelated migration directories**, both containing live,
non-archived DDL:

- `migrations/` (repo root)
- `db/migrations/`

Additional DDL lives in `sql/`, `server/sql/`, `server/schema/`,
`scripts/db-verify/`, and `db/migrations/_consolidated/`.

**72 tables are defined in more than one non-archived `.sql` file** (measured at
`2a5b46d`: regex over every `.sql` for schema-qualified `CREATE TABLE`, excluding
`_legacy/`, `_deprecated_migrations/`, `docs/archive/`; 1,208 distinct tables
total). `20260501_q_sub.sql` exists with the *same filename* in both directories.

The two tools that could have caught this have **exactly complementary blind
spots**:

| Tool | Scans | Detects |
|---|---|---|
| `scripts/db/sync-migration-manifest.mjs:8` | `db/migrations/` only | manifest generation |
| `scripts/ci/check-migration-prefix-collisions.mjs:44` | `migrations/` only | 4-digit prefix collisions |

Neither scans both directories. **Neither checks table-name collisions at all.**
`db/migrations/migrations_manifest.json` covers 202 migrations and has a
`conflicts` field, but it resolves *prefix numbering* within its own directory —
it has no awareness that a second lineage exists.

Because every colliding DDL is guarded by `CREATE TABLE IF NOT EXISTS`, **the
winner is decided by deployment history, not by code.** The resulting physical
schema may differ per environment, and nothing in the repository records which
shape any environment actually has.

`scripts/db/apply-c2c-migrations.mjs` applies exactly three named files from the
root `migrations/` directory. The execution path for the remainder of that
directory — including `0010_operating_system_foundation.sql`, which defines the
Drizzle-shaped `assumption_records` and `decision_records` — is unaccounted for.

## Decision

We will:

1. **Survey before deciding.** Run a read-only introspection against every
   deployed environment recording, for each of the 72 colliding tables, the actual
   column set, constraints, and row count. This is a prerequisite input, not an
   implementation step. **No migration is authored before this completes.**
2. **Declare `db/migrations/` the canonical lineage**, on the evidence that it is
   manifest-managed (202 migrations, explicit `executionOrder`, `conflicts`,
   `skipFiles`) while the root `migrations/` directory has no comparable
   execution record.
3. **Freeze both directories** to new additions until reconciliation completes.
4. **Reconcile per table**, driven by the survey — not by which DDL reads better.
   Where a root-`migrations/` definition is the one physically deployed, it is
   migrated *into* the canonical lineage rather than overwritten.
5. **Extend both guards to scan both directories and to detect table-name
   collisions**, then wire the extended guard as blocking.
6. **Retire the losing definitions** only after (5) is green, leaving a documented
   compatibility window per master §10.

## Consequences

### Positive

- Migration ordering becomes deterministic and reviewable.
- 72 latent conflicts become visible to CI instead of resolved by deploy accident.
- Unblocks ADR-0007, ADR-0008, ADR-0009 and therefore WO-01, WO-03, WO-07, WO-08.
- The extended guard prevents recurrence structurally.

### Negative

- The environment survey requires production database access and cannot be done
  from the repository. This is a hard external dependency and a schedule risk.
- Reconciliation may require data migration for tables where the deployed shape
  differs from the intended shape — with regulated-history implications.
- Freezing both directories blocks unrelated feature work that needs a migration.

### Neutral

- The choice of `db/migrations/` is reversible until step 4 begins.
- Archived directories (`_legacy/`, `_deprecated_migrations/`, `docs/archive/`)
  are untouched and remain historical records.

## Alternatives Considered

### Option A: Declare the root `migrations/` directory canonical

**Description:** Drizzle's default convention; `drizzle.config.ts` and the
4-digit-prefix guard both point here.

**Pros:**
- Matches Drizzle tooling defaults.
- The Drizzle schema in `shared/schema/` corresponds to these definitions.

**Cons:**
- No manifest, no execution order, no conflict record.
- Only 3 files have a known execution path (`apply-c2c-migrations.mjs`).
- `db/migrations/` holds far more of the platform's history (202 managed migrations).

**Why not chosen:** Adopting the lineage with no execution record would make the
larger body of migrations the exception. The survey may overturn this — if the
deployed shapes consistently match root `migrations/`, this option is revisited.

### Option B: Merge both into one directory mechanically

**Description:** Move all files into one directory, renumber, regenerate manifest.

**Pros:** Single lineage immediately; conceptually simple.

**Cons:** A mechanical merge does not resolve *semantic* collisions — two
incompatible `assumption_records` definitions remain incompatible after being
placed in one folder. It would also rewrite migration history that may correspond
to what is physically deployed.

**Why not chosen:** Moves the problem without solving it, and risks reinterpreting
regulated history (master §9 stop condition).

### Option C: Leave as-is, document the hazard

**Description:** Accept two lineages; add documentation.

**Pros:** Zero immediate cost.

**Cons:** Leaves the physical schema non-deterministic across environments. Makes
WO-01 and WO-03 unbuildable as specified. Violates master §9 ("two active
canonical stores claim the same responsibility").

**Why not chosen:** It is the current state, and it is what produced C-1 … C-3.

## Implementation Notes

Survey query shape (read-only, per environment):

```sql
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name IN ('assumption_records','decision_records',
                     'contradiction_findings','contradiction_overlay_rules',
                     'contradiction_consequence_log' /* … 72 total */)
ORDER BY table_name, ordinal_position;

SELECT 'assumption_records' AS t, count(*) FROM assumption_records
UNION ALL SELECT 'decision_records', count(*) FROM decision_records;
```

Guard extension — both directories, table-name collisions:

```js
const DIRS = [path.join(repoRoot, 'migrations'),
              path.join(repoRoot, 'db', 'migrations')];
// parse schema-qualified CREATE TABLE [IF NOT EXISTS] <schema?>.<name>
// fail on any table defined in >1 non-archived file across BOTH dirs
```

## Related Decisions

- [ADR-0001](0001-use-drizzle-orm-over-prisma.md) — establishes Drizzle as ORM; this ADR determines where its migrations live.
- ADR-0007 — depends on this decision.
- ADR-0008 — depends on this decision.

## References

- `docs/architecture/C2C_SCHEMA_AND_ENUM_CONFLICT_LEDGER.md` (C-6)
- `docs/architecture/C2C_CANONICAL_SERVICE_AND_STORE_MAP.md` §8
- `db/migrations/migrations_manifest.json`

---

## Revision History

| Date       | Author | Description   |
| ---------- | ------ | ------------- |
| 2026-07-24 | WO-00 control tower | Initial draft |
