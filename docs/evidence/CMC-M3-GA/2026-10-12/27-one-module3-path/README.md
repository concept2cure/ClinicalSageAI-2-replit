# One Module 3 path: a package carries only Module 3 the gate cleared

Rows **D2** and **D5**. GA plan item 1, second half (decision 2026-10-05):
*retire the submission orchestrator's parallel Module 3.*

## The defect

Module 3 reaches a submission through one governed path — compile the sections,
approve each under Part 11, let `evaluateFinalExportGate` judge the program,
then place them as leaves (`place-module3-into-submission.ts`). Approval is
where a person takes responsibility for the content; the gate is where the
program's contradictions, staleness, provenance gaps and compiled-record drift
are weighed.

`POST /api/submission-orchestrator/runs` had a second path that skipped all of
it, by two doors:

| Door | What it did |
|---|---|
| **Mode B** | accepted a hand-built `cmcSources[]` in the **request body** |
| **Mode A** | called `loadCmcSourcesForProject`, which reads **every** `cmc_source_objects` row for the program — approved or not, swept or not, stale or not |

Either way `m3.compose` composed Module 3 from them, `package.assemble` derived
**one leaf per composed section** (its own docstring: "Derived from
`module3Sections`"), and `package.sign` signed those leaves. So a program whose
Module 3 nobody had approved — or whose approvals the gate refuses — could be
composed, assembled, validated and **released under an e-signature**.

`POST /m2/qos` was the same defect on a smaller route: a Quality Overall
Summary composed from a `module3Sections` array in the body. That is exactly
what `cmc-quality-summary-tool.ts` was rewritten to stop doing on 2026-10-04 —
its own header says the tool "required the model to supply `cmcSources[]` …
Every figure in it was model-authored, which CLAUDE.md Rule 2 forbids" — and
the HTTP route kept the shape.

A third door, `POST /runs/:runId/regenerate`, takes the same arrays one level
down.

## The fix

**`load-approved-cmc-sources-for-project.ts`** — the one reader that may hand a
program's CMC data to a submission package. It asks
`evaluateFinalExportGate` and does not re-interpret the answer:

- **gate open** → the sources, with the approved-section count;
- **gate closed** → **no** Module 3, carrying the gate's own refusal wording.
  Not a partial or unapproved one: a package assembled from content nobody
  approved is the thing this exists to prevent;
- **gate unevaluable** → `unknown`, no Module 3, and a reason saying *nothing
  is known* about its approval state. Never reported as a program with no CMC
  data.

Every `m3.*` step and `m2.3.qos` is already `null`-guarded on
`cmcSources.length === 0`, so a refused gate makes them record "no inputs" and
the assembled package holds no Module 3 leaf — no step graph change, and the
`EctdCompile` screen keeps rendering the same eleven steps.

**Inline `cmcSources` is refused outside development** —
`INLINE_CMC_SOURCES_REFUSED`, 400, `field: 'cmcSources'` — checked on the
**raw body** so the refusal cannot depend on which schema branch matched, and
applied to **both** routes that accept run inputs. The message names the
governed path by route: compile, approve, place. Development keeps the array
for fixtures and the orchestrator's own integration tests.

**Nothing is silent.** Three places now tell the three no-Module-3 states
apart — a closed gate, an unevaluable one, and a program with no CMC data:

- the run's response carries `outputs.m3Refusal`, null when Module 3 was
  carried;
- the `orchestrator_inputs_assembled` audit row carries `cmcExportGate` and
  `cmcExportGateReason`;
- **the `m3.compose` step itself says why it skipped.** `runStep` already
  distinguishes a `null` return — recorded as `skipped (no inputs)` — from
  `{ skip: reason }`, which its own docstring reserves for "a skip that is NOT
  want of input". The refusal travels in as `OrchestratorInputs
  .module3ExportRefusal`, so a reviewer reading a run's steps sees
  `skipped (<the gate's words>)` instead of a status that reads as routine.
  Without it, a program whose Module 3 the gate will not clear and a program
  with no CMC data at all looked identical on the run.

**`POST /m2/qos` is deleted**, with the replacements named by path in a comment
where it stood: AnA's record-composed `draft_quality_overall_summary_m2_3`,
the governed compile → approve → place path, and the `m2.3.qos` step itself.
No caller existed in `client/src`, in server code, in scripts or in the staff
simulation, and the history search
(`git log --all --diff-filter=D -- 'server/routes/submission-orchestrator*'`)
returns nothing: no earlier generation of this handler was removed and rebuilt.
`buildM23QualityOverallSummary` stays — it is what the record-composed tool and
the run step both call.

**The `ectd-compile` surface's claim is narrowed** from the mount root
`/api/submission-orchestrator` to `/api/submission-orchestrator/runs`, the
segment its screen actually reads. Attribution is by longest prefix at a
segment boundary, so the root admitted every handler under the mount —
including five standalone builders no screen calls (`/m2/nonclinical`,
`/m2/clinical`, `/m2/clinical-overview`, `/csr/tabulate`,
`/validate/hardened`), each of which composes regulated content from arrays in
a request body. They are now **unmapped**, which production refuses 403
`LAUNCH_SCOPE`. They are not CMC and belong to the Submission Center lane;
this records their shape without deleting another lane's code.

**`m3.refine`'s model path is pinned unreachable.** `useAI` is accepted by no
run schema and referenced by no client, so the step records `skipped` and the
gateway is never called from a launch route. That was already true; it is now
a test, so it cannot quietly stop being true.

## Red, then green

`server/routes/__tests__/orchestrator-module3-governed.test.ts`, 13 tests. On
the previous route and service (`red-before.txt`) **10 fail**, and the
assertions print the defect:

```
carries NO Module 3 when the gate refuses, and never reads the sources
  → unapproved Module 3 reached the package the run signs:
    expected [ { id: 'ds-1', …(2) } ] to deeply equal []

refuses inline cmcSources on POST /runs   → expected 200 to be 400
refuses it on the regenerate route too    → expected 500 to be 400
POST /m2/qos is not routed                → expected 500 to be 404
says WHY it carried none                  → expected undefined to be '2 of 4 …'
```

After (`green-after.txt`): **13 pass**.

Two cases pass on both sides, and say so honestly:

- *does not refuse an EMPTY array* — it carries no Module 3 either way.
- *`useAI` cannot be set through the run route* — a pin of an invariant that
  already held, not a fix.

## Gates

- `ci:launch-scope-api` (`green-ci-launch-scope-api.txt`): 288 paths named by
  launch and shell screens, **none refused** — narrowing the claim broke no
  screen.
- `ci:launch-scope` — 7 apps, 30 surfaces, routable and fixture-free.
- `ci:check-client-api-calls` — every client `/api` call still has a server
  route behind it.
- `ci:unreferenced-modules` — 81, baseline 81; no new unreachable module.
- `ci:check-route-collisions`, `ci:route-ownership-matrix`,
  `ci:no-mock-in-prod-routes`, `ci:audit-route-mounts:no-regression` (+0
  errors, +0 warnings) all pass.
- `tsc --noEmit`: 0 errors.

## Not yet

The four `m3.*` steps remain in the run graph, as no-ops when the gate refuses.
Deleting them would change what `EctdCompile` renders for every run, so under
the working agreement it needs the replacement named by path **for that
screen** — which is a Submission Center / eCTD Compile change, not a CMC one.
What they can no longer do is compose Module 3 from records nobody approved,
which is what "one Module 3 path" was for.
