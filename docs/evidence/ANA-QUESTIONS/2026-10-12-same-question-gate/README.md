# A question can gate a field on an answer it asks itself

Second repair from the review in `../2026-10-12-review/`, and the one with the
widest reach.

## The defect

`buildQuestionEvent` filtered every field's `visibleWhen` over the answers given
**before** the question — all it can know — and **dropped** the rest.

For a field gated on an earlier question that is right, and it stays. For a
field gated on an answer in its **own** question it is wrong twice over: the
person has not given that answer yet, so the field is dropped at draw time,
while `validateAnswers` evaluates over the submitted answers too and goes on
demanding it.

Three live consequences, two of them in work from earlier today:

- **`project_setup.additional_agencies`** is gated on a yes/no in its own node.
  It was **never drawn at all** — so a multi-country programme could not name
  its other agencies, and `facts.regions` could only ever hold the one primary
  region that the region rule reads.
- **`project_setup.predicate_device`** is gated on the route chosen in the same
  node — a node the pathway slice created this morning. A person choosing a
  510(k) was **never asked for the predicate**, which is the one thing every
  510(k) turns on.
- **Two `cmc_specification` fields** are `required` *and* gated on their own
  node's answers: hidden when drawn, demanded when submitted. Unanswerable.

## The repair

The engine **sends** a field whose gate names a field in its own question, with
the predicate intact, and the card decides it as the person answers. A gate an
earlier question settled is still decided server-side, exactly as before.

For the card to decide it the same way the server would, the evaluator had to
be in one place: `evaluatePredicate` moved whole to
`shared/ana/question-predicate.ts`, with its yes/no coercion (a `yes_no` answer
reaches the card as `'yes'` and a predicate names `true`) and its numeric
parsing (a tool sends `'7'` where the UI sends `7`). The engine re-exports it,
so `validators.ts`, `issue-detector.ts` and two test files are unchanged.

A hidden field is also no longer required: the submit button was blocked by
questions the person could not see.

## Verification

- `same-question-gate.test.ts` (4): the field is sent with its gate intact; a
  gate an earlier question answered is still decided server-side; and — the
  one that matters — **a walk over every flow finds no required field that the
  draw hides and the validator demands**. That is the deadlock shape, checked
  across all 17 flows rather than the two that had it.
- `anaQuestionCard.test.tsx` (+2): the field is not drawn until its answer is
  given; it appears the moment it applies; it is not required while hidden; and
  the answer sent carries both fields.
- `pathway-question-uses-the-catalogue.test.ts`: the predicate question is sent
  with its gate rather than dropped, and the notified-body question — gated on
  the previous node's EU class — is still decided by the server.
- `mutations.txt`: **5 mutations, all red** — the field dropped at draw again,
  every gate left to the card (so one an earlier question settled would be
  drawn wrongly), the card drawing a field whose gate does not hold, a hidden
  field still demanded, and the shared evaluator losing its yes/no coercion so
  the card and the server disagree.
- Green: **721 tests** across the question engine, both catalogues,
  `tests/ana-intelligence` and the card; `ci:typecheck:no-regression` 0 errors;
  the per-change lint ratchet nets zero — the moved function's existing
  complexity warning travelled with it and did not multiply.

## What this does not fix

The remaining review findings are listed in `../2026-10-12-review/README.md`.
The two nearest to this one:

- a route question with **no positions** still accepts any string as a governed
  position, because the validator's option check has nothing to check against;
- `primary_regulatory_agency` answered in the person's own words still makes the
  route question say no agency was named.
