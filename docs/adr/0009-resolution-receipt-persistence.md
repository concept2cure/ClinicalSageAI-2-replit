# ADR-0009: Resolution receipt persistence

## Status

**Accepted — phase 1 IMPLEMENTED 2026-07-25** (see execution notes)

> **Execution notes (2026-07-25).** Implemented with three deviations from the
> draft, each evidence-driven:
>
> 1. **Scope grew — C-10.** The resolution layer's own storage
>    (`resolution_plans`, `resolution_bundles`, `resolution_bundle_items`,
>    `supersession_records`) turned out to exist only in the dead lineage, so a
>    receipt table alone was moot. All four ported to the canonical lineage in
>    `20260725_resolution_orchestration_tables.sql`.
> 2. **Type direction reversed (C-5).** The draft adopted
>    `resolution-bundle.ts`'s row-shaped type. It has **zero importers** — the
>    canonical type is `shared/types/resolution.ts` (the one the executor
>    builds), extended with optional `receiptId`/`receiptHash`; row identity
>    lives on the persisted row. The rival is deprecated in place.
> 3. **Transactionality deferred to phase 2.** The draft required receipt and
>    effects in one transaction. The executor's effects flow through the
>    supersession engine and bundle builder, which hold their own db handles;
>    honest same-transaction semantics require threading a tx through those
>    modules. Phase 1 persists post-effects and **throws on persistence
>    failure** ("effects durable but unproven — do not report complete"), which
>    is fail-loud rather than fail-closed. Phase 2 owns the tx refactor.
>
> Proof: `tests/schema-contract/resolution-receipts.contract.test.ts` — 7 tests
> driving the real executor and verifier against the canonical DDL, including
> receipt-tamper detection, missing-object detection, tenant isolation, and the
> loud-failure path.

- Date: 2026-07-24
- Deciders: control-tower session (WO-00); requires human approval
- Technical Story: WO-00 conflicts C-4, C-5

## Context

The resolution receipt is described throughout the strategy material as the
platform's strongest differentiator — "detect, decide, execute, and prove."

**The proof object is not stored anywhere.**

Verified at `2a5b46d`:

1. `server/services/resolution/bundle-executor.ts:99-105` accumulates
   `executedSteps`, `preparedSteps`, `blockedSteps`, `supersededObjects`,
   `updatedArtifacts`, `requiresReview`, `requiresReapproval` as **in-memory
   arrays**.
2. Line `:278` assembles them into a `BundleExecutionReceipt` and returns it.
   There is no `INSERT` of the receipt anywhere in the function.
3. **No receipt table exists.** Repo-wide search across every `.sql` and `.ts`
   returns no `bundle_execution_receipts`, `resolution_receipts`, or equivalent.
   `shared/schema/resolution` defines only `resolutionBundles` and
   `resolutionBundleItems`.
4. The codebase demonstrably knows this pattern — `decision_receipts`
   (`db/migrations/20260325_decision_receipts.sql:5`, written by
   `decision-lifecycle-service.ts:341`) and `biostat_signal_receipts`
   (`migrations/0010_biostats_signal_engine.sql:45`, written by
   `biostats-signal-engine/engine.ts:399`) are both real, persisted receipt
   tables. The resolution path simply never got one.

### What *is* durable

Corrections are not fake. The executor performs real, persisted work:
`concept2cure_artifacts` status updates (`:651`, `:725`),
`concept2cure_artifact_versions` inserts (`:686`), bundle state transitions via
`transitionBundleState`, supersession via `recordSupersession` /
`confirmSupersession`, and `contradiction_findings` updates
(`contradiction-resolution-orchestrator.ts:~715`).

**The effects survive. The proof of what happened does not.** After the HTTP
response ends, the only remaining evidence is inference from bundle-item
statuses — exactly what master WO-03 forbids:

> *"Do not treat a status field such as `completed` as proof by itself. Receipt
> verification must resolve the linked object, current version, expected
> prior/new state, and hashes or durable transition evidence."*

### C-5: two type definitions

| Definition | Shape |
|---|---|
| `shared/types/resolution.ts:238` | no `id`, no `projectId`, no `decisionId`; has `contradictionIds`, `overlayContext` |
| `shared/types/resolution-bundle.ts:114` | has `id`, `bundleId`, `projectId`, `decisionId`, nested `plan { summary, contradictionIds, actionCount, rationale }` |

`bundle-executor.ts:30` imports from **`shared/types/resolution`** — the shape
*without* an `id`. The `resolution-bundle.ts` variant carries `id`, `projectId`,
`decisionId`: the shape of a row. It reads as a persistence design that was
specified and never wired.

### Program consequence

- **WO-03 cannot aggregate historical correction receipts.** They do not exist for
  any bundle already executed. The Proof Packet requirement "correction bundle
  receipts with executed/prepared/blocked steps" is unimplementable for historical
  data — that evidence was never written and cannot be recovered.
- **WO-08's acceptance gate** — "verify each execution receipt against durable
  object state before marking resolution complete" — has no durable receipt to
  verify against.
- Any external claim that the platform "persists a BundleExecutionReceipt" is
  **not supported by the code** and must not be made until this ships.

## Decision

We will:

1. **Create a `bundle_execution_receipts` table** in the canonical lineage
   (ADR-0006), storing the full receipt: bundle, plan, decision, project,
   organization, executed/prepared/blocked steps, superseded objects, updated
   artifacts, review and reapproval obligations, contradiction state, and
   timestamp.
2. **Persist the receipt inside the same transaction as the effects.** A receipt
   written after a separate commit can diverge from what actually happened. If the
   receipt cannot be written, the correction does not commit.
3. **Hash the receipt and the object states it asserts.** Verification must
   resolve the linked object, its version at execution time, expected prior and new
   state, and compare hashes — not read a status field. `bundle-executor.ts`
   already imports `createHash` from `crypto` (`:22`).
4. **Adopt `shared/types/resolution-bundle.ts:114` as the canonical type** — it
   already carries `id`, `projectId`, `decisionId`. Retire the
   `shared/types/resolution.ts:238` definition, migrating its `contradictionIds`
   and `overlayContext` fields onto the canonical shape so nothing is lost.
5. **Write a verifier service** (`verifyBundleExecutionReceipt`) that WO-03 and
   WO-08 both consume, so receipt verification has exactly one implementation.
6. **Record honest incompleteness for historical bundles.** Bundles executed
   before this ships have no receipt. The Proof Packet must render them as
   *"executed before receipt capture — no durable proof available"* rather than
   omitting them or inferring a receipt from status. Fabricating a retroactive
   receipt would violate master §2.

**Sequencing:** this lands **before** WO-03 begins, not inside it.

## Consequences

### Positive

- The platform's headline differentiator becomes true rather than aspirational.
- WO-03 and WO-08 acceptance gates become meetable.
- Transactional persistence makes receipt and effect impossible to diverge.
- One verifier, consumed by both work orders.

### Negative

- Historical corrections remain permanently unprovable. That evidence is gone and
  no engineering can recover it — it must be disclosed, not worked around.
- Transactional receipt writing adds failure modes: a receipt-write failure now
  rolls back a correction that would previously have succeeded. This is the
  correct trade in a regulated system, but it is a behavior change.
- Adds a migration to a lineage that is itself frozen pending ADR-0006, so this
  cannot land first.

### Neutral

- Receipt rows grow monotonically; they are audit evidence and must not be pruned
  on a normal retention schedule.

## Alternatives Considered

### Option A: Reconstruct receipts on demand from bundle-item state

**Description:** Build the receipt at read time by querying bundle items,
artifact versions, and supersession records.

**Pros:** No migration. Works for historical bundles.

**Cons:** This *is* the "status field as proof" pattern master WO-03 explicitly
forbids. A reconstruction cannot show what the state was *at execution time*, only
what it is now — so it cannot detect post-hoc tampering, which is the entire point.

**Why not chosen:** Directly violates WO-03's critical integrity requirement.

### Option B: Write the receipt to the audit log rather than a dedicated table

**Description:** Emit the receipt as a structured audit event.

**Pros:** Reuses the existing hash-chained audit infrastructure; gets tamper
evidence for free.

**Cons:** Receipts need relational querying (by bundle, project, decision, and
affected artifact) that an append-only event log serves poorly. The Proof Packet
must join receipts to artifacts and decisions.

**Why not chosen as the primary store** — but the receipt hash **should also** be
emitted into the audit chain, giving both queryability and chain-anchored tamper
evidence. Adopted as a complement, not a substitute.

### Option C: Ship WO-03 without receipts, add them later

**Description:** Build the Proof Packet from the components that do persist.

**Pros:** WO-03 starts immediately.

**Cons:** Produces a proof packet whose correction section is either empty or
inferred from status. Ships the exact overstatement the program exists to
eliminate.

**Why not chosen:** A Proof Packet that cannot prove corrections is a marketing
artifact, not an evidence artifact.

## Implementation Notes

```sql
CREATE TABLE bundle_execution_receipts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    INTEGER NOT NULL REFERENCES organizations(id),
  project_id         INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  bundle_id          UUID NOT NULL,
  plan_id            UUID,
  decision_id        UUID,
  executed_steps     JSONB NOT NULL DEFAULT '[]'::jsonb,
  prepared_steps     JSONB NOT NULL DEFAULT '[]'::jsonb,
  blocked_steps      JSONB NOT NULL DEFAULT '[]'::jsonb,
  superseded_objects JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_artifacts  JSONB NOT NULL DEFAULT '[]'::jsonb,
  requires_review    JSONB NOT NULL DEFAULT '[]'::jsonb,
  requires_reapproval JSONB NOT NULL DEFAULT '[]'::jsonb,
  contradiction_state JSONB,
  -- integrity: hash of the canonical receipt body + asserted object states
  receipt_hash       TEXT NOT NULL,
  object_state_hash  TEXT NOT NULL,
  executed_by        INTEGER NOT NULL,
  executed_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON bundle_execution_receipts (organization_id, project_id);
CREATE INDEX ON bundle_execution_receipts (bundle_id);
```

Verification resolves live state and compares — it never reads a status field:

```ts
export async function verifyBundleExecutionReceipt(receiptId: string, orgId: number) {
  // 1. load receipt, recompute receipt_hash over canonical body → detect tampering
  // 2. for each executedStep: resolve target object at its recorded version
  // 3. compare expected prior/new state against durable transition evidence
  // 4. return per-step verdicts; NEVER infer success from item.status
}
```

## Related Decisions

- [ADR-0006](0006-canonical-migration-lineage.md) — the migration must land in the canonical lineage.
- [ADR-0008](0008-canonical-contradiction-and-overlay-stores.md) — receipts record contradiction state.
- [ADR-0003](0003-21-cfr-part-11-compliance-strategy.md) — receipts are Part 11 evidence; the hash should anchor into the audit chain.

## References

- `docs/architecture/C2C_SCHEMA_AND_ENUM_CONFLICT_LEDGER.md` (C-4, C-5)
- Master work order WO-03 "Critical integrity requirement"

---

## Revision History

| Date       | Author | Description   |
| ---------- | ------ | ------------- |
| 2026-07-24 | WO-00 control tower | Initial draft |
