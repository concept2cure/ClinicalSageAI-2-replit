# Door 1, first increment: the turn id reaches the server

Supports launch row **D4**. This is the **precondition** for door 1's verdict,
not the verdict itself, and it is worth its own increment because without it the
verdict cannot exist.

## Why this had to come first

The save door's governance problem is that `acceptedMachineText` is a **claim
from the request** — "a machine wrote these words" — and nothing checks it
against the turn record that would prove it. `verifyMachineText` exists and does
exactly that check, and it takes **a turn record id per claim**.

There was none. `AcceptedInsertion` held `{ authorId, text }`, so the PATCH
could say *which words* a machine wrote and never *which turn* wrote them.
Every claim was therefore unverifiable **by construction**: the save door could
only ever strip the attribution, and the verdict that refuses a *verified* claim
from a model RULE 2 does not admit could never fire at all.

The id was already on the client the whole way to that type — AnA's suggestion
mark carries it as `sourceRecord` and it rides on `SuggestionRange` — and
stopped there.

## What changed

| Where | What |
|---|---|
| `editor/suggestions.ts` | `AcceptedInsertion` gains `turnRecordId: string \| null`, **required** — a default of "no turn" is the one shape that would quietly make every claim unverifiable again. `rememberAcceptedAuthor` takes the mark's `sourceRecord` and records it **per insertion**, because two AnA drafts from different turns can be accepted in one session and the models that served one say nothing about the other. Both accept paths pass it. |
| `authoring/revision-ledger.ts` | `AcceptedMachineTextEntry` gains `turnRecordId`, parsed as an anchored uuid or null. Bounded and shape-checked **here** rather than at the store: the column is `uuid`, so a malformed value would raise 22P02 and abort the transaction the save is being written in — the hazard `resolveTurnRecordSources` and `servedModelsForTurn` both guard the same way. |

Nothing between the store and the request needed changing: `AcceptedInsertion[]`
already travels straight into the PATCH body as `acceptedMachineText`.

**Null is not a forgery**, and both halves say so: an older bundle, a plain
paste and text typed by hand all name no turn. Such an entry still travels and
still reaches the gate, where its words are recorded as the person's own with
the reason. Dropping it would lose the clause instead of attributing it
honestly — a mutant for exactly that is in `mutants/`.

## What this does NOT do

**The server does not yet use the id.** No verification runs at the save door
and no refusal is added; this increment only makes the claim *checkable*. That
is deliberate — it is a self-contained, verifiable change, and shipping it alone
has no server behaviour change at all.

## Proof

- Red first, both halves: 4 of 4 new server-parser cases failed (the entry had
  no such field), and 3 of 3 new client cases failed.
- `green.txt` — 69/69 across the three suites, and the wider editor and
  authoring regression.
- `mutants/` — six mutants, **all killed**: the store always recording "no
  turn"; each accept path dropping it; a malformed id passed through to a uuid
  column; an entry naming no turn being dropped; and the uuid matched
  **unanchored**, so a uuid buried in a longer string would be believed.

## Blast radius, and one guard made stronger

Three pre-existing assertions pinned the old `{ authorId, text }` shape and were
updated: one in `aiDraftAttribution`, twelve literals in `trackedChangeUndo`
(whose `settleAcceptedContributions` cases filter on **text**, so null is the
honest value there), and one that used `REVIEWER.id` rather than a quoted
literal.

The last one is a **source-regex guard** asserting both accept paths pass the
range's text — it exists because "a call site that drops the text records the
author and loses the words". It now requires `sourceRecord` too, for the same
reason in the same shape: a call site that drops the turn records the words and
loses which turn wrote them, and it would do so silently, because the argument
is optional at the type level so a caller with no turn can still record one.
