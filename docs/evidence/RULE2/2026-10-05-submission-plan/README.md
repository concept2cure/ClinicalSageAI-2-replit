# Rule 2: the submission plan is the engine's structure; the model narrates

**Rule:** CLAUDE.md Rule 2, "numbers, verdicts and governed content come from
deterministic engines; the model narrates."
**Finding:** item 21 on `docs/work-orders/README.md` (2026-10-04), second half:
`plan_submission`.
**Date:** 2026-10-05.

## The defect

`generateSubmissionPlan` (`server/services/submission-ai/submission-ai-service.ts`),
behind AnA's `plan_submission` tool and `POST /api/submissions/:id/plan`, asked
the model for a module map, regional forms and a timeline of day offsets keyed
to PDUFA, 210-day or PMDA clocks. It returned all of these beside the
reasoning engine's `deterministicStructure` (the required sections, Module 1
forms and review clock, resolved by rule), and the two could disagree.

A model failure also failed the whole plan, though the structure needs no
model.

## The change

- **The plan.** It is `deterministicStructure`, computed first and returned
  whatever the model does.
- **The model's role.** It is given that structure to narrate (prompt
  `submission-plan@v1.1`, CHANGELOG). It returns gaps and dependencies as
  prose, under a fixed `narrative.label` with `source: 'model'`. Any module
  map, form or timeline it returns is dropped.
- **When the model fails.** If it is unavailable or unreadable,
  `narrative: null` with `narrativeUnavailable`, and the plan is unaffected.
  This is the dispatch-QC pattern in the same file.
- **The prompt version.** It is threaded through the gateway call and the
  `AI_GENERATE` audit row; both read `v1.0` for every task before.

The handler in `AnaToolExecutor.ts` is unchanged. It passes the result through,
and the file is being edited by other sessions now.

## Proof

`server/services/submission-ai/__tests__/submission-plan-deterministic.test.ts`:

| Case | Trunk | After |
| --- | --- | --- |
| A model's timeline, module map and forms are not in the result; its gaps and dependencies are labelled narrative | **fail**: all present | pass |
| The model is given the structure, under prompt v1.1 | **fail**: v1.0, no structure | pass |
| The plan stands when the model call fails | **fail**: the whole plan threw | pass |

- `red/before.txt`: 3 of 3 fail.
- `green/after.txt`: 21/21. That covers the submission-AI suites (dispatch-QC
  included), the prompts-directory guard and `global-markets`.
- ESLint: no warning added. `runJsonTask`'s options became an object, so the
  version did not add a parameter. `tsc`: clean.
