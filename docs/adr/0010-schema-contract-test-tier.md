# ADR-0010: Schema-contract test tier

## Status

**Proposed**

- Date: 2026-07-24
- Deciders: control-tower session (WO-00); requires human approval
- Technical Story: WO-00 — root cause of why C-1, C-2, C-3, C-7 went undetected

## Context

Conflicts C-1, C-2, C-3 and C-7 are not subtle. `assumption-registry-service.ts`
writes the status value `active` to a column whose pgEnum does not contain
`active`. In a system with a schema-contract test, that fails on the first run.

It has never failed, because **no test exercises these tables against a real
database**.

`server/services/__tests__/operating-system.test.ts:31`:

```ts
vi.mock('../../db', () => ({
  db: {
    insert: (...args) => mockInsert(...args),
    update: (...args) => mockUpdate(...args),
    // …entire Drizzle surface replaced with vi.fn() stubs
  },
}));
```

The suite passes — **98 tests green, verified at this SHA** — while asserting
nothing about the schema. Mocks accept any column name, any enum value, any type.

Compounding it, `/api/operating-system`, `/api/resolution` and `/api/study-design`
have **no client consumer** (see the route matrix). So neither a user nor a test
has ever driven this stack against a real schema.

Master §8 requires "schema/contract tests" as tier 2 of the release hierarchy.
That tier does not currently exist in a form that can detect schema divergence.

### What the repo already has

The enforcement posture is otherwise strong: 38 CI guards, **30 wired and
blocking**, including tenant isolation, RLS allowlist sync, tenant column types,
gateway bypass, and route mount auditing. `server/db/pglite-harness.ts` exists,
suggesting an in-process Postgres harness is already available.

The gap is specifically **schema conformance**: does the DDL that will be
deployed accept the writes the services actually make?

## Decision

We will:

1. **Add a schema-contract test tier** that runs against a real Postgres — pglite
   in CI via the existing `server/db/pglite-harness.ts` where sufficient, a
   service container where pgvector or other extensions are required.
2. **Apply the canonical migration lineage** (ADR-0006) to a clean database, then
   run the tier against it. The tier tests the *deployed* schema, not the Drizzle
   model's opinion of it.
3. **Assert enum conformance in both directions** for every enum-typed column:
   - every value any service can write is accepted by the column;
   - every value the column accepts is handled by the consuming service.
   A one-directional check would have missed C-7, where the service writes
   `approved` into an action-state column that has no such value.
4. **Assert table-shape conformance**: every column a service reads or writes
   exists with a compatible type. This is what would have caught C-1 on day one.
5. **Ban mocked-DB tests as evidence for schema-touching services.** Unit tests
   with `vi.mock('../../db')` remain valuable for branching logic, but they cannot
   satisfy master §8 tier 2. Services that touch regulated tables need at least one
   real-database test.
6. **Add a CI guard, `check-schema-contract-coverage.mjs`**, that fails when a
   service writing to a regulated table has no real-database test — wired blocking
   alongside the existing 30, with a baseline so it can be ratcheted rather than
   demanding full coverage on day one.
7. **Add duplicate-table detection to the migration guard** (ADR-0006 step 5), so
   the C-1 class of defect is caught at DDL time, before any test runs.

## Consequences

### Positive

- C-1/C-2/C-3/C-7 become impossible to reintroduce: they fail CI.
- Master §8 tier 2 becomes real rather than nominal.
- WO-01's golden journeys gain a foundation — they will exercise this stack for
  the first time, and a schema-contract tier means they surface schema defects as
  clear failures rather than confusing runtime errors.
- Two layers of defense: DDL-time duplicate detection and runtime conformance.

### Negative

- CI gets slower. A real database per run costs more than mocks.
- Retrofitting real-database tests across existing services is substantial work;
  the baseline-and-ratchet approach spreads it but does not eliminate it.
- pglite may not support every extension the schema uses (notably pgvector),
  requiring a service container for some suites and adding CI complexity.

### Neutral

- Existing mocked tests are kept. This adds a tier; it does not delete one.

## Alternatives Considered

### Option A: Static analysis — compare service SQL against DDL without running a database

**Description:** Parse raw SQL and Drizzle calls, compare column and enum usage
against parsed DDL.

**Pros:** Fast, no database in CI.

**Cons:** Cannot resolve dynamically built SQL (`assumption-registry-service.ts`
builds `UPDATE` statements from an array of set-clauses at `:297`). Would produce
false confidence on exactly the code paths that diverged.

**Why not chosen:** The divergent code is the code static analysis handles worst.

### Option B: Rely on the golden journeys (WO-01) to catch schema defects

**Description:** End-to-end journeys hit real endpoints against a real database.

**Pros:** No new tier; realistic coverage.

**Cons:** Journeys report failures far from the cause — an enum violation surfaces
as a failed journey step, not "column X rejects value Y." They also only cover
paths a journey traverses, and today no journey touches `/api/operating-system`.

**Why not chosen as the only mechanism.** Journeys are complementary and remain
required; they are not a substitute for a targeted conformance tier.

### Option C: Type-generate services from the schema, making divergence impossible

**Description:** Generate all data access from the Drizzle schema; ban raw SQL
against regulated tables.

**Pros:** Eliminates the defect class at the source. ADR-0007 already moves
`assumption-registry-service.ts` onto Drizzle.

**Cons:** Large refactor across many services; does not protect against the
Drizzle model itself diverging from deployed DDL — which is precisely what C-1 is.

**Why not chosen alone:** Adopted *in part* via ADR-0007, but a test tier is still
required because the Drizzle model and the deployed database can disagree.

## Implementation Notes

```ts
// tests/schema-contract/operating-system.contract.test.ts
// Runs against a REAL database with the canonical lineage applied. No vi.mock.

describe('assumption_records — enum conformance', () => {
  // Every status the service can write must be accepted by the column.
  for (const status of ASSUMPTION_STATUSES_WRITTEN_BY_SERVICE) {
    it(`accepts status "${status}"`, async () => {
      await expect(insertAssumption({ status })).resolves.toBeDefined();
    });
  }

  // And every value the column accepts must be handled by the service.
  it('service handles every enum value the column permits', async () => {
    const dbValues = await enumValues('assumption_status');
    expect(new Set(dbValues)).toEqual(new Set(SERVICE_HANDLED_STATUSES));
  });
});
```

Guard sketch:

```js
// scripts/ci/check-schema-contract-coverage.mjs
// For each service writing a REGULATED_TABLES member, require ≥1 test file under
// tests/schema-contract/ that imports it and does NOT vi.mock the db module.
// Baseline the current gap; fail on regression.
```

## Related Decisions

- [ADR-0006](0006-canonical-migration-lineage.md) — the tier runs against the canonical lineage.
- [ADR-0007](0007-canonical-operating-system-schema.md) — the mapping tables it validates.
- [ADR-0008](0008-canonical-contradiction-and-overlay-stores.md) — same coverage requirement.
- [ADR-0009](0009-resolution-receipt-persistence.md) — receipt verification needs real-database tests.

## References

- `docs/architecture/C2C_CANONICAL_SERVICE_AND_STORE_MAP.md` §5.1
- `server/services/__tests__/operating-system.test.ts:31`
- `server/db/pglite-harness.ts`
- Master work order §8, tier 2

---

## Revision History

| Date       | Author | Description   |
| ---------- | ------ | ------------- |
| 2026-07-24 | WO-00 control tower | Initial draft |
