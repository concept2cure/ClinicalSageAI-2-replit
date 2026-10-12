# Door 4 of SEC-A-7: `EditorBridge.propose` applies the governed-write rule

Round 14 of the founder-directed AnA reasoning lane (founder, 2026-10-04:
*"Enhance the reasoning layer of ANA."*). Supports launch row **D4** — "tools
and routes that store model-authored content refuse an unapproved serving
model" — at the one editor door that did not.

## What was wrong

`propose` redlines a quoted passage of the open section as an attributed
tracked suggestion, and the person's next Save PATCHes that HTML into
`authoring_sections`. It applied no RULE 2 check at all. A read-only agent
probed it live: the exact turn record the insert gate refuses — "written by
claude-sonnet-5, which is not approved for regulatory drafting" — went through
`propose` with `{ok: true}` and produced
`<del/ins data-author-id="ana" data-source-record=<turn>>`.

Round 13's own comment on that function said why, and it is the shape of the
defect rather than a defence of it:

> *Not gated by the insert's governed-write rule: it has no production caller
> (2026-10-05). A caller that redlines with AnA's text must apply
> anaInsertRefusal to the turn's record first, as insert does (round 11).*

A rule a future caller must remember to apply is not a rule. The server half of
that same plan is already live — `authoring-read-tools.ts:128` hands the model
"updatedAt and sha256 of the stored content — the version you read" — so a
model can already emit a valid anchored proposal, and only the card is missing.
No CI gate anywhere references `anaInsertGate`, so nothing would have caught a
caller being written against an ungated door.

## Why it is gated and not deleted

It has no production caller at HEAD: the only `.propose(` sites in the repo are
its own test file, there is no dynamic dispatch, and nothing builds an
`EditorBridgeProposal`. So as a shipped defect it is **low** severity — nothing
is stored today.

Deleting it would hit the working agreement head-on. There is no reachable
replacement for an **anchored** redline of a quoted passage (the governed tool
path replaces whole sections), the missing quarter is a written plan step
(`docs/evidence/D2-ANA-DOCUMENT-AWARENESS/2026-10-01/0-survey-critic-and-plan.md:143-154`),
and removing a door with 44 green tests is how the five-generation
delete-and-rebuild cycle restarts. Gating it is six lines.

## What changed

| Where | What |
|---|---|
| `editor/DocumentWorkbench.tsx` | `propose` takes the turn's `record` and `unfinished` exactly as `insert` does, and refuses `model-not-approved` **first** — before liveness, the section, the seal and the base. `EditorBridgeProposeResult` gains `{ ok: false; reason: 'model-not-approved'; message }`, where `message` is the sentence `anaInsertRefusal` itself returned. Scoped to the AnA author, as `insertAnaText` is: a person redlining a passage herself has no turn and needs none. |
| `editor/__tests__/editorBridgeProposeGate.test.tsx` (new) | The rule at this door: refused by model, failing closed on an absent record list and on an unfinished answer, the reason surviving a wrong section and a missing base, and three negative controls. |
| `editor/__tests__/editorBridgePropose.test.tsx` | Twenty pre-existing calls now pass an admitting turn (`ADMITS`). They are about which section and which version of it, and the door now fails closed, so a redline of AnA's words with no record never reaches them. |

## Decisions made here, as this lane's PM

- **The model verdict is checked first, not last.** It is the cheapest check —
  no WebCrypto, no await on the section hash — and the truest: a redline
  refused `stale` when the real cause is an unapproved model sends the person
  to re-read a section, which cannot help. That is the same
  misleading-named-cause defect round 13 fixed in the pane's toast.
- **The refusal carries its reason text.** The sibling insert-failure toast
  says "the editor is not editable right now (source mode, or a frozen
  document)", which would be a lie for a model refusal. Returning the gate's
  own sentence means the card that is eventually built shows the wording round
  13 settled on instead of inventing its own.
- **A gated `propose` does NOT register the turn in `admittedAnaSources`.** A
  redline is not an answer the person chose to insert, so a copy of it is
  re-attributed to the pasting person, keeping its turn. That fails closed, so
  it is correct as-is, and a test pins it.
- **One known inaccuracy, recorded rather than papered over.** The canonical
  sentence says the answer "can't be inserted", which is the insert door's
  verb, not a redline's. It is reused verbatim because there is no caller
  rendering it yet, and parameterising the verb now would churn round 13's
  settled copy and its committed contrast capture for a string nothing shows.
  When the step-6 card is built, the verb becomes that door's; the type's
  comment says so.

## Proof

- `red.txt` — the new suite against trunk's `DocumentWorkbench.tsx`, the
  implementation reverted and the tests not: 3 of 6 fail, each on its own
  defect. The unqualified model returns `{ok: true}`; an absent record returns
  `{ok: true}`; and `wrong-section` masks the model as the reason.
- `green.txt` — both suites, 50 passed.
- `mutants/` — six mutants, all killed, re-run at the tests' final location:
  the gate removed; the gate moved after the section and liveness checks; an
  absent record admitted; the author check dropped; the `unfinished` flag
  dropped; the reason text emptied.
- `lint-tsc.txt` — `DocumentWorkbench.tsx` stays at trunk's 14 warnings, both
  test files at 0, typecheck exit 0.

## Not done here

The other three doors of SEC-A-7 — `PATCH /sections/:sectionId`,
`POST /docs/from-draft` and the section revert — are server work and are this
round's remaining scope. A **fifth** door was found while mapping them and is
this lane's own miss: the conversation's "Open as document"
(`surfaces/ConversationThread.tsx:693-697`, `:1335`) is gated only on "there is
draft text" and "a project is open", so `anaInsertRefusal` never runs there.
Round 13's gate header, which this lane wrote, is therefore wrong twice: it
lists `POST /docs/from-draft` among the doors that do not enforce the rule
without naming the client control that reaches it, and it omits the
conversation card entirely.
