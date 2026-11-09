# `test:proof-tier` was red since 2026-11-08, and the fixture was what was wrong

**Package:** F1 (repairs: defects in shipped behaviour; no new screen, mount or table).
**Date:** 2026-11-09. **Completes:** `tests/schema-contract/cmc-specification-tenant-scope.contract.test.ts`.
**Reported by:** the coordinating session (`01JbQU…`), which found three cases red and asked this lane to
root-cause it and say which side was wrong — the fixture or the code.

## The answer: the fixture

Three cases in the tenant-scope contract failed, all wanting 200 or 404 and getting **409**:

- *lets the owning tenant approve its own row*;
- *returns 404 and records no signature when the UPDATE matches no row*;
- *still approves normally while the seam is armed for another row*.

The contract's `quality_specifications` row carried **no `test_methods`**. So `methodNameOf(spec)` was empty and
`specificationMethodVerdict` returned `METHOD_NOT_NAMED` — its **first** branch, before it looks at the register at
all. A specification that names no analytical method cannot be approved. That is the ICH Q2 approval gate working:
it is the thing the Specifications screen had been promising in two places while the server never checked
(`docs/evidence/F1/2026-11-08-specification-method-gate/`).

The three cases are about **tenant isolation** and a mid-transaction vanish. Their row named no method because the
method was irrelevant when they were written. A precondition they do not test now refuses them first.

## The log line was incidental, and it sent a reader to the wrong place

Each failure logged `[cmc-analytical-method-source] Analytical-method source read failed — reporting as not
evaluable`, which is why the report asked whether P-110's method suitability was the cause. It was not.

`approvalTargetRefusal` (`specificationRoutes.ts:498`) calls `loadProjectAnalyticalMethods` **unconditionally**,
before the verdict examines the name. The PGlite harness has no `cmc_source_objects` table, so that read fails and
logs — on a path where the register could not have changed the refusal. Asking the cheap question first would save
a database read and stop producing an alarming line about a read that did not matter. **Recorded as an F1
follow-up, not done here**: it changes a signed route's control flow, and this change should be the fixture alone
so that what fixed the gate is unambiguous.

## When it went red, so nobody looks for a change that is not there

| Fact | Evidence |
|---|---|
| The contract test has not been edited since **2026-10-26** | `d70e47bfe` |
| Nothing touched `specificationRoutes.ts` today | `git log --since=2026-11-09 -- server/api/cmc/specificationRoutes.ts` is empty |
| The gate landed **2026-11-08** | `7092a0b80`'s chain |
| P-110 changed the **suitability** branch of the same verdict | `34406add3` — a branch this test never reaches, because it names no method at all |

So `test:proof-tier` went red on 2026-11-08 and nothing ran it until the coordinating session did. It runs in CI's
Lint job and not in `.husky/pre-push`, which is why eight pushes crossed it without a word.

## The fixture change

| Added | Why that shape |
|---|---|
| a minimal `cmc_source_objects` table in `freshDb` | there is **no CREATE for it in `migrations/`** — it is modelled in `shared/schema/cmc-os.ts` and only *indexed* by `migrations/0016_module3_workflow_convergence.sql` — so the harness builds the same minimal shape the other CMC PGlite suites build, carrying exactly the columns `loadProjectAnalyticalMethods` selects |
| one `method` source row for tenant 1's project | in the register's own canonical shape — `source_type: 'method'`, payload key `methodName`, `validationStatus: 'validated'` — rather than a shape invented for the test |
| `test_methods` on the owned specification | naming that procedure, so the row is approvable and the three cases test what the contract is about |

The orphan-tenant cases are untouched: they refuse on tenant grounds, which a method cannot change.

This is the **same** fixture change `api/cmc/__tests__/cmc-sign-signature-row.test.ts` needed when the gate landed,
and that file's own comment already records the pattern: *"Without them those ceremonies answer 409 and never reach
the signature, which is the point of the preconditions."*

## Evidence

| File | What it holds |
|---|---|
| `01-red-on-trunk.txt` | the three failures as the coordinating session saw them, with the misleading log line |
| `02-green.txt` | 19 of 19 for this contract, and the whole gate's tally |

**The gate is not green, and the two that remain are not this lane's.** After this fix `test:proof-tier` is
**1,789 of 1,791 across 143 files**, with two failures:

- `tests/schema-contract/c2c-document-submit-requires-filing.contract.test.ts` — *"a sequence that is still draft
  is not a filing"*. The document/submission path.
- `tests/schema-contract/authoring-migration-list-closure.contract.test.ts` — *"no harness builds a table and then
  skips an applier file that alters it"*, naming
  `clinical-regulatory-evidence/__tests__/section-sources-unverifiable-native.pglite.test.ts` for
  `authoring_comments`, `user_pins` and `doc_revisions`. That directory is S12's hold.

Both are reported in `.design/claude-convergence/COORDINATION.md`.

**And the gate could not have caught the table this fix adds**, which is worth saying rather than relying on: its
`APPLIER_FILES` is the authoring subsystem's migration list, so a CMC harness is out of its scope. Checked by hand
instead: the only `ALTER TABLE cmc_source_objects` statements are `0016`'s UNIQUE constraint on
`(project_id, source_type, source_key, version)` — irrelevant to a one-row fixture — and `0017`'s
`project_id TYPE TEXT`, which this DDL already declares. The read selects `source_key`, `source_payload` and
`source_type`, filters on `organization_id` and `project_id::text`, and orders by `version` and `updated_at`; all
are present.

## One correction to this lane's earlier evidence

`docs/evidence/F1/2026-11-08-specification-method-gate/` said `cmc-sign-signature-row.test.ts`'s `ROW` has a null
`project_id`, so the register is unreadable for it, and the gate therefore "records the method as not evaluated
rather than refusing it". **Both halves were wrong.** `ROW.project_id` is a real uuid, its fake client stubs
`FROM cmc_source_objects` with a validated method, and an unreadable register does **not** pass — it refuses
`METHOD_NOT_VERIFIABLE`, exactly as that document's own rule table says two sections earlier. The behaviour was
right and the sentence describing it was not; it is corrected in place with a dated note.
