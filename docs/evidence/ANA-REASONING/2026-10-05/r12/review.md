# The draft door's plan, refuted before it landed

RT-6 (medium) on round 1's map: *the "Draft from sources" door writes no turn
record and runs no answer check.* Two independent agents worked read-only, on
trunk `65b92951b` and then on `2879ee384` (workflow `wf_9a8268b5-b21`):

- a **mapper** traced the door, its accept, its store and its panel, probed
  each one, and proposed a fix;
- a **skeptic** tried to refute the defect, the fix and the hot-file reading.

Round 12 answers it. Each finding below is the skeptic's, with what was done.

## The defect

**It holds, on the live path a client uses.** The workbench's "Draft from
sources" button (`DocumentWorkbench.tsx`, `data-testid="ai-draft-open"`) mounts
`AuthoringAiDraft`. That calls `POST /api/authoring/sections/:id/ai/draft`.

The skeptic re-ran the mapper's probes on `2879ee384`:

- **No record.** No `INSERT INTO ana_turn_records` is issued, and the prompt
  text is stored nowhere.
- **No check.** The draft states 45% where the source says 31%, and 36 months
  where it says 24. It cites 21 CFR 312.21, which no source holds, and says the
  section "is fully compliant". The engine flags all of it (3 of 7 claims not
  found, and one verdict), but the door never runs the engine.
- **Dropped ids.** The store's reader drops a parked `requestId` and
  `turnRecordId`.
- **Panel.** It has no check block.

The accept files the text as AnA's (`draftSource 'ana'`). Its Part 11 row
names a SHA-256 of the prompt. That hash can be checked against nothing,
because the prompt is kept nowhere. The gateway ledger hashes `'user:'` plus
the prompt, a different digest.

**Corrections to the mapper.**

1. **"No step compares the draft with the passages" is too strong.** The
   accept's lineage gate compares the accepted text, verbatim, with the parked
   chunks. But:
   - it runs only after the click;
   - it does not check figures, identifiers or verdicts;
   - it reads the **whole** chunk, not the 600 characters the model was shown.
2. **"Weaker than any other AnA drafting door" is overstated.** The callerless
   c2c ai-editing doors and the AnA Command's `refine_with_validation` door
   (`AnaCommand.tsx` → `/api/ai-actions/execute`) also write no record and run
   no check.
3. **Small slips.** Line numbers, and expired candidates are deleted when the
   *same organization* next parks a draft.

## The fix as first proposed

| # | Finding | Outcome |
|---|---|---|
| 1 | **The record was opened after the call (medium).** The turn would start after the model had answered. The refusal and fault exits were left unrecorded. | **Done.**<br>• The record is opened before `gw.route`.<br>• It is filed `failed` on every exit after that: the classified gateway refusal (its code, never its message), an empty answer, a fault of ours in the model call, and a fault after it.<br>• Each failed record states its exit in a fixed sentence.<br>• Tests: "opens the record before the model is asked", "a gateway refusal…", "a provider that answers with no draft…", "a fault of ours, in the model call or after it…".<br>• Mutants: D02, D03, D04, D19, D20.<br>• The skeptic named two failure exits; building the tests found a third. That is a fault of ours inside the model call's own `catch`, which returned 500 without filing. It is filed now (D19). |
| 2 | **Raw retrieval error text would be sealed into an append-only record (medium).** | **Done.**<br>• The record carries the retrieval service's fixed sentence (`RETRIEVAL_STATUS_MESSAGE`).<br>• The helper is never given the raw error.<br>• The test throws `connect ECONNREFUSED 10.0.0.1:5432` and asserts that the record holds the fixed sentence and not the thrown text (D08). |
| 3 | **The door is a validated function (medium).** URS-AUTH-012 is the package's only "partial". OQ-AUTH-16 deviated on every answer, including a correct one. | **Done.**<br>• OQ-AUTH-16 is a deviation only on a 5xx.<br>• A 200 is held to a parked candidate, its model, a recorded turn and the check's engine.<br>• The README names D4, D5 and URS-AUTH-012.<br>• **The step must be re-executed with a PQ-passed model configured.** This environment has no provider. |
| 4 | **The check's sources omitted the section header the prompt gives the model (low).** | **Done.**<br>• The header lines are passed exactly as the prompt shows them, as a `context` source, and only when retrieval found evidence.<br>• Test: "a citation the section's own heading gave the model…" (ICH E9 in the title).<br>• Mutants: D16, and D07 for the header-only case. |
| 5 | **Use `servedModelOf` rather than an inline triple (low).** | **Answered without it.**<br>• The helper passes the gateway response to `TurnRecorder.addServed`, which reads the same three fields with the same null defaults (`turn-record.ts`, `addServed`). No second builder exists.<br>• Importing `AnaToolExecutor.ts` for that pick would add the largest module in the service to the route's graph for nothing.<br>• D14 shows the call is recorded. |
| 6 | **A check shown above an editable draft goes stale once the author edits it (low).** | **Done.**<br>• Captioned "Checked as drafted, against the Data Room sources it was given".<br>• " — your edits are not checked" is added once the draft is edited (C02). |
| 7 | **The sealed labels reading is structurally void on this door (low).** | **Done.**<br>• Every record from this door says the labels reading is void and that the panel shows only the check (D17).<br>• No schema change. |
| 8 | **A shared helper "the batch door could later adopt" conflicts with zero duplication; `ana-intelligence.ts` is hot (low).** | **Done within the rule.**<br>• `turn-record-draft.ts` is this door's composition of the canonical recorder, writer and engine. It is not offered to the batch door.<br>• `ana-intelligence.ts` is untouched.<br>• No capability exists twice: both doors call the one recorder and the one writer. |
| 9 | **Round 11 was in flight in the same tree (low).** | **Done.**<br>• Round 12 was built on round 11 as committed (`e5893fcf4`).<br>• The record status is asserted with `toMatchObject`.<br>• The panel shows the record's status. It does not yet show round 11's `servedBy` verdict: not done here. |
| 10 | **The whole evidence block, instructions included, would be credited as evidence (low).** | **Done.**<br>• `evidenceShown` cuts the block at `--- END EVIDENCE ---`.<br>• The 600-character cut stays in one place, the route's own block (D09). |

## Paths the mapper missed, and where they went

- **OQ-AUTH-15/16.** Finding 3, done.
- **The section-gate contract** (`tests/schema-contract/authoring-section-gate.contract.test.ts`).
  It refuses before the handler runs. Re-run green: 28 tests (`related.txt`).
- **The retrieval contract.** Finding 2, done for the record. The board's own
  open item for this door stays open: the response still sends the client
  `retrievalError` beside an inline copy of the retrieval states.
- **The refusal and fault exits.** Finding 1, done, and one more found while
  building.
- **`servedModelOf`.** Finding 5.
- **Round 11 sequencing.** Finding 9.
- **The AnA Command `refine_with_validation` door.** No record, no check. Not
  done here; it is its own row.
- **The accept's lineage gate.** It verifies quotes against the whole chunk,
  not what the model was shown. Adjacent and low; not done here.
- **The model call names no user.** The ledger row the `requestId` joins to
  takes its organization from the tenant binding, but does not name the
  person. Low; not done here.

## Tests that would have passed on trunk

The skeptic named five assertions that pass on trunk as written. Each test here
leads with the assertion that cannot pass on trunk:

- `check.basis` and `check.notFound` are read from a check that trunk does not
  send. On trunk they fail with "Cannot read properties of undefined";
  `red.txt` shows each.
- The panel tests look for the `ai-draft-check` and `ai-draft-record` blocks,
  which trunk does not render. They fail with "Unable to find an element".
- No test asserts that the accept stays ungated. That would be a regression
  guard, not a red test, and nothing here changes the gating.

## What the review did not refute

- **The client impact.** An RA writer gets a draft with wrong figures and an
  unsourced regulation, sees nothing flagged, and one click files it as AnA's.
  An inspector asking for the AI input behind it got a hash of a text nobody
  kept.
- **The direction.** The fix makes no model call and adds no tool, schema or
  migration. Every figure in the check comes from the canonical engine
  (`checkAnswer` through `verifyTurnAnswer`). The check is advisory and does
  not block the accept, as on every other AnA door.
- **The hot-file reading.** `authoring.router.ts` is inside the window of
  `46652c23e` (another lane, `GET /sections/:sectionId/history`). Every edit
  here is an added line inside the draft handler, whose lines are blamed
  2026-09-22 to 09-26.
