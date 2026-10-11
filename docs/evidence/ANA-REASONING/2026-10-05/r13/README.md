# A refused insert says only what is true, in its own words, and a pasted AnA suggestion keeps the turn it came from

Round 13 of the founder-directed AnA reasoning lane (founder, 2026-10-04:
*"Enhance the reasoning layer of ANA"*). Board row: "AnA's reasoning is checked
by an engine, and the check is what the reviewer sees and the record keeps"
(`docs/work-orders/README.md`).

It supports two launch rows:
- **D5, the Part 11 record.** AnA's words stay attributable through the paste
  door, and the audit rail shows what the decision row keeps.
- **D2, the launch catalog.** Authoring's refused offers are accessible and
  truthful.

It answers round 11's four-lens UI review (microcopy, a11y, Part 11 UX, honest
state) of the insert gate (`../r11/`).

## What was wrong

**The refusal sent the person to a control that does not exist.** "Ask again
with Thorough effort to have an approved model write it" names an effort
control neither the editor's AnA pane nor the conversation draws. In
production no approved model has passed performance qualification yet, so
asking again ended in a second refusal.

**Refusals stated things the record does not say.**
- "Written in part by X" asserts which words X wrote; the record shows only
  that X served a call in the turn.
- "This answer's record does not say which model wrote it" was shown for a
  reopened conversation, whose record exists on the server; this view was only
  not told.

**An answer that did not finish could be inserted.** A turn the person
stopped, whose stream failed, or whose answer was cut off was offered as a
finished one. That includes the "AnA is unreachable…" error sentence of a
failed turn, under an approved model.

**Refusals were hard to read, see or tell apart.**
- Every conversation turn without a record id shared one element id. In a
  reopened conversation every refused button was described by the FIRST
  turn's reason.
- The refused button kept the live look and hover.
- Its reason sat at 4.50:1, the bare minimum.

**A pasted AnA suggestion lost the turn it came from.** The paste door made it
the pasting person's and dropped its turn. The decision then filed AnA's words
as the person's own, with no source: the defect the editor's own lineage
comment names ("the audit trail says a human authored words a model
produced"). A pasted AnA *deletion* kept her name. With track changes on, a
paste lost the turn whoever wrote it.

**The audit rail showed none of what the decision row keeps.** Since round 10
the row records the AnA turn a decided change came from, verified against the
words, and every model that wrote them with RULE 2's verdict. An inspector
could not see that an accepted AnA insertion came from a model not approved to
write governed text.

## What changed

| Where | What |
|---|---|
| `client/src/concept2cure/v2/editor/anaInsertGate.ts` | **Every refusal rewritten to say only what this view knows, in the activity strip's words.**<br>• No remedy the screen cannot carry out.<br>• "More than one model worked on this answer, including X", never "written in part by".<br>• "The model that wrote this answer can't be checked" when this view was not told; "This answer's record names no model" only for a list the server sent empty.<br>• "…has not passed performance qualification… Asking again will not change that."<br>**`answerUnfinished`**: a stop, a failed stream, a cut-short phase, a cancelled run, or an answer cut off. `anaInsertRefusal(record, unfinished)` refuses an unfinished answer first. An answer the round limit forced to an end is whole text, and is not refused for it.<br>**The header states where the rule is applied:** in the browser only, until the server checks it at save (SEC-A-7, its own round). |
| `client/src/concept2cure/v2/surfaces/ConversationThread.tsx` (another lane's window: added lines, and round 11's own lines) | **One id per refused offer** (`React.useId`, above the early returns).<br>• Whether the answer finished is carried on the turn and passed to the gate and the bridge.<br>• The reason is at `var(--text-300)`, 12px. |
| `client/src/concept2cure/v2/fixtures/conversation-thread-data.ts` (another lane's window: one added field) | `CtTurn.unfinished`. |
| `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` | **The pane's offer.**<br>• Gets `useId` and the same contrast.<br>• Passes whether the answer finished.<br>• The bridge's `insert` takes it too, and re-checks it.<br>**The toasts.** They name the section the text went into and say why an insert failed.<br>**The audit rail** (`describeAuditMetadata`):<br>• each decision's AnA turn, verified or not and why, with the models that wrote the words and RULE 2's verdict on each;<br>• "verified against its turn record" for a proposer the record vouches for;<br>• a bulk decision's count of changes from AnA turns, and how many of them a model that may not write governed text wrote;<br>• an accepted AI draft's turn record (round 12). |
| `client/src/concept2cure/v2/editor/suggestions.ts` | **The paste door keeps the turn.**<br>• A pasted AnA suggestion the host does not admit becomes the pasting person's, still naming its turn, so the decision names it and the server verifies the words (round 10).<br>• A pasted AnA deletion is swapped as an insertion is.<br>• With track changes on, a paste or a drop is the person's insertion still naming each pasted insertion's turn; text the person types carries none, and a pasted deletion's turn is not credited with the words it struck. |
| `client/src/concept2cure/v2/styles/app-v2.css` (another lane's window: added rules) | **A refused offer looks and hovers like the off control it is**, as `.ct-head-open` does. |

## Decisions made here, as this lane's PM

- **A pasted AnA suggestion stays insertable as the person's, with its turn.**
  Refusing it would push the person to copy the rendered answer instead,
  which carries no mark and no turn: the record would lose the origin
  entirely. Kept, the decision names the turn, and the rail shows the model
  and RULE 2's verdict. Whether the server should refuse such text at save
  is decided with SEC-A-7.
- **With track changes on, a moved AnA suggestion is the person's insertion,
  naming AnA's turn**, as a move is in any tracked editor. The words keep their
  origin; the proposer is who placed them.
- **No effort control was added to bring the "Thorough" remedy back.** In
  production it would end in the PQ refusal. Whether drafting-surface turns
  should run on an approved model is a routing decision with a cost. Round 7
  narrowed it deliberately (its biology-classifier and cost reasons), so it is
  its own row.

## Not done here

- **`EditorBridge.propose` is not gated yet.** It has no production caller. Its
  test file is inside another lane's window until 2026-10-05T21:26Z, and the
  gate needs every one of its calls changed: next.
- **The server does not check the rule at `PATCH /sections/:id` or at
  `from-draft`** (SEC-A-7): its own round. Until then the gate's header says it
  is browser-only.
- **Admission after a reload.** A turn admitted in an earlier session is not
  admitted after a reload; this needs a server read of `servedBy` by turn id
  that a reviewer may call.
- **The revision's lineage records an adopted AnA suggestion as the person's
  text.** The decision row names its turn. Recording it as machine text is
  decided with SEC-A-7.

## Proof

Filed beside this README: `red.txt`, `green.txt`, `related.txt`, `mutants/`,
`lint.txt`, `tsc.txt`, and the review (`review.md`).
