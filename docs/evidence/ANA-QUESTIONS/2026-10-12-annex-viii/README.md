# A class is a verdict, so the Annex VIII rules state it

Ninth slice of the founder's directive of 2026-10-12, and the one the previous
slice named as next.

## Why this is a defect and not a feature

RULE 2: *numbers, verdicts and governed content come from deterministic
engines; the model narrates.* A risk class is a verdict.

The platform has had the engine all along — `EU_MDR_RULES` in
`server/services/market-specs/device-classification.ts` is Annex VIII Rules
1–22, and `classifyMdr` **fails closed**: where a fact that decides the class
was not given it returns `class: null` and names the facts it would need.

And the CER interview has been asking exactly those facts: whether the device
is implantable (first node), the invasiveness kind, whether it is active, the
duration of use, the contact site, whether a medicinal substance is
incorporated — *and separately asking the sponsor to state the class*, with
nothing comparing the two. A sponsor could answer "surgically invasive, long
term" and declare Class IIa, and the record would carry it without a word,
though Rule 7 says Class IIb.

## What this adds

`annex-viii-classification.ts` is a bridge, not a classifier. It maps the
interview's answers onto the engine's facts, runs the engine, and reports what
the engine said:

| the interview asks | the engine's fact | rules |
|---|---|---|
| `is_implantable: yes` (CER node 1) | `invasive`, `surgicallyInvasive`, `implantable` | 8 |
| `invasiveness_type` | `invasive` / `bodyOrificeInvasive` / `surgicallyInvasive` / `implantable` | 1–8, 20 |
| `active_device` | `active` | 9–13, 22 |
| `duration_of_use` | `duration` | throughout |
| `body_contact_type: cns` or `cardiovascular` | `contactsCnsOrCentralCirculation` | 6, 7, 8 |
| `incorporates_medicinal_substance: yes` | `incorporatesMedicinalSubstance` | 14 |

**`permanent` reads as `long_term`**, because Annex VIII Chapter I § 1.1 defines
long term as continuous use beyond thirty days — a permanent device is long
term, and inventing a fourth duration would be a second vocabulary.

**Three answers are deliberately NOT mapped**, each with its reason in the code:

- `body_contact_type`'s skin / mucosal / breached-skin / tissue-bone values look
  like the engine's `injuredSkinOrMucosaContact`, but that fact's values are the
  **claim** a Rule 4 device makes ("mechanical barrier", "breached dermis,
  secondary intent"), not where the device touches. Mapping one onto the other
  would assert a regulatory claim the sponsor never made.
- `blood_direct` is not read as the Rule 8 Class III exception either: direct
  blood contact is not direct contact with the heart or the **central**
  circulatory system, and reading it as that would raise a class on a fact
  nobody gave.
- `incorporates_biological_material` is not Rule 18's non-viable human or animal
  tissue: viable tissue is outside the MDR altogether, and the answer does not
  say which.

**The IVDR engine is not reached from here**, because no interview asks the
facts it needs (the Rule 2 markers, the Rule 4(a) analytes, the self-testing
and near-patient flags). A rule nothing can reach reads as a check that passes.

## What reaches the record

- **Where the sponsor declared no class**, the rules' verdict becomes the fact
  the routes are marked against, and an issue says so with the rule:
  *"Your answers put this device in Class IIb — Annex VIII Rule 8: …"*
- **Where the declaration and the rules disagree**, the declared class stays
  the fact — it is the sponsor's position — and an issue at `warning` names
  both classes and the rule, saying plainly that one of the two has to change.
- **Where the rules do not decide**, the engine's own missing-fact list is
  quoted, not summarised: the list is the useful part.
- **Where the sponsor cited a rule** (the CER flow asks for the Annex VIII rule
  number) **and it is not the rule that decides**, that is said too.
- **Where the programme gave no classification facts at all, nothing is said.**
  Otherwise every device interview would carry a "cannot determine" notice,
  which is noise rather than honesty.

## Two things this slice got wrong first, and how they were caught

**My own test asserted the wrong class.** A plain implantable, non-active,
permanent device: I asserted Class III and the engine said **IIb**. The engine
is right — Rule 8 puts implantable and long-term surgically invasive devices in
IIb, and only its listed exceptions in III (direct contact with the heart, the
central circulatory system or the CNS; a biological effect; chemical change;
administering medicines). The test now asserts IIb, and a second case adds
`body_contact_type: cardiovascular` to reach III. **That is the whole argument
for deriving a class rather than asserting one**, demonstrated on me.

**A test of mine was passing vacuously.** The case meant to prove that a node
asking no classification facts gets no notice was written with field ids the
node does not have (`device_name` for `cer_device_name`, and four more), so
validation refused the answers, `advanceFlow` returned before the notices were
computed, and the assertion passed on silence it had caused itself. It now
proves validation passed before it proves silence — and the mutation that
fabricates a reading is red on it. This is what the house rule about gates is
about, and it was my own gate.

## Verification

- `annex-viii-classification.test.ts` (18): each mapping; the three deliberate
  non-mappings; `permanent` as `long_term`; a yes_no in either shape; the
  implantable answer read on its own; the verdict with its rule; the derived
  class becoming the fact; a declared class never overwritten; and each of the
  four notices, including the citation check and the silence.
- `annex-viii-in-the-cer-interview.test.ts` (6), driving the **real CER flow**:
  the facts answered in the nodes that flow asks them in reach the engine and
  come back on the trail — including a class declared four nodes before the
  facts that contradict it, which only the flattened view could compare.
- `mutations.txt`: **13 mutations, all red** — the class guessed instead of
  ruled on, a declared class overwritten, the derivation judged against itself
  (so no mismatch could ever fire), a permanent device stating no duration, a
  contact site read as the Rule 4 claim, the missing facts summarised instead
  of quoted, the notice fired for a programme that gave none, an engine refusal
  taking the question down with it, a mismatch passing unrecorded, the citation
  never checked, a rule number outside Annex VIII read as a citation, **an
  Annex VIII field renamed in the flow** (the gate that catches the drift), and
  the implantable answer unread.
  Three of them first survived and each showed something: two were pointed at
  the wrong test file, and the third proved my isolation was weak — the
  implantable case was reachable through a second answer, so it is now tested
  on its own.
- The Annex VIII fields are under **both** gates now: they are in
  `factFields()`, so a rename is caught, and the value gate learned that a
  value can be *read* by the fact bridge without deciding a class on its own.
- Green: **695 tests** across the question engine, both catalogues and
  `tests/ana-intelligence`; `ci:typecheck:no-regression` 0 errors; the
  per-change lint ratchet refused two warnings this slice added (an unused
  import and `programmeFactsFrom` at complexity 16) and both were fixed by
  extracting the class reader, not by widening a baseline.

## What is still open

- **The IVDR facts are asked nowhere**, so the IVDR engine cannot be reached
  from an interview. The questions it needs are the Rule 2 blood-grouping
  markers, the Rule 4(a) self-test analytes, and the self-testing and
  near-patient flags.
- The US class is still asked rather than derived; `classify_device`'s `fda`
  framework recommends a pathway from `fdaClass`, `predicateAvailable`,
  `exempt` and `novelLowModerateRisk` — three of which the interview now holds.
- `device-projects.ts` still defaults a missing class to `'II'`.
- The PMA war-game auditor and the cross-node issue detector still read seven
  field ids no flow asks.
