# The "Draft from sources" door files a turn record and checks the draft against what the model was shown

Round 12 of the founder-directed AnA reasoning lane (founder, 2026-10-04:
*"Enhance the reasoning layer of ANA"*). Board row: "AnA's reasoning is checked
by an engine…" (`docs/work-orders/README.md`). It supports launch rows D5 (the
Part 11 record) and D4 (the validation package: URS-AUTH-012, OQ-AUTH-16).
This round closes RT-6 from round 1's map (`../../2026-10-04/map-findings.md`).

The plan was mapped and adversarially verified before it was built: workflow
`wf_9a8268b5-b21`, summarised in `review.md`.

## What was wrong

- **The door wrote no record and ran no check.**
  `POST /api/authoring/sections/:sectionId/ai/draft`, the editor's "Draft from
  sources", makes one model call and returns a section draft. It wrote no AnA
  turn record and ran no answer check.
- **Its accept files the text as AnA's.** It writes the working copy and the
  filing with lineage that names AnA (`draftSource 'ana'`).
- **The Part 11 row could not be checked.** It named the model and a SHA-256
  of a prompt the system never kept, so the hash could be checked against
  nothing.
- **Bad drafts reached the accept unflagged.** In the mapper's probe, a draft
  said:
  - 45% where the source says 31%;
  - 36 months where it says 24;
  - "21 CFR 312.21", which no source holds;
  - that the section "is fully compliant".

  The same engine flags all of it under every AnA answer and every governed
  proposal. Here nothing did.
- **Its validation step could never pass.** OQ-AUTH-16 recorded a deviation on
  every answer, including a correct one.

## What changed

| Where | What |
|---|---|
| `server/services/ana/turn-record-draft.ts` (new) | **The door's turn, composed from the existing record and engine** (`TurnRecorder`, `writeTurnRecordSafely`, `verifyTurnAnswer`). Nothing in it is a new engine.<br>• The record is opened **before** the model is asked, with the one message it is sent.<br>• It records the model and the gateway request that served the call, the raw answer, and the draft.<br>• The check reads **what the model was shown**: the Data Room evidence after its 600-character cut and before the block's instructions to the model (`evidenceShown`), and the section header lines exactly as the prompt shows them.<br>• The person's own context and requirements are passed as theirs, so a figure only they gave reads as theirs, never as found.<br>• A failed or empty retrieval consulted nothing, so every claim is unchecked. The record says why in the retrieval service's fixed sentence (`RETRIEVAL_STATUS_MESSAGE`), never the raw error.<br>• The labels reading is recorded as void for this door, and says so. |
| `server/routes/authoring.router.ts` | **Opened before the call, filed on every exit.**<br>• Filed `failed` on a gateway refusal, on an empty answer, and on a fault of ours in the model call or after it, each in a fixed sentence.<br>• Filed `answered` with the draft before the candidate is parked.<br>• The response carries `draft.check` and `draft.turnRecord`.<br>• The parked generator names `requestId` and `turnRecordId`, so the accept's trail row carries both.<br>All edits are added lines inside the handler. |
| `server/services/clinical-regulatory-evidence/draft-candidate-store.ts` | **The generator keeps the two ids** from park to accept. The reader is one helper, which also lowers its complexity. |
| `client/src/concept2cure/v2/surfaces/AuthoringAiDraft.tsx` | **The panel shows the engine's check before the accept:** "Checked as drafted, against the Data Room sources it was given", with the check's own rows (`AnswerCheckRows`).<br>• It says "your edits are not checked" once the author edits.<br>• It says when the draft was not checked or not recorded. Neither is ever shown as a pass. |
| `tests/validation/oq/authoring/run.mjs` | **OQ-AUTH-16 can pass.** A 5xx is still the deviation (no provider in the environment). A 200 is held to the provenance the door now returns: a parked candidate, its model, its recorded turn and its check. **The step must be re-executed with a PQ-passed model configured.** |

## What it costs

- **Reads and writes.** Each draft writes one turn record: its texts,
  including the prompt with the shown evidence, and one chained audit row.
- **Noise.** The panel shows "not found" rows for figures the model wrote that
  the evidence it was shown does not hold, including true figures from parts
  of a chunk past the 600-character cut. That is the honest reading: the
  model was not shown them.
- **The labels reading** is sealed as void for this door, and the record says
  why.

## Proof

- **Red first.** `red.txt`: round 12's suites against trunk `e78869eec`'s
  `authoring.router.ts`, `draft-candidate-store.ts` and `AuthoringAiDraft.tsx`,
  with the helper set aside. 14 of 42 tests fail; the 28 that pass are the
  files' existing tests.
- **The tests added after red.** Building the tests behind the review's
  findings found one more unfiled exit, a fault of ours inside the model call.
  Those tests each lead with an assertion trunk cannot meet, and each is shown
  red by its own mutant:
  - the header credited;
  - the labels note;
  - the raw answer;
  - both faults;
  - filed once;
  - a check that could not run.
- **Green.** `green.txt`.
- **Mutants.** `mutants/`: every one is killed.
- **Related.** `related.txt`: every suite of the door, its accept, its store,
  the batch doors, the turn record and its readers, the answer check, every
  authoring route suite, and the section-gate contract.
- **Lint and types.** `lint.txt`: no file gains a warning. `tsc.txt`: exit 0.
- **Review.** `review.md` records the skeptic's ten findings on the plan and
  what was done with each.

## Edits inside another lane's window

`authoring.router.ts` is inside the window of `46652c23e` (another lane, D3,
2026-10-04 20:58), which touched only `GET /sections/:sectionId/history`. This
round's edits are all added lines inside the draft handler. That handler's
lines are blamed 2026-09-22 to 2026-09-26, and none of them changed. The other
files are cold.

## Not done here

- **The truncated-envelope draft.** The door never reads `finishReason`; this
  is its own row.
- **The batch door has no check**, and the c2c ai-editing doors have no caller.
- **The AnA Command's `refine_with_validation` door** writes no record and runs
  no check; this is its own row.
- **The response still sends the client `retrievalError`**, the board's open
  item for this door.
- **The panel shows the record's status, not round 11's `servedBy` verdict.**
  The door's model is already held to RULE 2 at the gateway (`document_drafting`).
- **RT-missed:** the record's model input is taken before the gateway's PII
  redaction.
