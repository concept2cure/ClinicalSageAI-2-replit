# AnA's answer goes into a document only when every model that wrote it may write regulatory content

Round 11 of the founder-directed AnA reasoning lane (founder, 2026-10-04:
*"Enhance the reasoning layer of ANA"*). Board row: "AnA's reasoning is checked
by an engine…" (`docs/work-orders/README.md`). This round closes the insert
half of GRD-missed from round 1's map (`../../2026-10-04/map-findings.md`):
*"Insert into section as tracked suggestion" carries no check with the
inserted text.*

- Round 10 made the decision record honest.
- This round adds the control: the insert gate and the paste door.
- The plan was refuted before either round landed (`../r10/review.md`).

## What was wrong

- **Every door that stores model-authored text refuses a model that RULE 2
  does not admit, except the insert.**
  - Governed tools, governed commands and confirmed proposals refuse such a
    model.
  - So does the gateway, for the AI draft panel and batch draft
    (`document_drafting`).
  - "Insert into {section} as tracked suggestion" did not. Any answer went
    into any section as AnA's pending suggestion: from the editor's AnA pane,
    and from the conversation beside the open document.
- **The pane offered every past answer to the section open now.**
  - The pane's chat is never reset, so an answer asked with 3.2.P.5 open on
    the standard tier could go into 2.7.4.
  - The model that served such an answer is not approved for regulatory
    drafting.
- **A paste was a second way in.** With track changes off (the database
  default), a copied AnA suggestion pasted elsewhere kept her name and turn.
  It never met any rule, and its accept was filed as hers.

## The product decision, and what it costs

As product manager for drafting, I apply the rule the platform already
applies to every door that stores model-authored text. The launch definition
records it under D4: *"tools and routes that store model-authored content
refuse an unapproved serving model"*. The predicate is the same
(`isServedModelApprovedForHighRisk`). It applies **in every section**, as it
does for those doors, and not only in round 7's six summary sections.

Round 7's list was chosen to decide what routing costs. Used as a drafting
gate it inverts RULE 2: an unapproved model's text could go into 3.2.P.5 while
an approved model's text was refused for 2.7.4 (`../r10/review.md`, item 5).

**The cost, stated plainly:**

- **In production today, no answer can be inserted.** No approved-models entry
  has a passed PQ yet, so no model qualifies.
  - Production already refuses the AI draft panel, batch draft and every
    governed write for the same reason.
  - The insert was the one door left open.
  - It opens when a PQ passes (for launch: Claude Opus 5.5, per the launch
    definition), with no code change.
- **Outside production, an answer from a model not approved for regulatory
  drafting is refused.** The standard tier's model is one such. The refusal
  names the model and the remedy: ask again with Thorough effort, which routes
  to an approved model.
  - An approved model whose PQ has not passed is not offered that remedy,
    because it cannot help. The refusal says the PQ has not passed.
- **It fails closed.** These are refused, each with its own sentence and
  "Ask again for an answer you can insert":
  - an answer whose record does not say which models wrote it;
  - a record that was not filed;
  - a record that is unconfirmed;
  - an answer loaded from the conversation's history. A reopened thread
    rebuilds no record status (RT-7), so its earlier answers cannot be
    inserted until RT-7 is fixed.
- **A pasted AnA suggestion keeps her name only when this session's gate
  admitted its turn.** Any other becomes the pasting person's suggestion, with
  no turn, which is what a paste with track changes on already records. That
  includes a suggestion carried from another session or document.
  - Moving AnA's suggestion by cut and paste after a reload therefore names
    the person. It loses nothing of the text, and only what the platform can
    vouch for keeps AnA's name.
- **A refused offer is disabled, not hidden.** Its reason is visible text that
  the control is described by (GE-P-3), in the pane and in the conversation.

**The founder's alternative is one identifier.** The gate could read
`approvedForHighRisk` alone, dropping the PQ condition for this door. That
would let a PQ-pending approved model's text in, against RULE 2 as written and
unlike every other drafting door. I have not taken it.

## What changed

| Where | What |
|---|---|
| `server/services/ana/turn-record.ts` | **The filed status names the models that wrote the turn.** `writeTurnRecordSafely` returns `servedBy`, read from the sealed record: round 10's `servedModelsOf`, with `qualifyServedModels`. `post_done` carries it with no change to `post-processing.ts`. |
| `client/src/concept2cure/components/ana/useAnaChat.types.ts`, `anaProgress.ts` | **The client keeps the list whole or not at all** (`AnaServedModel`, `readServedBy`). One unreadable entry drops the list, so it reads as unknown, never as a shorter list of approved models. |
| `client/src/concept2cure/v2/editor/anaInsertGate.ts` (new) | **`anaInsertRefusal`, the one gate.**<br>• It admits an answer only when every model that wrote it is named and qualified.<br>• Otherwise it gives the reason and the remedy.<br>• It fails closed on every status that does not name the models. |
| `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` | **One door, `insertAnaText`, for the pane and the bridge.**<br>• `EditorBridge.insert` takes the turn's record status and refuses AnA's text the gate does not admit, so no caller can bypass the check.<br>• The pane's offer is `AnaInsertOffer`: disabled, with its reason.<br>• The turns the gate admitted are remembered for the paste door. |
| `client/src/concept2cure/v2/surfaces/ConversationThread.tsx`, `fixtures/conversation-thread-data.ts` | **The conversation's offer follows the same gate.** The turn carries its record status, and the offer is disabled with its reason. |
| `client/src/concept2cure/v2/editor/suggestions.ts`, `RichSectionEditor.tsx` | **The paste door** (`reattributePasted`, in the track-changes extension, so every editor host has it). A pasted or dropped AnA suggestion whose turn the host does not admit becomes the pasting person's. Other authors' suggestions are left alone. The host passes `track.admitsAnaSource`. |

## Proof

- **Red first.** `red.txt`: round 11's suites against trunk's code for the
  eight files above, with the gate module set aside.
  - 11 tests fail, and the gate's suite cannot load.
  - Tests that pass there are negative controls, each shown red by its
    mutant: a qualified answer inserts, a person's paste keeps its author,
    track changes on already re-attributes, an unreadable list reads as no
    list.
- **Green.** `green.txt`: 91 tests in 7 files.
- **Related suites.** `related.txt`: 5,024 tests in 473 files, all passing.
  That is every client suite under `v2/` and `components/ana/`, every route
  suite under `ana-ri`, every turn-record suite, and the decision-source
  suites.
- **Mutants.** `mutants/summary.txt`: 22 of 22 killed on the first run. Each
  reverts one rule:
  - the gate admits all;
  - an unnamed model is admitted;
  - an empty list is admitted;
  - an unfiled record is refused for the wrong reason;
  - the PQ remedy is wrong;
  - "in part" is unsaid;
  - the reader keeps a partial list, drops the list, or keeps a non-boolean
    verdict;
  - the server sends no models, or only the first call's;
  - the pane or the bridge goes ungated;
  - an admitted turn is forgotten;
  - the conversation goes ungated, or sends no record;
  - the pane sends no record;
  - a paste keeps AnA's mark, ignores admission, or takes everyone's;
  - the editor or the workbench drops the admission.
- **Lint.** `lint.txt`: no file gains a warning, and the new files have none.
- **Types.** `tsc.txt`: the whole-tree typecheck, exit 0.

## Edits inside another lane's window

- **`DocumentWorkbench.tsx` and `useAnaChat.types.ts`** were in the merge
  windows of `3310d6c62` (row 100) and `df4022056`. Blame shows no surviving
  line from another lane's in-window commit. In `DocumentWorkbench.tsx` this
  round changes 27 lines: the pane's insert block, the bridge's insert line
  and the effect's dependency list. They are blamed 2026-09-22 (23) and
  2026-10-01 (4: `52697e0c4`, `4c8b5534d`, session `01Wcyqbq`). The rest are
  added. In `useAnaChat.types.ts` it changes 2 lines blamed 2026-09-26.
- **`ConversationThread.tsx` and `conversation-thread-data.ts`** are in the
  window of `1bee0b5eb` (another lane, 2026-10-05 02:35). That commit's lines
  are 26, 58-60, 95-97 and 309-311 of the thread, and 56-57 of the data. None
  of them changed. This round changes 6 lines of `InsertIntoOpenSection`, all
  blamed 2026-10-01 (`52697e0c4`), and adds a field after `sourceRecord`.
- **`suggestions.ts`, `RichSectionEditor.tsx`, `anaProgress.ts`** are cold, or
  only this session's.

## Not done here

- **What the accepter sees.** The review strip shows "AnA (AI draft)" and 80
  characters. Showing the model and the answer check per suggestion is the
  next round. A suggestion the person edited with track changes off is
  already recorded honestly at decision time (round 10).
- **`EditorBridge.propose`** has no production caller, and it is not gated
  here. A caller with AnA's text must apply `anaInsertRefusal` first; the code
  says so.
- **Disclosed and handed on:**
  - a section revert restores stored pending AnA suggestions without the gate
    (another lane's route);
  - "Open as document" writes settled sections with no model gate
    (`authoring-from-draft.ts`, inside another lane's window);
  - RT-7: a reopened thread rebuilds no record status.
