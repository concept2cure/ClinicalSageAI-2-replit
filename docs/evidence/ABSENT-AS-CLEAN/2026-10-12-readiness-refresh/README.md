# "Preflight and readiness truth have been refreshed." It had not been.

`ci:unbacked-tables:strict` — one of the seven zero-baseline gates
**Nightly Governance Strict** reports — had been naming
`concept2cure_projects` for weeks, in
`server/services/resolution/contradiction-resolution-orchestrator.ts`. The
gate's own words are the finding:

> An unguarded query against a missing table throws "relation does not exist",
> which route handlers turn into a 500 — the endpoint never works. A guarded
> one degrades to a silent no-op, **which is worse: it looks durable and is
> not.**

This was the guarded kind, and it reached a person as a sentence.

## What the code said, and what it did

After a contradiction-resolution bundle executed, `refreshPreflightAfterExecution`
made two writes under this heading:

```
// After bundle execution, update the relevant truth surfaces:
// - SectionWorkspace issues/status (via contradiction_findings.updated_at)
// - Dossier preflight (via concept2cure_projects.updated_at)
```

The first write is real: `contradiction_findings` is created by
`migrations/20260524_contradiction_engine_schema.sql`. The second, labelled
*"Invalidate cached readiness by touching project updated_at"*, stamped a
`concept2cure_projects` table — which exists **nowhere** in this repository:
no migration under `migrations/` or `db/migrations/`, no `shared/schema` entry.
It sat inside `catch { // Table may not exist }`, so it threw 42P01 and was
swallowed on every execution.

`readinessRefreshed` was then set `true` whenever the function did not throw
(orchestrator :308-:313) — which the swallowing catch guaranteed — and the
narrative shown to the person said:

> Preflight and readiness truth have been refreshed.

A test pinned that sentence (`tests/unit/contradiction-resolution-bundles.test.ts:586`),
so the false claim was protected by its own assertion.

## There was nothing to refresh either

The write was not merely misaddressed. **No readiness or preflight cache keyed
on a project's timestamp exists.** Nothing in `server/` reads
`projects.updated_at` for preflight or readiness; the only read of that column
is for display (`routes/c2c/project-access.ts:143`). Readiness is computed
from server-side truth on every assessment —
`assessSequenceDispatchReadiness` ("computing every gate input from
server-side truth", `server/services/ectd/assess-dispatch-readiness.ts`) — so
a resolved contradiction is reflected on the next read with no write here at
all.

So the fix is not to point the write at `projects`. That would be a write for
no reader. The dead write is removed, with the `projectId` parameter it was the
only user of, the function renamed to what it does (`restampAfterExecution`),
and the sentence changed to a true one:

> The resolved findings and affected artifacts have been restamped. Readiness
> is recomputed from the record on each read, so it reflects this execution
> immediately.

A second, harmless instance of the same false name is corrected in the same
change: the linked-projects route's doc comment claimed to join
`concept2cure_projects` while its SQL has always joined `projects`
(`routes/c2c/project-knowledge.ts:193`).

## Measurements

`measured.txt`. `ci:unbacked-tables:strict` 22 → **21**; the new narrative
suite red on the claim then green 2/2; the module's five suites 66/66 with the
pinning assertion rewritten to the true sentence; `tsc --noEmit` exit 0.

One detail worth keeping: the first replacement comment quoted the dead
statement verbatim, and the gate still measured 22 — it reads source **text**,
so a comment containing the SQL is a reference. Naming the table in prose is
what took it to 21. A gate doing exactly what it claims.

---

# The second one: an FDA-correspondence alert that had never fired

Same gate, same day, same failure mode, a different surface.
`server/services/ana-ri/mdx-proactive-signals.ts` — the module that gives AnA
the alerts it raises without being asked — declared a
`correspondence.no_response` alert and produced it from:

```sql
FROM correspondences c
WHERE c.organization_id = $1 AND COALESCE(c.response_status, 'open') = 'open'
```

under:

```ts
} catch {
  // fail-soft (correspondences table may have a different name in some tenants)
}
```

`correspondences` exists nowhere in this repository — no migration under
`migrations/` or `db/migrations/`, no `shared/schema` entry, no runtime DDL —
and the stated reason is not how this platform works: every table is shared and
tenant-scoped by an `organization_id` column (CLAUDE.md RULE 1, "New tables go
in `public` with `organization_id INTEGER NOT NULL`"). There are no per-tenant
table names. So the query threw 42P01 on every call, was swallowed, and the
alert had **never once fired**. The module's own header compounded it by listing
a third name, `regulatory_correspondence`, which does not exist either.

The module is reachable: `mdx-context-resolver.ts:31` imports it, and that
resolver feeds AnA's context. So a user asking AnA what needs attention was
told about deadlines, commitments and stale sections — and silently never about
an unanswered agency letter.

## Why this was not simply re-pointed

Agency correspondence does live somewhere. The regulatory-correspondence
operating layer records each parsed issue as a `c2c_project_work_items` row
with `sourceType: 'correspondence'`
(`server/services/regulatory-correspondence/operating-layer.ts:214, :227`).

But "received N days ago with no recorded response" does not map onto a work
item's columns without deciding what counts as received, as answered, and as
urgent. That is product semantics — the founder's call. **A wrong alert about
an unanswered FDA letter is worse than a missing one**, and RULE 2 is explicit
that governed content comes from deterministic engines, not from a mapping a
session guessed.

So the dead producer is removed, the header's false table list is corrected,
and the gap is written down at the producer's former position with the store
that holds correspondence today and the decision the alert needs. The
`correspondence.no_response` kind stays in the union: it is a declared
capability awaiting that decision, not one this change removes.

**Closed the same day, taken as SME:** see
`docs/evidence/CORRESPONDENCE-RESPONSE-CLOCK/2026-10-12/`. The answer turned
out to be that this note had the wrong store and the wrong question. The real
store is `c2c_correspondence`, which carries every column the dead query
selected — so it was a table-name typo, not a missing capability — and the rule
that needed deciding was the 14-day constant, which is not a deadline in any
regime this platform files in.

`ci:unbacked-tables:strict` 21 → **20**. `tsc --noEmit` exit 0; the module's
suites 79 files / 1175 tests pass.
