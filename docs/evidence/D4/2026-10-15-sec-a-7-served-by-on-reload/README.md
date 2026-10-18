# SEC-A-7, door 3: a reopened conversation knows which models served each turn (2026-10-15)

**Row:** D4 (governed AI drafting; supports D5's AnA-draft → canvas → editor →
Vault path). **Lane:** `docs/work-orders/README.md` §0.

## The defect

The client insert gate (`client/src/concept2cure/v2/editor/anaInsertGate.ts`)
decides "Open as document" and the editor's insert from the models that served
a turn (`servedBy`, with RULE 2's verdict on each). The live stream supplies
that list. A conversation read back from history took its records from
`GET /api/ana-ri/turn-records`, which did not, so **every reopened answer was
refused** as "This page has no record of which model wrote this answer",
however it was served. The AnA-draft path worked only in the session that
produced the draft.

## What changed

- `server/services/ana/turn-record-verify.ts` `listTurnRecords`: opt-in
  `withServedBy`. The flag is bound (`$2`), not spliced into the SQL. With it,
  each row carries `servedBy` = `qualifyServedModels(servedModelsOf(body.model))`
  from the stored record text, only when:
  - the text still matches its hash;
  - the turn finished (`outcome = 'answered'`);
  - the record is at most 256 KiB, so a 500-row reload cannot pull 500 large
    bodies.

  Otherwise `servedBy` is absent and the gate refuses. The other two callers
  (lineage dossier, from-draft's run lookup) do not opt in and do not read the
  text.
- `server/routes/ana-ri/turn-records.ts`: the listing opts in. `servedBy` is
  kept in the non-asker shape: it names models and verdicts, nothing about who
  asked.
- `client/src/concept2cure/components/ana/anaTurnTimeline.ts`: a reloaded
  record keeps the listing's `servedBy`.
- `client/src/concept2cure/v2/editor/anaInsertGate.ts`: `answerUnfinished`
  counts `stoppedReason: 'client_disconnected'` as unfinished.

## The finding the review caught (blocking, fixed here)

The old refusal of every reloaded turn had been hiding a gap. A turn whose
connection dropped is saved with the text that had streamed and
`stoppedReason: 'client_disconnected'` (`stream.ts` `persistStoppedAnswer`).
Live it reads as interrupted. Reloaded, nothing marked it unfinished, so once
`servedBy` arrived, a qualified model's cut-off answer would have been offered
for "Open as document". Closed twice:
- on the client, `client_disconnected` is unfinished;
- on the server, a non-`answered` turn lists no `servedBy`.

## Authority stays on the server

The listing is the browser's offer, not the authority. Its hash check does not
walk the audit chain. Every server door re-reads the record in full before it
credits model prose, as the security reviewer confirmed:
- `POST /docs/from-draft`: `servedModelsForTurnOrRun` → `readRecord` with
  `verifyStoredTurnRecord`;
- the section save: `verifyMachineText` with `mayVouch`;
- tracked-change decisions: `resolveTurnRecordSources`;
- section revert: contributors from the stored revision.

## Verified by making it fail

| Removed | Red |
|---|---|
| The route's opt-in and the client's keep | the listing test and the client reload test (2) |
| `outcome = 'answered'` in the listing | "a turn that did not finish lists no models" |
| `client_disconnected` in `answerUnfinished` | the unfinished-text test |

Restored → green. Suites: `turn-records.pglite` (17), `anaInsertGate`,
`anaTurnTimelineServedBy` (2, new). Related client and server suites:
106 files / 1006 tests pass.

`authoring-image-access.pglite.test.ts` fails identically on trunk without
this change (its fixture creates `users` twice, 42P07). It is handed to the
trunk-green lane.

## Gates

`typecheck:fast` 0. `ci:sql-interpolation` OK at 1068, unchanged: the new flag
is a bound parameter. eslint has 0 findings.

## Not done here, named

- The 256 KiB cap has no test: no fixture builds a body that large.
- `POST /docs/from-draft` creates the document for an `unverified` or `refused`
  turn and labels it so rather than refusing it. That is pre-existing; whether
  a non-`answered` outcome should be refused at that door is a decision for the
  SEC-A-7 lane.
