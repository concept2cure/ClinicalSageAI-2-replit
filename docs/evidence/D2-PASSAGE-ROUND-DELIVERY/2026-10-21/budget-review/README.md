# Review-stage private-read admission regressions

## What already exists

- `server/services/ana/agentic-loop.ts` already contains the initial passage
  whole-or-withheld implementation and unchanged private-read placement loop.
  The new early total uses fixed passage replacements. That can either avoid
  or activate the read-placement pass relative to the legacy capped total,
  changing read admission under supported custom ceilings/targets.
- The existing `passage-round-budget.test.ts` is already frozen and remains
  unchanged. Its private-read cases do not cross these two pressure decisions.
- `read-receipts.ts` already requires exact whole admitted bodies or its exact
  `notDeliveredResult(offset)` replacement; these tests isolate budgeting only.

This is **review-stage red proof against the initial implementation**, not
against the original pre-implementation baseline. The command records the
current seven production hashes and their equality to the initial
`green-command.json`. The original `baseline-inputs.json` differences are
recorded explicitly. No existing frozen test is edited.

Two independent expectations cover opposite changes in pressure: six private
3900-character reads plus an over-custom-ceiling passage must retain the old
five-whole/last-not-delivered decision; a private 50-character read remains
admitted when the legacy 200-character capped total fits but the new fixed
replacement exceeds the tiny target. Replacement integrity takes precedence
over asserting a hard total that cannot contain an irreducible envelope.

Tests call the real budget export over synthetic JSON bodies and a synthetic
private-map shape. Canonical setup mocks pg; no live DB/provider, source
admission, receipt settlement or model delivery is qualified. Raw transcripts
are byte-preserved. Root owns production, Git and the final green run.
