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
