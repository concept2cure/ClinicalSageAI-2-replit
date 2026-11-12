# D4: the verdict measures CSR drafting and reads the use a run was made for; nothing can pass yet (2026-11-12)

Launch row D4, ledger package L1 (the files sit in S4's paths). Founder decisions P-115 item 2 ("Performance
qualification of the drafting model is the first launch task, ahead of any further CSR feature") and P-118
(`docs/LAUNCH_DEFINITION_OF_DONE.md`). The approved protocol's own `scope.enforcement` note says both pieces were
owed. This is the first of them. It calls no model.

## Why this is on the CSR path

A model-drafted CSR cannot be approved, frozen or filed until the model that drafted it has passed qualification
(P-115 item 1). Every `pq.status` is `pending`. Before this change, even a perfect run could not have been judged:
the verdict had no step for the protocol's `csrDrafting` component and applied the retrieval component to every run,
so a CSR drafting run would have waited on a retrieval test bank it does not use.

## What already exists (RULE 3)

Nothing new was built: no route, service, table or model. One file was split out of `pq-verdict.ts`, which is past
its line limit, into the same folder, as `pq-criteria.ts` was.

| Path | What it does today | What it did not |
|---|---|---|
| `server/eval/pq/pq-protocol.json` (approved v1.0.0) | Declares `csrDrafting` (required, **not executable**) with four criteria, and `scope.uses` with the components each use needs | Unchanged by this work |
| `server/eval/pq/pq-verdict.ts` `computeVerdict` | Judges generation, extraction and retrieval; refuses a pass on a component it has no step for | Had no step for `csrDrafting`; did not read `scope` |
| `server/eval/pq/pq-criteria.ts` | The one reading of each component's criteria: a criterion that cannot be applied is INCOMPLETE, never met | Had none for CSR drafting |
| `server/eval/pq/verify-pq-record.ts` | Re-verifies a registry claim against its record and the canonical evidence, recomputing the verdict | Ignored a record's `use`; a wrong or undeclared use was accepted |
| `server/services/ai-gateway/model-governance.ts` | Refuses a use the record did not measure (`use-mismatch`) | Unchanged; the CSR builder's calls still carry `document_drafting` |
| `server/services/csr-builder.ts` `draftCSRSectionWithProvenance`, `csr/unsupplied-statistics.ts` | Draft a heading and check its figures | Not yet driven by a qualification run (the next piece) |

Searches run: `csrDrafting`, `MEASURED_COMPONENTS`, `scope.uses`, `intendedUses`, `use-mismatch`,
`REQUIRED_COMPONENT_UNAVAILABLE` across `server/eval`, `server/services/ai-gateway`, `server/services/ai-governance`,
`scripts/ops` and `tests/ops`.

## What changed

- **`server/eval/pq/pq-csr-drafting.ts`** (split out of `pq-verdict.ts`): the record a CSR drafting run retains
  (the study and its source digest, the planned headings, one row per heading) and the one reading of it.
  - Every planned heading verifiably drafted by the pinned model, or the run is **INCOMPLETE**. A heading the
    provider failed on, or one answered by a model that could not be verified, is the run's shortfall, not the
    model's. What an unverified model wrote is not counted against the pinned one.
  - Below the accepted-first-draft floor (0.85): **FAIL**.
  - One figure in accepted text that the second pass could not find in the retained tables: **FAIL**.
  - One forbidden phrase in accepted text: **FAIL**.
  - A missing, misspelt or non-numeric criterion, a record that is not one row per planned heading, or accepted
    text with no second-pass count: **INCOMPLETE**.
- **`computeVerdict` takes the use and the CSR drafting record.** With a use, the run is judged on the components
  the protocol's `scope.uses` names for it, and no others. A use the protocol does not declare, one naming a
  component the protocol does not hold, or one without generation is INCOMPLETE. Without a use, every required
  component applies, exactly as before.
- **`verify-pq-record.ts` reads the same use.** A record made for a named use must carry exactly that use as its
  intended use, so a narrow pass is never carried as a wider one. And a pass that rests on CSR drafting **cannot be
  verified yet**: the run and its retained requests and receipts are not written, so there is nothing canonical to
  check it against. The verifier says so and refuses.

## What did not change, on purpose

- **The approved protocol file.** `csrDrafting.executable` is still `false`. Setting it is a new version and a new
  founder approval (P-118).
- **No model's status, and nothing a model may do.**
- **The preflight** (`npx tsx server/eval/pq/run-pq.ts --preflight`): still `blocked`, with the same blockers
  (`REQUIRED_COMPONENT_UNAVAILABLE` and the retrieval-bank ones). It does not read the use yet.

## Tests: red first, then green

- **`__tests__/pq-verdict-csr-drafting.test.ts`, 20 cases. Red:** all failed (the verdict ignored the record and
  the use). **Green:** 20 of 20. Two cases read the approved protocol file itself: both of its uses are ones this
  verdict can apply, and a perfect CSR drafting run is still INCOMPLETE on it.
- **`__tests__/verify-pq-record.test.ts`, 4 new cases. Red:** 3 failed, and two of those were real holes: a record
  naming an undeclared use, and one carrying `document_drafting` for a narrower run, were both **accepted**.
  **Green:** 47 of 47.
- **The pins, made to fail:** the accepted-share floor never missed (1 fails); the use ignored (6 fail); a CSR
  drafting pass verifiable without evidence (1 fails); an unverified model's headings counted (not caught at first;
  a case was added, and then 1 fails). Each was restored.
- The qualification, retrieval, governance and operations suites together: 25 files, 508 tests.
- Lint: `verify-pq-record.ts` had 1 warning and has 1; no other file has any. A targeted `tsc` reports nothing.

## What is still owed before any model can pass for CSR drafting, in order

1. **The run.** It drafts every narrative heading of one public study (the CDISC pilot, held outside the
   repository) through the builder's own request and checks, with the pinned model, and retains each request,
   response and check receipt. It adds no second drafting path. `csr-builder.ts` and `gateway.ts` are held by another
   lane (W8); the run calls the builder as it stands.
2. **The canonical evidence check** on that record, replacing the refusal above.
3. **The preflight by use**, so a CSR drafting run is not stopped by the retrieval bank's blockers.
4. **A label for the CSR builder's gateway calls**, so a CSR-only pass admits those calls and no other drafting.
5. **The release branch** for text a qualified model wrote and a named person adopted (P-115 item 1).
6. **A new protocol version** declaring the component executable, and the founder's approval of it.
7. **A provider key**, to run it. None of 1 to 6 needs one to be written.

## Limits, stated

- **No model has been run.** Every case here is a constructed record.
- **The record's shape is this change's proposal for the run to fill.** The run may show it needs more (for example
  each heading's request and response digests); those are added with the run and its evidence check, not before.
