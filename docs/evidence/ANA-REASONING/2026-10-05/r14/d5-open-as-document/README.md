# Door 5 of SEC-A-7: "Open as document" applies the governed-write rule

Found while mapping the server doors, and **this lane's own miss**. Supports
launch row **D4**.

## What was wrong

A draft the server did not file as an authoring document appears as a
side-panel card with an "Open as document" control. That control reaches
`POST /api/authoring/docs/from-draft`, which creates a whole governed
authoring document whose **entire content is model prose** — and in the same
transaction writes three records a 21 CFR Part 11 inspector is shown:

- a `doc_revisions` genesis row carrying the full prose, append-only by trigger
  (`db/migrations/20260817_doc_revisions_immutable_ledger.sql:50,55,64`);
- an `authoring_audit_trail` row whose `after_content` IS the prose, append-only
  by trigger (`20260725_authoring_audit_trail.sql:78,85,99,109`);
- `document_span_lineage` spans saying a machine drafted it.

The card was gated only on "there is draft text" and "a project is open"
(`ConversationThread.tsx:693-697`). `anaInsertRefusal` never ran.

**The omission was not a decision anyone made.** The sibling control in the
same component — "Insert into \<section\> as tracked suggestion" — consults the
rule at `:215`. The card, which creates far more than a suggestion, did not.
And this is the last AI-drafting door still open in production: the
`draft_authoring_document` tool is refused by its pre-handler
(`server/services/ana/governed-write-tools.ts:41`), and
`POST /sections/:sectionId/ai/draft` is refused by the gateway as
`pq-not-passed` (`server/services/ai-gateway/model-governance.ts:85`).

**And its one reason lived in a `title`.** Round 13 fixed exactly that on the
two sibling offers — a `title` is unreachable by keyboard and invisible on
touch — and this card kept it.

## What changed

| Where | What |
|---|---|
| `editor/anaInsertGate.ts` | The refused **act** is a parameter: `anaInsertRefusal(record, unfinished, act)` with `act` defaulting to `'insert'`. A second real door needed different words — "inserted" names an act this control does not perform, the same untrue-named-cause defect round 13 fixed in the pane's toast — and a parameter is one implementation where a copy would be two. The default keeps every round 11 and round 13 string, test and the committed contrast capture byte-identical. The module header is corrected: it listed `POST /docs/from-draft` among the doors that do not enforce the rule without naming the client control that reaches it, and omitted the conversation card entirely. |
| `fixtures/conversation-thread-data.ts` | `CtArtifact` carries `turnRecord` and `unfinished`, so the card can apply the rule before it posts. Absent means this view was not told, which the rule refuses. |
| `surfaces/ConversationThread.tsx` | `conversationArtifacts` carries the drafting turn onto the artifact. The card composes its reason in the order the person needs it — no draft text, then no project, then the rule — and renders it as visible text (12px, `var(--text-300)`, the values round 13 measured at 5.21:1 light / 6.82:1 dark) with one `React.useId` per card, which the control is `aria-describedby`. The `title` is gone. |

## Decisions made here, as this lane's PM

- **The host's own refusals come first.** With no draft text there is nothing to
  file, and with no project nowhere to file it, whatever the rule says. Round 13
  settled this order for the pane; this follows it.
- **The verb is parameterised rather than copied.** Round 14's door 4 reused the
  insert wording verbatim and recorded the inaccuracy, because nothing rendered
  it. This door renders it to a user, so the words have to be true. One
  implementation, correct verb per door.
- **One id per card, declared above any early return** — round 13's defect was a
  shared id that described every refused control by the first one's reason.

## The tension with this round's own door 2 decision, stated not buried

Door 2's decision is **admit** the create and make the record true, because
refusing pushes the person to paste, and a paste records model prose as the
person's own work — a worse record. Door 5 **refuses**, at the client, the
control that reaches that same create. Those pull in opposite directions, and
the conflict is real rather than apparent.

It resolves on *what exists today*. Admit-with-truthful-provenance is only safe
once two things are built, and neither is: the server computing the provenance
(today `provenance.model` is a caller-supplied string) and the governed
boundaries refusing on the stored verdict (freeze, e-sign, sign, the filing
commit). Until then, admitting at the client means an unqualified model's prose
can be created, frozen, e-signed and filed, with a model name the client chose.
That is the status quo, and it is the worst of the three states.

So the ordering is: **fail closed now, relax deliberately later.** When round 15
lands the server-computed provenance and the exit gates, door 5's model-verdict
branch should be revisited — the create admitted, the record truthful, the
refusals moved to the boundaries where they cost the person nothing recoverable.

Two conditions on that revisit, recorded now so it is not done by halves:

1. **It must apply to the insert offer at the same time.** Both controls put
   model prose into governed records. An asymmetry between them is exactly the
   defect this round was fixing, and reversing which one is strict would
   recreate it.
2. **The "this page was not told" branch is not part of that trade.** Where the
   view simply lacks `servedBy`, refusing buys no governance — the server can
   verify. That branch should disappear by fixing the records endpoint (below),
   not by relaxing the rule.

## The cost this has, named rather than discovered later

**After a page reload, "Open as document" is refused on every AnA draft card.**
Traced from source, not assumed: `loadThread` does restore turn records
(`useAnaChat.ts` → `fetchThreadRecords` → `joinTurnRecords`), but
`recordStatusOf` (`anaTurnTimeline.ts:43-45`) builds them as
`{ status: 'recorded', id, sha256 }` — with **no `servedBy`**. So the gate's
"this page was not told" branch fires, and the card says:

> This page has no record of which model wrote this answer, so the answer can't
> be filed as a document. Ask again to get an answer with its own record.

That is the honest sentence for the state, and failing closed on the one case
the view cannot verify is the rule's whole point. It is also not new: the insert
offer has behaved this way since round 11, and "admission does not survive a
reload" is already recorded as a known gap with its named fix. Door 5 joins it,
and it is heavier here, because this card is the only route from that draft to a
document.

Three things make it acceptable rather than merely tolerated:

1. In production the control is refused anyway — every registry entry is
   PQ-pending — so the reload case changes nothing there.
2. The alternative is failing open on exactly the case that cannot be checked.
3. **The fix is small, server-side, and now worth doing**, because this is the
   second client door it blocks: add `servedBy` to
   `GET /api/ana-ri/turn-records` and read it in `recordStatusOf`. The data
   already exists on the server — round 10 records it, and `servedModelsOf` /
   `qualifyServedModels` already compute the verdicts. Recorded in round 15's
   scope.

## Proof

- `red.txt` — the five new tests against trunk's client, with the three source
  files reverted and the tests not: 4 of 8 fail. The control is **enabled** for
  a draft served by a model RULE 2 does not admit; enabled for a turn this page
  was not told about and for one that did not finish; and both reason
  assertions resolve to nothing, because trunk puts the reason in a `title`
  where no element exists for `aria-describedby`. The case for a draft the rule
  DOES admit passes before and after, which is what keeps this from being a
  blanket refusal.
- `green.txt` — this suite plus the two whose fixtures this round changed, 37
  passed. `conversationThreadCanvas.test.tsx`'s "every AnA draft opens as a
  document" fixtures carried a record with no `servedBy`, so the gate refused
  them: that suite is from 2026-10-01, four days before the rule reached this
  door, and the fixture now carries a turn the rule admits. The three failures
  it showed were the gate working, not a regression — recorded here because a
  sweep that finds three reds and a round that calls them stale should be
  readable against each other.
- `mutants/` — seven mutants: six killed, **one survived and is reported, not
  hidden**. `D5-07` drops the click guard in `openAsDocument`, leaving only the
  button's `disabled` attribute between the rule and the request. It cannot be
  killed: React renders the control disabled at the props level, so no test can
  reach the handler — a DOM `removeAttribute('disabled')` plus `click()` and
  `fireEvent.click()` were both tried and neither dispatches. A test written
  against it passed for the wrong reason, which is the tautological-test defect
  round 13's own review flagged (finding #15), so **that test was deleted rather
  than counted as coverage**. The guard stays: it is correct by construction, it
  mirrors the sibling insert handler's `if (refusal) return`, and it is what
  keeps the planned `aria-disabled` migration — which deliberately leaves the
  control clickable — from posting the draft the rule refuses. It becomes
  testable with that migration, and must get a test then.
  `D5-06` first survived too, and that one was a real gap: the "no draft text"
  case used an *admitting* record, so the order of the refusals was unobservable.
  A case where both refusals apply kills it.
- `unchanged-wording.txt` — round 11's and round 13's gate suites, green, which
  is what proves the default act changed no shipped sentence.
- `lint-tsc.txt` — no file gains a warning; typecheck exit 0.
