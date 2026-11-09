# The composition boundary rests on a recorded fact, not an inference

**Package:** S7 (CMC / Module 3). **Date:** 2026-11-09.
**Completes:** `server/services/cmc/composition-scope.ts`.
**Decision:** P-110 item 2, `docs/LAUNCH_DEFINITION_OF_DONE.md`, decided 2026-11-09 by the coordinating session
(`01JbQU…`) under the founder's delegation of 2026-11-08 (P-107). Option **(a)**, as this lane recommended.

## The finding, as measured

Mutation 5 of `docs/evidence/S7/2026-11-09-demo-cmc-materials/` was written to show the boundary saying *"not
established"*. It showed something else: `compositionRefusal` returned **null** — it **admitted** a monoclonal
antibody into small-molecule Module 3 composition.

The route text was `'Proprietary process (fictional).'` `classifySubstanceModality`'s last rule is *"a recorded
chemical process, and nothing suggesting biology"* → small molecule, and that string is a recorded process with no
biological word in it. So an under-described biologic was composed with ICH Q3A impurity reasoning — the exact harm
`composition-scope.ts`'s own refusal message says this boundary exists to prevent.

## What already exists (RULE 3)

| Path | What it does today | Used here |
|---|---|---|
| `services/cmc/substance-modality.ts` `classifySubstanceModality` | the one modality rule, shared with §3.2.A.2, returning `{modality, basis, explicit}` | **read, not changed.** `explicit` is already its own distinction between a stated verdict and an inferred one |
| `services/cmc/composition-scope.ts` `compositionRefusal` | the P-28 boundary: product class, then modality, then application | one branch added; the refusal code, the interface and every other branch unchanged |
| `CompositionRefusal.code` `'CMC_MODALITY_NOT_ESTABLISHED'` | already the code for "the record does not answer this" | reused; no new code, and `compositionRefusalStatus` already maps it |
| `CompositionRefusal.modality` | *"What the record established, for the audit row"* | `'unknown'` — the verdict said small molecule, but it said it by inference, so nothing was established |

Nothing new: no screen, route, service file, table or AnA tool. One branch in an existing function.

## The change

A small molecule is admitted **only when the record states it**. An inferred small-molecule verdict is refused
`CMC_MODALITY_NOT_ESTABLISHED`, and the refusal asks for the modality to be recorded.

| Substance record | Before | Now |
|---|---|---|
| `modality: 'small_molecule'` | composes | composes |
| a chemical route, no modality stated | **composes** | **refused**, modality not established |
| `'Proprietary process (fictional).'` on a mAb | **composes** | **refused**, modality not established |
| any biological signal | refused `CMC_MODALITY_OUT_OF_SCOPE` | unchanged, and still ahead of this question |
| nothing recorded either way | refused, "record the manufacturing route" | unchanged |

**The two refusals say different things on purpose.** A record with nothing in it is asked for its route. A record
that HAS a route is not — asking again would send the reader to fix what is already there — so it is asked for the
modality, and told that what stood in its place was an inference.

**This narrows P-28's boundary; it does not widen it.** §3.2.A.2 keeps its current reading (P-110), so the
classifier is untouched: the inference is defensible where a false positive costs a section asking for viral-safety
data, and is not defensible where it decides what a filing may say. Existing substance rows are not rewritten; each
is refused at composition until its modality is recorded.

## Verified by making the check fail, in both directions

| Run | What it reported |
|---|---|
| `01-red.txt` — the change not yet made | *"a terse route admitted a monoclonal antibody into small-molecule Module 3: expected null not to be null"*, 3 of 36 red |
| `03-mutation-a-stated-small-molecule-refused-too.txt` — the branch fires for an explicit small molecule too | 7 red, including *"the boundary refused a substance that states it is a small molecule"*, and the application refusals turning into modality refusals |
| `02-green.txt` | 36 of 36 |

The second mutation is the one worth having: a boundary that refuses everything is not a boundary. It pins that
the refusal is exactly as narrow as the inference it declines to trust.

Five cases, in their own `describe` (the existing one would have crossed the 100-line cap):

- mutation 5's antibody is refused, with `modality: 'unknown'` for the audit row;
- the inferred refusal and the empty-record refusal are different sentences, and only the empty one asks for the route;
- the same substance composes once `modality: 'small_molecule'` is recorded, **and only then**;
- a stated biologic still refuses `CMC_MODALITY_OUT_OF_SCOPE` ahead of this question, so the order is pinned;
- `classifySubstanceModality` still reads that record as `{small_molecule, explicit: false}` — §3.2.A.2's reading
  is unchanged, which is the half of the decision a test could otherwise quietly lose.

## One fixture had to state what it had been inferring

`SMALL_MOLECULE` in `composition-scope.test.ts` carried a chemical route and **no modality**, and was admitted by
inference — the same inference that admitted the mAb. It now states `modality: 'small_molecule'`, with the reason
in the fixture's own comment. That is the whole fixture change: no other CMC fixture relied on the inference, which
was checked by running all 95 CMC suites (1,847 cases) rather than by reading them.

## Gates

`tsc --noEmit` 0 errors (`ci:typecheck-no-regression`, baseline 0). `ci:pushed-lint-warnings`: no file changed its
warning count. All CMC suites: **95 files, 1,847 cases**. The other composition-boundary consumers
(`services/ana/cmc-quality-summary-tool.ts`, `services/ana-ri/module3-command-handlers.ts`,
`routes/submission-orchestrator.ts`) and `server/services/__tests__` (352 files, 3,751 cases) pass, bar the one
pre-existing P-95 fixture red reported to its lane.

## Still open from P-110: item 1

Item 1 — suitability as a signed outcome of the existing `validate` act — is the other half of this decision and
is not in this slice. It touches the shared signing ceremony (`qualifyRegisterRecord`, which writes one
`signedValue` per register from a closed descriptor table), the register's own refusal vocabulary, and the
specification approval gate's reading of `METHOD_SUITABLE`. It lands on its own.
