# Door 2 of SEC-A-7: the record says which model wrote the draft

Supports launch row **D4**. This is the **blocking condition** round 14 placed
on its own decision: admitting the create is only honest if the verdict is
computed server-side and the caller cannot supply it
(`r14/README.md`).

## What was wrong

`provenance.model` was **caller input**, validated only as a string of at most
2000 characters, and `provenance.turnId` was **never looked up at all**. So any
authenticated member of the organisation could name any model, and that string
was written — inside `insertDocumentTx`'s single transaction — into three
records an inspector is shown and none of which can be amended afterwards:

- a `doc_revisions` genesis row carrying the full prose, append-only by trigger;
- an `authoring_audit_trail` row whose `after_content` IS the prose and whose
  `metadata` carries the provenance object verbatim, append-only by trigger;
- `document_span_lineage` spans saying a machine drafted it.

The red run shows it exactly: a POST naming `claude-opus-5-5` for prose the
record says `claude-sonnet-5` wrote stored **the caller's string**.

## What changed

| Where | What |
|---|---|
| `authoring-from-draft.ts` | `model` leaves `PROVENANCE_TEXT_KEYS`, so no caller can name it — dropped like any unknown key rather than refused, so a client still sending it keeps working and simply stops being believed. New `governedWriteOf()` resolves the named turn and returns the fields to merge: the record's `model`, every `servedBy` with RULE 2's verdict, and `governedWrite`. |
| `authoring-record.ts` | `servedModelsForTurnOrRun()` — the reference may name the turn RECORD (the browser card sends `m.turnRecord.id`) or the RUN that served it (the in-process tool, since stream.ts passes `turnId: runId`). Tries the record, then the run; rewrites the stored reference to the record it resolved to; refuses a run named by more than one record instead of guessing. |
| `authoring-draft-tool.ts` | Stops setting `provenance.model` from `ctx.model`. It had become inert — the service parses both callers' provenance — and a line that reads as attribution but does nothing is worse than no line. |

## `governedWrite` says what the rule says, not what happened

`'refused'` means **RULE 2 does not admit these words as governed content** —
not that the document was refused. The document exists and is marked. That is
round 14's decision and its reasoning is unchanged: refusing the create pushes
the person to paste the same prose by hand, which carries no mark, so the
lineage gate records it as the **person's** own work — the same words, the same
immutable tables, relabelled from "a machine drafted this" to "a person
authored this". The governed boundaries are where a `'refused'` document is
stopped, and they are the next piece of this round.

`'unverified'` means no record resolved, and `governedWriteWhy` says which —
in the words the decision path already shows a reviewer.

## One invariant, deliberately, and what it costs

**The model in this record comes from the turn record or not at all.** There is
no trusted second channel, because a privileged way to set the field is how the
original defect got in, and one invariant is what makes it auditable.

The cost, stated: the AnA tool used to set `model` from `ctx.model`, the
gateway's own `lastServedModel` — a **true** fact. It now comes from the record
instead, which also brings `servedBy`, so the normal tool path records strictly
more than before. Only a turn whose record was never filed (a failed turn) now
records no model — and for that turn nothing could have verified the name
anyway, which is what `'unverified'` says.

## Proof

- `red.txt` — 7 of 8 against trunk, the first failure being the forgery itself.
  The one pass is the seed/import negative control.
- `green.txt` — 11/11; 71/71 across the five suites that exercise this; 514/514
  across the wider authoring server surface, the pre-existing from-draft suite
  included.
- `mutants/` — **ten mutants, all killed.** Three survived the first run and
  each was a real gap, which is the point of running them:
  - *the parser accepting `model` again* survived because the record override
    masks it — observable only where no record resolves, i.e. a **seed** naming
    a model. That case is now tested.
  - *a run named by two records* had no test at all.
  - *an unresolved turn keeping the caller's model* survived because the code
    was **dead**: `createDocumentFromDraft` parses the provenance of BOTH
    callers, so the field cannot be set by then. Chasing that mutant is what
    found the false comment claiming the in-process tool could still supply a
    model. The dead line was removed, the comment corrected, and the mutant
    retargeted at live code.
- `lint-tsc.txt` — no file gains a warning, and the first draft of this change
  did (complexity 17 of 15); the resolution was extracted rather than
  baselined, and the mutants re-run against the extracted function.

## Not done here

`POST /docs/from-draft` still does **not refuse** a `source: 'ana'` create whose
turn cannot be resolved. That refusal (422 `TURN_RECORD_REQUIRED`) was in this
round's plan and is deliberately held: the two client doors now refuse that case
before posting (round 14), so the server check is a backstop for a caller that
skips them, and it should land together with the exit gates that act on
`governedWrite` — not as a lone refusal whose only effect is to turn 'unverified'
into an error.
