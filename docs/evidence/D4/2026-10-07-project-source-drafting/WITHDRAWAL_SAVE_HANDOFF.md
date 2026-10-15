# W2 / D4 — source withdrawal and draft-save transaction handoff

## Reproduced defect

After source-reference verification through the pool but before authoring
acquired its transaction client, the normal governed disposition service could
commit `remove_data`. The draft then saved a reference with
`verification: current_at_save` although the source was no longer eligible.
An in-memory registered-handler regression ran red on that exact interleaving:
the real preview/apply withdrawal committed, but the tool still created a draft.
Historical family supersession alone is not the defect.

## Existing transaction contract

Receipt identity/span parsing occurs before saving. Actual source reads and
availability metadata are resolved on the authoring transaction client after
BEGIN, under the same organization/program advisory lock as normal disposition
apply. Both acquire this lock before authoring INSERTs or disposition impact
table locks; taking it after an authoring INSERT would invert the lock order.
The canonical helper normalizes UUID casing so equivalent project identifiers
coordinate. Lock waiting is bounded. Unknown source/lock failures refuse safely
and roll back before any document, section, revision or CREATE audit write.

The create transaction serializes provenance only after this check. The same
provenance object feeds document storage and section CREATE audit metadata.
Unrelated INSERT/audit failures retain existing rollback/error handling;
unsourced/template saves do not acquire the disposition program lock. Existing
approval, actor, program ownership, audit, signature and machine-lineage gates
remain. No new tables, dependencies, models, engines or authoring store.

This coordinates saving with the existing normal governed withdrawal path,
not arbitrary administrative SQL. References remain declared and unassessed,
not scientific qualification or proof the generator used them. Deliberately
named historical source versions remain supported. Later source withdrawal
still needs the existing governed review; this does not add a new automatic
approval-invalidating system.

## Evidence boundary

Regression uses actual authoring SQL and normal disposition preview/apply on
an in-memory PostgreSQL harness. It checks committed withdrawal plus refusal
and zero draft-side writes; eligible and already-withdrawn controls and SQL
ordering cover the handoff. PGlite does not model separate concurrent database
sessions: deterministic interleaving and lock invocation/order are proven,
not a multi-connection production concurrency or runtime-RLS qualification.

Final focused regression: **442 tests passed in 27 files**, covering the
registered-tool withdrawal race, disposition preview/apply, shared lock keys,
current-version retrieval, source/save provenance, regional preparation and
governed authoring. Server build, canvas-path reachability, changed-file ESLint
and whitespace checks passed. Ultra read-only review found no concrete blocker.

The preceding search source commit `6966113a6f72183386d8979fa3680b27ac57b7b5`
passed full GitHub TypeScript and ESLint in Validate & Audit run 37574548749.
Exact-source GitHub validation for this separate withdrawal correction follows
direct publication; that earlier green is not substituted for this revision.
This correction does not close the whole D4 launch row or agency filing readiness.
