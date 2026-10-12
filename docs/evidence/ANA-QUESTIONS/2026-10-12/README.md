# AnA asks in positions a person can take — and one they can write themselves

**Founder's directive, 2026-10-12:** *"AnA's ability to ask questions using an
actionable selection process of positions the human can take with an other
where the human can insert alternatives. And make this consistent and subject
matter intelligent across all medical device and diagnostics scenarios and all
Biotech scenarios."*

Recorded as a founder directive, like row 74: it moves no D-row, and it is an
explicit exception to CLAUDE.md RULE 2 rather than a reading around it.

## What was actually there, measured first

The server has run a question engine since the interview flows landed: 20-odd
flows across devices, IVDs, drugs and biologics; each question a node with
fields, listed values, branching, validation and Part 11 issue checks; sessions
persisted; `INTELLIGENCE_FLOW_STARTED` audited. It emits every question over
the AnA stream as `intelligence_question`, and `useAnaChat` stores it on the
message.

**Nothing drew it.** `grep -rn intelligenceQuestion client/src` outside the
hook returns nothing. So the positions the engine had resolved for the
programme never reached the screen: the person saw AnA's prose and typed an
answer back, and the "actionable selection process" the directive asks for did
not exist on any surface.

Two further facts, both measured:

1. **The list was closed, and the validator enforced it.**
   `validators.ts` refuses any value that is not a listed option
   (`"x" is not a valid option`). Where the person's real position was not
   listed, their only moves were to pick one that was wrong or abandon the
   interview — and these answers feed document authoring and a retained
   record.
2. **Where an escape existed, it threw the answer away.** 64 questions across
   17 flows offered a hand-written `{ value: 'other', label: 'Other' }`, which
   records the string `"other"`. What the person meant was never captured. One
   read `Other (describe in notes)` for a field with no notes.

## What this change does

### The mechanism: a position you can take, or one you write

- `QuestionOption` gains **`commits`** — what taking this position commits the
  programme to — and **`authority`**, the part, annex or guideline that makes
  it a position (`21 CFR 807.87`, `21 CFR 860.200`, `ICH M4Q`, `MDR Annex IX`).
  Written in the flow, never by a model.
- `QuestionField.allowOther` declares that the list may not hold the person's
  position. The engine reserves `OTHER_POSITION` for it, and their words
  travel beside it under `otherFieldId(fieldId)`.
- The validator:
  - a field **without** `allowOther` refuses it and says **the list is
    closed** — "these are the only positions this question accepts" — rather
    than calling the person's answer invalid;
  - a field **with** it requires the words (an unexplained "other" is not an
    answer), and bounds them at 2,000 characters.
- The engine keeps the words in **`FlowState.ownWords`**, *not* in `answers`:
  a consumer reading the answers sees `OTHER_POSITION` and cannot mistake
  their wording for a position AnA offered. The completion event carries them,
  so a document built from the interview can say which answers were the
  person's own.
- Each one is noted on the record as **"Your own wording"** (`info`), quoting
  them and stating that AnA has not classified it.

### Consistency across the domains the directive names

- All **64** hand-rolled hatches, across all 17 flows — 510(k), PMA, IND, NDA,
  BLA, CER, CMC specification, stability, protocol, risk management, labeling,
  CSR, safety narrative, SOP, briefing book, project setup — now declare
  `allowOther`, so the same question behaves the same way whether the
  programme is a Class II device, an IVD or a biologic.
- A migration hazard, found and fixed: three predicates keyed on the old
  `'other'` value. Two are issue checks in `project-setup` and one gates a
  follow-up field in `cmc-specification`; left alone they would have become
  conditions that can never be met — a silently dead check. They now key on
  `OTHER_POSITION`, and the two project-setup messages were reworded, because
  "contact support for assistance with custom configurations" is no longer
  what happens when AnA has just recorded the person's words.
- **One baselined exception, with its reason:** `cmc-specification`'s
  `molecule_type` pairs its option with a bespoke `molecule_type_other` field
  that `server/services/cmc/interview-commit.ts` maps onto a CMC record
  (`substance_classification.molecule_type_other`). Rewiring that mapping
  belongs to the CMC lane, so the pair is left whole and named in the gate
  rather than quietly changed. The list may only shrink.
- `escape-hatch-is-one-mechanism.test.ts` holds the line: no flow may grow a
  new hand-rolled hatch, no predicate may key on the old value, and no listed
  position may use the reserved value.

### The surface that makes it actionable

`AnaQuestionCard` draws the question the engine sent: its section and progress,
the question and its guidance, any issues raised by the last answer, and each
field's positions — label, what it commits the programme to, the authority
where the flow states one. The last row is the position the list does not hold;
choosing it opens a box for the person's words. The answer returns by the
server's existing fast path (`[INTELLIGENCE_ANSWER]`), so nothing on the wire
changed. A field with no listed positions is drawn as the input the flow asked
for, and the card never invents a position: every option comes from the
question the server sent.

## Verification

- `own-position.test.ts` (6) was red before the mechanism existed, including
  the case that a closed list must say so rather than blame the answer.
- `anaQuestionCard.test.tsx` (6): the positions carry their commitment and
  authority; the escape hatch opens a box, cannot be submitted empty — by the
  button **or** by Enter in the box — and sends the words under the key the
  engine reads.
- `escape-hatch-is-one-mechanism.test.ts` (5) reads every flow and fails if
  one hand-rolls a hatch again.
- `mutations.txt`: **9 mutations, all red.** One survived the first pass — the
  disabled button hid the unexplained-submit path — and the test now exercises
  the form submit directly.
- `npx tsc --noEmit`: 0 errors. `ci:undefined-css-classes`, `ci:design-system`
  and `ci:internals-in-copy` pass; `ci:surface-text-ramp` needed the generated
  sheet regenerated, because the card adds a tinted-surface rule (5 lines).

## What this does not yet do

The positions' `commits` and `authority` are declared per flow. The directive
asks for subject-matter intelligence that is **consistent** across every
scenario, and the honest next step is a governed catalogue of positions per
question kind — pathway, predicate strategy, classification, conformity route,
designation, pediatric plan, comparability — resolved by domain and region,
each with its authority, so two flows asking the same question cannot offer
different lists. The flows today still carry their own option text, and some
scenarios have no question at all: De Novo and 513(g) as pathways in their own
right, IVDR classes A–D, EU MDR conformity routes, SaMD, CLIA waiver,
companion diagnostics; 505(b)(2), 351(k) biosimilars, orphan and expedited
designations, pediatric plans. That catalogue is the next slice, and this
mechanism is what it will hang on.
