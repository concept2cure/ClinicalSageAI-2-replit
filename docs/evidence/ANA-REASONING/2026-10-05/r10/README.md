# A decided AnA suggestion is bound to the words its turn wrote, and names every model that wrote them

Round 10 of the founder-directed AnA reasoning lane (founder, 2026-10-04:
*"Enhance the reasoning layer of ANA"*). Board row: "AnA's reasoning is checked
by an engine…" (`docs/work-orders/README.md`). This round closes the record
half of GRD-missed from round 1's map (`../../2026-10-04/map-findings.md`):
*"Insert into section as tracked suggestion" carries no check with the
inserted text.* It does so in the form an adversarial review asked for
(`review.md`). Round 11 adds the insert gate, the review strip and the paste
door.

## What was wrong

- **The decision row vouched for words the turn never wrote.** When a reviewer
  accepts or rejects an AnA suggestion, the trail row names the turn record the
  suggestion came from. It recorded that source as `verified: true` whenever
  the record existed in the tenant, whatever words were decided, and AnA as
  their verified proposer.
  - The decisions suite pinned it: "From our turn." decided against a turn
    that answered "Draft paragraph for 2.5.4.", verified.
  - In the editor this happens with track changes off, the database default.
    A person's typing inside AnA's pending insertion keeps AnA's mark and turn
    id, so their words were filed as AnA's verified words.
- **No model was named.** The row named none. The record's one model reader,
  the claim verifier, read `model.model`, which is the first call's model even
  when a later round fell back to another.
- **So an auditor could not tell** whether the accepted words were the turn's,
  which model wrote them, or whether that model is allowed to write regulatory
  content (RULE 2).

## What changed

| Where | What |
|---|---|
| `server/services/authoring/authoring-record.ts` | **`resolveTurnRecordSources` replaces `resolveTurnRecordSource`.** It runs once per decision and verifies each change's source with the canonical claim verifier (`verifyMachineText`):<br>• the record verifies whole (hash, chain row, every text);<br>• the words decided are inside what AnA wrote, read as written and as markdown shows it.<br>A verified source names every model that served the turn (`servedBy`), each with RULE 2's verdict (`qualified`) and the two facts it rests on: the registry's `approvedForHighRisk` and the PQ status (`pq`).<br>New reasons: "the turn record does not hold this text", "the turn record does not verify", "no text was decided", "more AnA turns than one decision verifies (at most 8)". The existing three reasons are unchanged. |
| `server/services/authoring/machine-claim-verify.ts` | **Reads models through `servedModelsOf`.** A verified claim carries `servedBy`, `outcome` and its `index`. `model` is the one model that served the turn, or null when the record names several; it used to be the first call's.<br>The batch-draft accept's `recordedModel` is unchanged. Its records name one model and no calls, so it gets the same model as before (`batch-draft-accept-*` suites green). |
| `server/services/ana/turn-record-models.ts` (new) | **`servedModelsOf`, the one reader of "which models wrote this turn".**<br>• It reads every call, distinct, in the order each first served.<br>• It falls back to the turn's model where a door records no calls.<br>• A call with an unknown model stays in, as an unknown author. |
| `server/services/ai-governance/approved-models.ts` | **`qualifyServedModels`.** RULE 2's predicate (`isServedModelApprovedForHighRisk`) per model, with the entry's `approvedForHighRisk` and PQ status. A reader can then tell a model not approved for regulatory drafting from an approved one whose PQ has not passed. Those have different remedies: ask again on an approved model, or wait for the PQ. One added function; nothing else changed. |
| `server/routes/authoring.router.ts` | **The route resolves sources once per act.** `recordTrackedChangeAct` resolves every change's source, handing each change's words, and `describeTrackedChange` takes the source it is given. |
| `scripts/db/authoring-subsystem.d.mts` (new) | **Types for the applier.** The new suite builds the authoring schema from the applier's own file list, as `migration-set.d.mts` allows for its set. |

## What it costs, and what it does not do

- **Reads.** A decision now reads each named record whole (its texts) inside
  its transaction, instead of one row. This is bounded at 8 distinct turns per
  request, the batch-draft accept's bound, for the same reason. Changes from a
  ninth turn are recorded as unverified with that reason.
- **Containment, not authorship.** A short text, such as a table cell "42%",
  verifies wherever the answer holds it. The check binds the words to the turn
  that wrote them. It does not prove the person did not retype them.
- **`qualified` is what held when the decision was filed.** Outside production
  a PQ-pending model approved for high-risk work is qualified, and the row
  says `approvedForHighRisk: true, pq: 'pending'`.
- **Old rows keep what they say.** Nothing is rewritten.
- **Nothing is refused here.** This round records. The insert gate, and the
  accepter seeing the model and the check, are round 11.

**Honest inserts still verify.** `probe-insert-texts.txt` inserts a realistic
answer through the real editor, with track changes off and on: a heading,
prose with bold and a CI, a list, a table, inline code, a link and a CFR
quote. It sends each block's decision text through the verifier's matcher, and
all 30 of 30 are found.

## Proof

- **Red first.** `red.txt`: round 10's suites against trunk's
  `authoring-record.ts`, `machine-claim-verify.ts`, `approved-models.ts` and
  `authoring.router.ts`, with the new module set aside.
  - 9 tests fail, and the unit suite cannot load its module.
  - The decisions suite's other 11 tests pass there.
- **Green.** `green.txt`: 25 tests in 3 files. That is round 10's two
  suites and the decisions suite.
- **Related suites.** `related.txt`: 2,287 tests in 149 files, all passing.
  That is every suite that imports the changed modules, every authoring and
  authoring-record suite, the batch-draft accept suites, and every route suite
  under `ana-ri`.
- **Mutants.** `mutants/summary.txt`: 16 of 16 killed. The first 15 were
  killed on the first run; B17 was added with `approvedForHighRisk`. There
  is no B03: it was dropped before any run, because B01 already covers it
  (existence only). Each reverts one rule:
  - the words bound;
  - integrity read as integrity;
  - every call's model, not the first;
  - no single model for two;
  - qualification;
  - the deployment it is read for;
  - the PQ stated;
  - the approval stated;
  - distinct models;
  - unknown models kept;
  - the turn's model as a fallback;
  - one bounded read per decision;
  - the words handed over;
  - the proposer's verification tied to the source;
  - the no-text guard;
  - the right change.
- **Lint.** `lint.txt`: no file gains a warning, and the new files have none.
  The decisions suite was at 497 of 500 counted lines, so round 10's cases are
  a new suite.
- **Types.** `tsc.txt`: the whole-tree typecheck.

## Edits inside another lane's window

`authoring.router.ts` is inside the window of `46652c23e` (another lane, D3,
2026-10-04 20:58). This round changes 21 of its lines in
`recordTrackedChangeAct` and `describeTrackedChange`, all blamed 2026-09-29
(`7863cf830`, `f2134ea6d`). None of `46652c23e`'s lines changed.

The other files:

- **`approved-models.ts`** was touched by the merge `3310d6c62`. This round
  only adds a function after `isServedModelApprovedForHighRisk`.
- **`machine-claim-verify.ts`** is this session's batch-draft lane
  (`283fe08c4`, `c2851b97b`). Its changed lines are that lane's.
- **`authoring-record.ts` and the decisions suite** are cold (2026-09-29).
  Two pins in the suite add `servedBy`. Its bulk "b-own" now decides the
  turn's own words; the words the turn never wrote moved to the new suite,
  where they are refused.

## Not done here

- **Round 11:**
  - `post_done` carries the turn's served models;
  - the insert is refused for an answer whose model may not write regulatory
    content;
  - the review strip shows the model and the check;
  - paste re-attributes a refused AnA mark.
- **Handed on:**
  - the save path still records accepted machine text unverified (SEC-A-7,
    work order `docs/work-orders/README.md`);
  - "Open as document" writes settled sections with no model gate
    (`authoring-from-draft.ts`, inside another lane's window).
