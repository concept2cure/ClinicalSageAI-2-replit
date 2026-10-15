# Rule 2: the shadow review's gate score is computed, not estimated by the model

**Rule:** CLAUDE.md Rule 2, "numbers, verdicts and governed content come from
deterministic engines; the model narrates."
**Finding:** item 21 on `docs/work-orders/README.md` (2026-10-04, unclaimed),
first half: `run_shadow_review`.
**Date:** 2026-10-05.

## The defect

`runShadowReview` (`server/services/shadow-review/shadow-review-service.ts`)
asked the model for `rtfRiskScore` and `crlRiskScore` in [0, 1]: "the
likelihood of a Refuse-to-File and a Complete-Response-Letter". The model saw
leaf codes and titles only. The run recorded the higher of that figure and the
aggregate of its findings' severities, so the model set the number every time
it was higher. Submission Center, the Shadow Review surface and AnA all print
that number.

The prompt also asked the model to score an empty sequence "near 1.0", and that
was the only safeguard. A model that answered 0 left an empty sequence recorded
at 0% risk with no critical finding, so nothing blocked its dispatch.

## The change

- **The score.** A run records the aggregate of its findings' severities
  (`aggregateRisk`, unchanged) and nothing else. The model's figures are no
  longer parsed.
- **The empty sequence.** It is a critical refuse-to-file finding the server
  records itself (`EMPTY_SEQUENCE_FINDING`). The dispatch gate counts it like any
  other critical.
- **The prompt.** `shadow-review@v1.1` asks for findings and a summary, and for
  no figure; `CHANGELOG.md` says why. v1.0 stays on disk for the runs it
  produced.
- **Labelling.** Every run and view row carries `scoreBasis`:
  - `severity_aggregate` for new runs;
  - `model_reported` for runs recorded under v1.0.

  The Shadow Review surface words each one accordingly. It used to call the
  score "the run's own verdict, NOT a count of the findings"; for a new run it
  now says the score is computed from the severities the reviewer model
  assigned. The AnA tool description (`run_shadow_review`) says the same.
- **The capability manifest.** `docs/ana-capability-manifest.json` is
  regenerated (`npm run manifest:ana`). It was already stale on trunk, listing
  762 tools against 789 defined, so the regenerated file also brings other
  lanes' tools current.

The severities are still the model's judgement. That is narration of findings,
which Rule 2 allows; the arithmetic on top of them is not.

## The contract

`server/services/shadow-review/__tests__/shadow-review-output-validation.pglite.test.ts`:

| Case | Before | After |
| --- | --- | --- |
| A model's 0.95 beside one minor finding: the run records the aggregate of that finding (0.275) | **fail**: 0.95 recorded | pass |
| An empty sequence, model says 0: a critical finding and RTF 1 | **fail**: 0, no critical | pass |

`shadow-review-view-assembler.pglite.integration.test.ts` adds a case: each
row's `scoreBasis` follows the prompt version that produced it.

- `red/before.txt`: both new cases fail; the other 6 pass.
- `green/after.txt`: 47/47. That covers the shadow-review service, the view
  assembler, the prompts-directory guard, and the two surface suites
  (`shadowReviewGateScore`, `emptyStateBatchB`).

## Still open (the second half of item 21)

`plan_submission` returns the model's timeline offsets and clocks beside the
reasoning engine's deterministic plan, and the two can disagree. It is a
separate change: `server/services/ana/regulatory-knowledge-tools.ts` was
changed by another lane at 2026-10-04 23:33 and is inside its 24-hour window.
