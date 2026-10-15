# The IVDR class, asked for the first time — and one vocabulary for all of them

Eighth slice of the founder's directive of 2026-10-12, and the diagnostics half
of *"consistent and subject matter intelligent across all medical device and
diagnostics scenarios"*.

## What the sweep found

The read-only sweep that preceded this (recorded in
`../2026-10-12-offered-values/README.md`) measured the classification
landscape:

- the **EU IVDR class A–D was enumerated eight times** across the repository
  and **asked by no question anywhere** — no option list in any flow, any
  wizard, any client component. The only ways a class could enter the system
  were a model calling a tool and a rule engine deriving one;
- the **MDR class existed in two irreconcilable shapes**, a four-value one and
  a seven-value one;
- the **US class was enumerated at least fifteen times**, three of them with a
  different value set;
- and the regulatory knowledge itself was **already canonical and good**: the
  Annex VIII rule engines for both regimes
  (`server/services/market-specs/device-classification.ts`), the one statement
  of the Article 48 route per class
  (`server/services/regulatory/ivdr-classification.ts`), and a fail-closed
  `classify_device` tool that returns `class: null` with `missingFacts` rather
  than guessing.

So the gap was never the regulation. It was that a diagnostics programme could
not say what class it was, and therefore could not be configured for Europe —
while the IVDR routes were offered to it flat.

## The two MDR shapes are both right

`shared/regulatory/device-class.ts` is the one vocabulary, and it does not
reconcile the two shapes — it **relates** them:

> A sponsor **declares** one of seven classes: I, Is, Im, Ir, IIa, IIb, III.
> The Annex VIII rules **yield** one of four: I, IIa, IIb, III. Is, Im and Ir
> are not rule outcomes — they are a Class I device that is sterile, has a
> measuring function, or is a reusable surgical instrument, each bringing a
> notified body in for that aspect alone (MDR Art 52(7)).

So a classification **engine** has four outputs and a classification
**question** has seven answers, and `mdrRuleClassOf` is the bridge. That is why
both lists existed, and writing the relation down is what makes one of them
stop being drift.

The module adds no US list: it re-exports `DEVICE_CLASSES` from the taxonomy
that already governs it.

**Migrated and deleted in the same change**, per the working agreement:
`market-specs/device-classification.ts`'s `MdrClass` and `IvdrClass`, and
`gspr-postmarket/post-market-readiness.ts`'s `EuMdrClass`, `EuIvdrClass`,
`MDR_ALL`, `MDR_CLASS_I` and `IVDR_ALL` — all now the shared vocabulary, with
their exported names kept so no caller changed. 110 files / 1378 tests across
those services pass unchanged.

## The question

`project-setup`'s classification node now asks `ivdr_class` of a diagnostics
programme, and it is the **first interview field anywhere whose values are the
spelling the rest of the platform already stores** — bare `A`–`D`, the same as
the `ivdr_classifications` column, the endpoint's zod enum and the read-side
adapters. `Class C` and `c` read as well; nothing else reads at all.

Its options are not written in the flow. The resolver draws them from
`IVDR_CONFORMITY_ROUTES`, so each class states the Article 48 route that
follows from it in the platform's own words — Class A's declaration of
conformity without a notified body, Class C's medicines-authority consultation
for a companion diagnostic, Class D's EU reference laboratory verifying
performance against the common specifications and testing batches — with the
annexes as the citation.

The help text says plainly that the class is **not a preference**: the Annex
VIII rules decide it, AnA can work them through, and what the sponsor states
here is their declaration of the outcome.

Two corrections came with it:

- **A diagnostics programme is no longer asked its MDR class**, and a device
  programme is not asked its IVDR class. Asking both asked one of them about
  the wrong regulation.
- **The MDR question now offers the seven classes a sponsor can declare**,
  including Is, Im and Ir — which the CER interview already offered and this
  one did not.

## The rule

One rule covers all six IVDR positions, because the classes decide both the
routes and the two steps inside them:

| Position | Applies to | Why |
|---|---|---|
| `EU_IVDR_CLASS_A` / `_B` | A / B | one class each |
| `EU_IVDR_CLASS_CD` | C or D | the registry holds C and D as one entry; the classes are two |
| `EU_CDX_IVDR_D` | C or D | a companion diagnostic is Class C or D (Annex VIII Rule 3(f)) |
| `EU_IVDR_ART48_CONSULT` | C or D | the medicines-authority consultation |
| `EU_REF_LAB` | D | an EU reference laboratory is designated for Class D |

A stated class that is not among a position's own is `inapplicable`, with the
position's label and the classes it applies to in the reason, and
`IVDR (EU) 2017/746 Art 47, Art 48, Annex VIII` as the authority — the
classification rules decide the route rather than a choice between them.

## Verification

- `device-class.test.ts` (6): the two MDR shapes and their relation, that every
  rule outcome is declarable, the IVDR and US lists, and the normaliser —
  including that it reads nothing as nothing rather than as a class.
- `pathway-availability.test.ts` (+5, 35): the class routes closed to another
  class, C and D on the one entry, the companion-diagnostic route closed to a
  Class A or B assay, the reference laboratory closed to anything but D, and
  nothing said about a device route, which is a different regulation.
- `pathway-question-uses-the-catalogue.test.ts` (+6, 42): the question is asked
  of a diagnostics programme and only of one; its values are the platform's own
  spelling; each class states its Article 48 route from the platform's own
  statement; the MDR question is not asked of a diagnostics programme and
  offers the seven declarable classes.
- `mutations.txt`: **12 mutations, all red** — the class asked nowhere again,
  the question writing its own list, the route written here instead of read,
  the rule not firing, C and D split, the companion-diagnostic route opened to
  Class B, the reference laboratory applying to any class, each question asked
  of the wrong programme, the Class I variants dropped, a person's spelling
  unread, and the two MDR shapes conflated.
- Green: **684 tests** across the question engine, both catalogues,
  `tests/ana-intelligence` and the card; **1378 tests** across the three
  migrated services (`gspr-postmarket`, `market-specs`, `regulatory`);
  `ci:typecheck:no-regression` 0 errors; the per-change lint ratchet reports no
  file gained a warning — it refused the migration's import block for pushing
  `post-market-readiness.ts` past 500 lines, which was fixed by compacting the
  import rather than by widening the baseline.
- My own test caught a defect in the normaliser as written: stripping `class`
  and then `class_` left `_iii` for `class_iii`, so the second strip never
  matched. One pass, and a mutation holds it.

## What is still open

- **The class is still asked rather than derived.** The Annex VIII engines can
  classify from the device's facts, and the CER interview already asks three of
  the MDR facts it needs (`invasiveness_type`, `body_contact_type`,
  `duration_of_use`) plus a classification justification — with nothing
  connecting them. Deriving the class and reporting a mismatch against the rule
  that decides it is the next slice, and it is what RULE 2 asks for: the
  verdict from a deterministic engine, the model narrating.
- The IVDR fact questions (Rule 2 markers, Rule 4(a) self-test analytes, the
  near-patient and self-testing flags) are asked nowhere, so the IVDR engine
  cannot be reached from an interview at all.
- `device-projects.ts` still validates two regimes in one list and defaults a
  missing class to `'II'`.
- The PMA war-game auditor and the cross-node issue detector still read seven
  field ids no flow asks.
