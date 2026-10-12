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
- ~~A route question with **no positions** (the Japan path) accepts any string
  as a governed position.~~ **Closed** — `validators.ts:126` refuses any string
  but `OTHER_POSITION` on a field that declares a catalogue and resolved to no
  options, and `__tests__/a-question-that-offers-positions-enforces-them.test.ts`
  (*refuses a position, because it offered none*) holds it. Landed in the
  enforcement slice of this same batch; this entry was written before it.
- ~~`primary_regulatory_agency` may still be unvalidated prose depending on how
  the validator treats an `agency_select`.~~ **Closed** — the option check runs
  wherever `field.options` exists rather than only for `select` and `radio`, so
  an `agency_select` is enforced; *refuses an agency it does not offer, rather
  than storing prose* and *does not then tell them no agency was named* hold
  both halves.
- ~~A required field gated on a field **in its own node** is an unanswerable
  loop. Live on two `cmc-specification` fields.~~ **Closed** — such a field is
  SENT with its predicate and the card decides it, and
  `same-question-gate.test.ts` (*leaves no required field unanswerable
  anywhere*) walks **every** flow rather than the two that had it, so the shape
  cannot come back in a third place. Verified again 2026-10-12 against the
  twelve gated fields in `cmc-specification` and the one in its
  container-closure flow: every gate is `eq`/`in` on a field in the same node,
  all are drawn, and the validator evaluates over prior + submitted, so the
  demand can always be met.
- ~~`additional_agencies` is never drawn, so `facts.regions` can hold one
  region.~~ **Closed** by the same repair, and pinned by *sends a field gated
  on its own question, with the gate intact*. The cross-node check added in
  `2026-10-12-no-us-filing/` reads both agency fields, which is a second
  consumer that would fail if it stopped being drawn.
- The launch-scope gate may refuse every flow these commits touch in
  production, which would mean none of this reaches a user yet. That needs
  checking before any claim about user-visible behaviour.

**Regulatory content (eight more, from the SME lens)** — **all closed in
`2026-10-12-citations/`**; re-verified line by line on 2026-10-12 and recorded
here so the list does not read as open:

| Was | Now |
|---|---|
| Class IIa offers the Annex X type-examination | the position says it is **not** open to Class IIa; authority `Art 52(6), Annexes IX and XI`, with a gate (*does not offer a Class IIa device a route Article 52(6) withholds*) |
| IVDR Class B cites Art 48(7) (Class C) | `IVDR Art 48, Annex IX` — the article and the annex, not a paragraph that would be wrong |
| the companion-diagnostic consultation cites Art 48(6) | `IVDR Art 48, Annex IX` |
| the Class D reference lab cites Annex IX § 4.4 | `IVDR Art 48, Art 100; Annex IX` |
| Rule 3(f) cited for "Class C or D" | the position states Rule 3(f) yields **C**, and that another rule may reach D |
| 513(g) cites the reclassification petition (860.123) | `FD&C Act 513(g)` and FDA's own 513(g) procedures; a gate asserts 860.123 is **absent** |
| the Q-submission cites 515B (Breakthrough Devices) | the Q-Submission Program guidance; a gate asserts 515B is absent |
| the split-predicate consequence overstates the 2014 guidance | attributed, not asserted: the guidance *states* a split predicate is not a permissible basis, and a submission resting on one *invites* a finding of NSE |
| the LDT position understates the 2024 rule | says it was vacated by a federal court in 2025 **and** that where it rests now is not something AnA tracks |

The general rule the batch adopted: a citation precise enough to be wrong is
worse than one broad enough to be right. Paragraph-level citations were kept
only where they had been checked.

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
- ~~`US_IND` is offered to nobody and the escape-hatch warning then says AnA
  holds nothing for it, which is false;~~ **repaired** —
  `2026-10-12-investigational/`. The finding's wording needed a correction of
  its own: a programme that states only a statute ("Biologic (BLA)") carries no
  modality, takes the unnarrowed list and WAS offered the IND, so the accurate
  statement is *a programme that states its modality was never offered it*. The
  repair went wider than the finding: the catalogue annotated one
  investigational filing out of five, so the EU CTA, the MDR clinical
  investigation and the IVDR performance study did not exist as positions
  either, and the coverage gate did not scan the `clinical_trial` family at
  all;
- ~~an EU-only device programme is still required to state a US risk class.~~
  **repaired** — `2026-10-12-no-us-filing/`. The EU field had carried
  'Not applicable / No EU filing planned' since it was written; the US field,
  the required one, had no equivalent, so the programme had to assert an FDA
  class or claim not to know one. Both fields now offer it, the reader states
  no class for it, and FDA named beside "no US filing planned" is reported as
  the contradiction it is.
