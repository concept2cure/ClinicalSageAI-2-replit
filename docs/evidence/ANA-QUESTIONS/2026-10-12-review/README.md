# Review of the nine question-directive commits, and the first seven repairs

Five lenses over the eight commits of the questions directive, each finding
then attacked by a reader that did not find it: engine correctness, the
regulatory content itself, fail-closed/honest-state, the declared behaviour
change in `df8e5200`, and zero duplication plus what the interview path now
reaches. **47 findings. The verify pass confirmed every one of the first 14 it
reached**, which is the uncomfortable and useful result.

This commit repairs seven of them — the ones that are mine, severe, or both —
and corrects a claim in my own evidence that was false when I wrote it.

## What the review found that I got wrong

### 1. An emergency IND looped for ever (high, mine)

`df8e5200` made branch predicates read every answer the interview holds. That
was right, and it woke 30 dead branches — **one of which points at the node it
is declared on**: `ind_submission.ind_review` branches to `ind_review` when the
IND type is `emergency`. Inert while branches read one node's answers; an
infinite loop the moment they read all of them.

Two fixes, because one is not enough: the flow's branch is **removed** (what an
emergency shortcut would need is a branch on the node *before* review, naming
where an emergency IND should jump *to* — a flow decision, not a repair), and
`resolveNextNode` now **refuses a branch whose target is the current node**, so
seventeen flows cannot grow another. A structural test holds that no flow has
one, and the engine's refusal is held on a synthetic flow that has one.

### 2. The same one-argument defect was still in `runIssueChecks` (high, mine)

One line below the branch call. `runIssueChecks(currentNode, answers)` gave an
issue check the current node's answers alone, so a check whose condition reads
an earlier node's field could never fire.

Measured, as the branches were: of **233 issue checks across every flow,
exactly one** is cross-node — and it is `critical`:
`cer_report.clinical_investigation_detail`'s *"no clinical investigation data
for a Class III or implantable device"*, which is MDR Article 61(4). It now
fires. The other 232 read their own node's field and are unaffected, because
their value comes from `answers` either way.

### 3. And that check landed on a sponsor who had been made to invent the data

The node it fires from asks **ten required questions about the clinical
investigation** — type, design, ISO 14155 compliance, endpoints, subjects,
sample-size justification, follow-up, statistics, results, adverse events —
and fires its critical finding when the sponsor has said there is no
investigation. So the only way past the node was to invent one.

Every field in that node is now gated on the answer. A programme with no
investigation passes the node with nothing invented, and the critical finding
still fires from it.

### 4. My own evidence contained a false claim (high, mine)

`../2026-10-12-region/README.md` said *"a multi-country device project now
reaches the timeline question it used to skip."* **It did not.** The only
branch to `multi_country_setup` was on `submission_route`, which a device
project skips. The branch is now on `medtech_regulatory`, both paths have a
test, and each has its own mutation. The claim is corrected in place, in that
file, rather than quietly fixed here.

### 5. The two De Novo conditions were cited to each other's subsection (high)

`predicate-positions.ts` cited the **direct** De Novo request — made without
filing a 510(k) first — to FD&C Act 513(f)(2)(A)**(i)**, and the **post-NSE**
request to **(ii)**. They are the other way round.

And both cited `21 CFR 860.220(a)` as the authority for *who may make* a
request. 860.220 is the request's **content and format**. The regulation is now
cited at subpart level (`21 CFR 860 Subpart D`), because this module will not
state a section it has not verified — the same discipline the LDT position
already follows about an unsettled enforcement position.

The same two citations were repeated in the `notification_without_predicate`
rule and in the 510(k) flow's issue check; all are corrected.

### 6. The Class I exemption cited the wrong part (medium)

The exemption from premarket notification is granted by the device's own
classification regulation and limited by that part's § .9. `21 CFR 807.85` is a
different exemption. The citation is now
`21 CFR 862–892 — the classification regulation and its own § .9 limitations`.

### 7. A device sponsor was told their regulator is EMA (high)

Two places, both deterministic governed text:

- the route question's help text said *"These are EMA's routes"* over the **MDR
  class routes** — which are a notified body's conformity assessment, and EMA
  has no part in them beyond the companion-diagnostic consultation;
- the wrong-regulator caution said *"this is a filing to EMA"* about the same
  routes.

Both now name the regulation for a device or diagnostics position — *"These are
the EU MDR conformity assessment routes. A notified body assesses them"*, *"this
is an EU conformity assessment under the IVDR"* — and keep the agency's name for
a medicine, where EMA **is** the regulator, and for the US, where FDA regulates
both.

## Verification

- `branch-and-check-loops.test.ts` (6): no flow holds a self-branch; the one
  cross-node issue check fires, and the node no longer demands ten invented
  answers; the 232 same-node checks still fire; a multi-country device project
  reaches the timeline and a single-country one does not.
- `branch-reads-every-answer.test.ts` (+1): the engine refuses a branch onto
  its own node, held on a flow with one.
- `predicate-positions.test.ts`, `pathway-availability.test.ts`,
  `pathway-question-uses-the-catalogue.test.ts`: the corrected citations, and
  the regulation named instead of the agency for a device route — with the
  medicine case asserting that EMA is still named where it is right.
- `mutations.txt`: **10 mutations, all red** — the self-branch taken, the
  self-branch left in the flow, an issue check reading one node again, the ten
  invented answers demanded again, the two De Novo subsections swapped back,
  860.220 restored, an MDR route called a filing to EMA, the help text calling
  them EMA's, and the multi-country branch removed from each path separately.
  One mutation first survived because it hit the wrong one of two identical
  branch blocks — the medicines path rather than the device path — which is why
  both paths now have their own.
- Green: **701 tests** across the question engine, both catalogues and
  `tests/ana-intelligence`; **1086** across `server/services/cmc`, which holds
  the projection that reads these answers; `ci:typecheck:no-regression` 0
  errors; the per-change lint ratchet reports no file gained a warning.
- The previous push was refused by `ci:pushed-lint-errors` for a real ESLint
  **error** this batch introduced — a `no-fallthrough` on the deliberate
  `long_term`/`permanent` case pair in the Annex VIII bridge. Fixed here by
  moving the comment above both labels.

## What the review found that is NOT fixed here

Recorded rather than quietly carried. The verify pass was still running when
this landed; these are the findings as reported, and each needs its own slice:

**Enforcement and reach**
- A route question with **no positions** (the Japan path) accepts any string as
  a governed position: the validator's option check does not apply, so an API
  or tool caller can store ungoverned prose where the card would have sent the
  person's own words. The card is honest; the field is not.
- `primary_regulatory_agency` may still be unvalidated prose depending on how
  the validator treats an `agency_select`, and the route question then tells the
  sponsor no agency was named — after they named one.
- A required field gated on a field **in its own node** is an unanswerable loop:
  the draw hides it (prior answers only) and the validator demands it (prior +
  submitted). Live on two `cmc-specification` fields. Pre-existing, not mine.
- `additional_agencies` is never drawn, so `facts.regions` can hold one region.
- The launch-scope gate may refuse every flow these commits touch in
  production, which would mean none of this reaches a user yet. That needs
  checking before any claim about user-visible behaviour.

**Regulatory content (eight more, from the SME lens)**
- the MDR Class IIa route offers Annex X type-examination, which Art 52(6) does
  not allow; the IVDR Class B route cites Art 48(7), which is Class C; the
  companion-diagnostic consultation cites Art 48(6), which is the Class D
  expert-panel paragraph; the Class D reference-laboratory verification cites
  Annex IX § 4.4 rather than § 4.9 (and § 4.12 for batches); Annex VIII Rule
  3(f) is cited for "Class C or D" where it yields C; the 513(g) position cites
  the reclassification-petition regulation; the Q-submission cites the
  Breakthrough Devices section; the split-predicate consequence overstates what
  the 2014 guidance says; the LDT position understates where the 2024 rule now
  stands.

**Duplication**
- the MDR class is still hand-written in two flows and normalised by three
  readers; the IVDR class is still enumerated in about fourteen places and the
  US class in about fifteen, after a commit titled *one vocabulary for all of
  them* — which promoted one vocabulary and migrated two holders, not fourteen;
- the option-value gate **structurally skips** every fact field whose options
  come from a catalogue, which is exactly `ivdr_class`;
- hiding the MDR class from a diagnostics programme made the `na` answer the
  notified-body question depends on unreachable;
- three uncanonical region lists remain inside other flows.

**Honesty**
- a drug-device combination product is offered four EU medicinal-product routes
  unmarked, while the same product is honestly refused in the US;
- the IVDR class option presents a recall-level paraphrase as checked Article
  48 authority, discarding the `basis` the platform keeps for exactly that;
- `US_IND` is offered to nobody and the escape-hatch warning then says AnA
  holds nothing for it, which is false;
- an EU-only device programme is still required to state a US risk class.
