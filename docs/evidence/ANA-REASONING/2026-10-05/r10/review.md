# The insert check's plan, refuted before it landed

GRD-missed (medium) on round 1's map: *"Insert into section as tracked
suggestion" carries no check with the inserted text.* Two independent agents,
read-only, on trunk `75721cdae` and then on `65b92951b`:

- a mapper traced every path by which AnA's text reaches a governed section,
  and proposed a fix;
- a skeptic tried to refute the defect, the fix and the hot-file reading.

Rounds 10 (the record) and 11 (the insert, the strip and paste) answer it.
Each finding below is the skeptic's, with what was done.

## The defect

**It holds, and it is the last open door.** These doors already refuse a model
without a passed PQ in production:

- governed tools (`AnaToolExecutor.ts`);
- governed commands and confirmed proposals (`command-executor.ts`,
  `proposal-as-confirmed.ts`);
- the AI draft panel and batch draft, at the gateway (`document_drafting`).

The insert does not. Two doors reach it:

- the pane's "Insert into {section} as tracked suggestion";
- the conversation's `InsertIntoOpenSection`.

Each carries only `{id:'ana', name, sourceRecord?}`. The accepter sees
"AnA (AI draft)" and the first 80 characters. Neither the model nor the
answer check reaches them, and the pane's chat offers every past answer to
whatever section is open now.

**Two corrections to the mapper.**

1. **The record pinned the turn, not the words.** The decision row already
   names the sealed turn record by id and SHA-256, so its model and check were
   reachable. What was missing was a binding between the words decided and
   that record:
   - `describeTrackedChange` took the text from the request;
   - the source was `verified: true` whenever the record existed.

   The decisions suite pinned exactly this: bulk "b-own" decided "From our
   turn." against a turn that answered "Draft paragraph for 2.5.4.", and
   recorded it as verified.
2. **With track changes off, the database default, a person's typing inside
   AnA's pending insertion keeps AnA's mark and turn id.** The probe shows
   "ORR 42%" edited to "ORR 24% (unconfirmed)" staying one AnA range.

## The fix as first proposed

| # | Finding | Outcome |
|---|---|---|
| 1 | Filing a model and a check on the decision row from `resolveTurnRecordSource` would attach them to text the record may not hold (b-own; the tracking-off edit). | **Round 10.** The source is verified by the canonical claim verifier: the record verifies whole and holds the words decided. Words it does not hold are recorded as "the turn record does not hold this text", and AnA is not their verified proposer. |
| 2 | Recomputing `record_text`'s SHA-256 duplicates `verifyStoredTurnRecord` and `verifyMachineText`, which already bind text to a record. | **Round 10.** `verifyMachineText` is reused, and nothing is recomputed beside it. |
| 3 | A second "which model wrote this record" reader. `machine-claim-verify` read `model.model`, which is only the first call's model. | **Round 10.** There is one reader, `servedModelsOf`, which reads every call. The claim verifier uses it. |
| 4 | Gating only the insert leaves other ways in: paste with the mark (tracking off), stored pending suggestions, and a revert. | **Round 11**: the paste door. Stored suggestions and the revert are disclosed there. |
| 5 | The plan borrowed round 7's six routing roots for a drafting rule that applies to every section. That inverts the rule: an unapproved model's text could go into 3.2.P.5 while approved text was refused for 2.7.4. | **Round 11 decides it.** The insert follows the governed-write rule the platform already applies to every door that stores model-authored text (D4: "tools and routes that store model-authored content refuse an unapproved serving model"). That rule applies to every section. |
| 6 | "The accepter sees the check" would hold only for the person who inserted, in the same session. | **Round 11 states it.** The accepter sees the check only where this session holds it, and the gate is the control. |
| 7 | Several planned red tests pass on trunk. | **Done in each round.** Tests that pass on trunk are labelled negative controls, and each is shown red by its mutant. |
| 8 | Stale anchors after round 9: schema `/3`, and `requestId` and `sent` on each call. | **Done.** `servedModelsOf` is written against `/3`. |

## Paths the mapper missed, and where they went

- **Paste of a pending AnA insertion, tracking off.** It keeps
  `data-author-id='ana'` and the turn id: round 11.
- **Edits inside a pending AnA insertion, tracking off.** The words are not
  the turn's. Round 10 records them as such at decision time; round 11 marks
  them in the strip.
- **Section revert.** It restores stored pending marks without the gate. This
  is disclosed in round 11; the route is another lane's.
- **Editor hosts with no `track`, such as the eCTD co-author pane.** They show
  Accept with no decision row. This is low severity, handed on.

## What the review did not refute

- **The client impact.** Model text from a model not approved for regulatory
  drafting enters governed sections. The accepter cannot see which model
  wrote it or what the check found.
- **The direction.** The fix is deterministic: a server-sourced served model,
  one gate, and the existing check rows. It adds no model call, tool or
  surface.
