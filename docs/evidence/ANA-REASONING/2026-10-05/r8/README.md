# Working memory keeps only what a checked answer found

Round 8 of the founder-directed AnA reasoning lane (founder, 2026-10-04:
*"Enhance the reasoning layer of ANA"*). Board row: "AnA's reasoning is checked
by an engine…" (`docs/work-orders/README.md`). This round closes FV-missed
(working memory, medium) from round 1's map
(`../../2026-10-04/map-findings.md`), in the form an adversarial review asked
for (`review.md`).

## What was wrong

- **A second model call writes the working memory, unchecked.** The thread
  write-back (`working-memory.ts`) asks the summarizer for:
  - "Key Facts", which its prompt calls "Established facts that should not be
    contradicted";
  - decisions, open questions, next actions and an objective.

  Nothing checked what it wrote. It fires once a conversation reaches 20
  messages.
- **Every later turn reads it as memory.** It is a system message on every
  later turn of the conversation.
- **It reaches other people's conversations.** After seven days the
  consolidation job promotes it into the project's memory. That memory sits
  in the stable prefix of every colleague's conversation in the project, as
  "Learned Project Intelligence … knowledge atoms from documents".
- **So an invented figure becomes an established fact.** A figure the answer
  check had reported "not found", such as an invented ORR, could become a fact
  the model is told not to contradict, and then a "knowledge atom" in a QA
  colleague's conversation. It could be a figure no answer stated at all,
  since the summarizer writes its own sentences. The same path carried
  invented trial identifiers and stated verdicts ("the dossier is ready to
  file").

## What changed

| Where | What |
|---|---|
| `shared/ana/answer-check-reader.ts` (moved) | **The one reader of a stored answer check, now shared by client and server.** It was `client/…/ana/anaAnswerCheck.ts`, which re-exports it, so no importer changed. The move brought it under lint: the client path is outside ESLint's scope. Its field readers became small helpers, with unchanged behaviour (the client's check suites pass unedited). |
| `server/services/ana/memory-fact-check.ts` (new) | **`settleSummary` / `settleItem` decide what may stand in memory.** They reuse the answer engine (`checkAnswer`) and each answer's stored check. An item is kept only when all of these hold:<br>• it is a sentence;<br>• it states no verdict;<br>• no claim in it matches a claim any answer's check reported not found;<br>• every claim in it was found by ONE answer's check.<br>An item that claims nothing checkable is kept.<br>**One answer, not two.** Two answers' findings are never pooled: "NCT02222222 reported 45%" is not vouched for by one answer that found NCT02222222 and another that found 45%.<br>**Only a figure's own numbers.** A found figure vouches only for its own numbers: the 95 of "HR (95% CI) 0.62" vouches for nothing. |
| `server/services/working-memory.ts` | **After the summarizer replies, the write-back settles every field the summary renders or the consolidation job promotes,** then stores the result. It reads them against:<br>• the thread's stored checks, read only after the refresh gate, at most the last 200 answers;<br>• the current answer's check, which it is handed because that message may not be stored yet.<br>What was withheld is kept on the row, never rendered. An unreadable thread vouches for nothing, and the row is still written. A malformed summary is settled field by field, never read one letter per fact. |
| `server/routes/ana-ri/post-processing.ts` | **The write-back is handed the turn's check.** One added line inside the call, plus a one-line reader beside the context type. |

## What it costs, stated

The rule fails closed. Three kinds of legitimate fact are withheld from memory
once they leave the 20-message history window:

- **A value only the person stated**, such as "our batch size is 200 kg". It
  is theirs, not a finding (`fromPerson`).
- **A figure AnA read from an attached PDF.** The check cannot open the bytes,
  so the claim is `unchecked`.
- **Anything a door that stores no check summarised:** `send-message.ts` and
  `cortex-unified.ts`.

Whether a value the person stated should stand in memory, attributed to them,
is the next decision. It is not taken here.

Engine limits pass the rule, and remain:

- **Figures written in words** ("forty-five percent") or as bare proportions
  (0.45), R2-WORDS.
- **Verdict shapes the engine does not name.** "FDA agreed that a single
  pivotal trial is sufficient" is a fabricated agreement in this class.
- **A bare percent carries no measure.** So a dropout rate of 45% that one
  answer found vouches for "ORR 45%". The exception is when some answer
  reported the ORR figure as not found; the deny pass catches that, and the
  tests pin it.

## Proof

- **Red first.** `red.txt` runs the round's tests against trunk's
  `working-memory.ts` and `post-processing.ts`, with the new module set aside:
  - the four write-back cases fail;
  - the post-processing case fails;
  - the unit suite cannot load its module.

  The threshold guard passes there, as a negative control; its red is mutant
  W01.
- **Green.** `green.txt`: 92 tests in 14 files. That is round 8's three
  suites, every working-memory and post-processing suite, the consolidation
  job's database suite, and the client's answer-check suites.
- **Related suites.** `related.txt`: 6,475 tests passing. The three failing
  files are rounds 6 and 7's three, none of them this round's.
- **Mutants.** `mutants/summary.txt`: 16 of 16 killed on the first run. Each
  reverts one rule: the deny pass, pooling across answers, masking, verdicts,
  non-strings, the count guard, fields beyond Key Facts, the objective, the
  engine pin, per-character lists, reading before the gate, the current check,
  a failed read dropping the row, no settle, and the check not handed.
- **Lint.** `lint.txt`. `working-memory.ts` drops a warning, because the
  write-back's complexity is now under the limit. `post-processing.ts` keeps
  trunk's four warnings at the same complexity, and the new files have none.
- **Types.** `tsc.txt`: the whole-tree typecheck.

## Edits inside another lane's window

`post-processing.ts` was inside two merges' windows: `3310d6c62`, which
merged row 100's work, and `df4022056`. This round only adds lines: one
inside the write-back call, after a line blamed 2026-10-01, and a one-line
helper above the context type. None of those merges' lines changed.

`working-memory.ts` is cold; its only commit in reach is 2026-09-05.

## Not done here

- **Values the person stated.** Should they stand in memory, attributed to
  the person? That is a decision for this lane's PM, next.
- **Two other memory writers.** The conversation-keyed write-back and
  `context-intelligence.ts`'s separate writer, which no client calls, are
  unchanged. `orchestrator.ts`'s `extractThreadIntelligence` has no caller.
  All three are recorded for the memory lane.
- **Rows already stored before this round** keep what they hold. The next
  refresh writes a settled row; old rows are not rewritten.
