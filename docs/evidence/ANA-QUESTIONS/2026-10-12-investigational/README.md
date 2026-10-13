# The filing a programme is actually making, not only the one it hopes to make

**Row:** D4 (AnA's interview is subject-matter intelligent and governed)
**Directive:** founder's, 2026-10-12 — "Ana's ability to ask questions using an
actionable selection process of positions the human can take with an other
where the human can insert alternatives … consistent and subject matter
intelligent across all medical device and diagnostics scenarios and all Biotech
scenarios."
**Finding acted on:** `docs/evidence/ANA-QUESTIONS/2026-10-12-review/README.md`
— "US_IND is offered to nobody, and the escape-hatch warning then falsely says
AnA holds no templates, format or validation profile for it."

## What was wrong

The question that asks which application a programme is making offered only
routes **to market**. A programme that has not reached one — which is most of
them, for most of their life — could not say what it IS filing.

Two separate causes, and the second was invisible because of the first:

1. **The catalogue held one investigational filing out of five.** `US_IND` was
   annotated from the first day; the EU CTA, the MDR clinical investigation and
   the IVDR performance study were not, though the registry holds all three.
   The coverage gate that was supposed to catch a filing reaching a person as a
   bare label scanned four `applicationFamily` values —
   `marketing_authorization`, `device_clearance`, `device_approval`,
   `companion_diagnostic` — and `clinical_trial` was not among them. So a
   European device programme running a clinical investigation, and a European
   assay running a performance study, had nothing to pick and no gate said so.

2. **The one filing that WAS annotated was drawn for almost nobody.**
   `pathwayPositionsFor` narrows a medicines programme to `MODALITY_FRAME`'s
   pathways, and the frame holds **routes to market only**. A programme whose
   product type names a modality — small molecule, monoclonal antibody,
   biosimilar, every one of them — got the frame's list and stopped there. A
   monoclonal antibody in phase 1 could answer `US_BLA` or nothing.

### A correction to the review's own wording

The review said `US_IND` was "offered to nobody". That is not quite right, and
the difference is why nothing noticed: a programme whose product type states
only a **statute** — "Biologic (BLA)", "Prescription Drug (NDA)" — carries no
modality (`programmeFactsFrom({product_type:'biologic'}) === {statute:'biologic'}`),
takes the unnarrowed list, and WAS offered the IND. The accurate statement is
**a programme that states its modality was never offered the investigational
filing**, which is the common case rather than all of them.

## What now happens

- `shared/regulatory/pathway-positions.ts` annotates `EU_CTA`,
  `EU_CLIN_INVESTIGATION` and `EU_PERF_STUDY`, each with what it permits and
  the article that permits it (Reg. (EU) 536/2014 Art 5–8 and Annex I; MDR Art
  62, 70, 78 and Annex XV; IVDR Art 58, 66, 70 and Annexes XIII–XIV). All
  three are `marketingRoute: false`, so the option a person reads is labelled
  "— not a route to market".
- `US_IDE` is offered to a **diagnostics** programme as well as a device one:
  an IVD is a device under the Act and a significant-risk performance study
  runs under the same Part 812. Its first sentence now says the thing worth
  more to a sponsor than the filing — that a study on leftover, non-identifiable
  specimens whose results drive no diagnosis is **exempt** under § 812.2(c)(3),
  so establish whether you need one before preparing it.
- The draw appends the pair's non-marketing positions **after** the frame's
  routes, in the catalogue's own order (routes to market first).
- **Where the frame has no view of the product at all, nothing is offered.** A
  combination product's route follows from the centre determination, so
  appending the drug side's IND would assert half of a determination nobody has
  made. The escape hatch and the frame's own words remain what that programme
  gets — the behaviour the previous slice built is unchanged, and a test holds
  it.
- Nothing needed a new caution rule: `wrong_regulator` names every position the
  catalogue annotates, so the CTA offered to a US-only programme is marked
  inapplicable the day it is annotated. A test watches it fire rather than
  leaving it reasoned about.

## The gates

| Gate | Holds |
|---|---|
| `covers every US and EU filing a programme can be at the stage of` | extended to the `clinical_trial` family — an investigational filing the registry gains cannot reach a person as a bare label either. `US_IND_AMENDMENT` stays named as a change to a filing already chosen. |
| `offers a medicines programme the investigational filing beside the frame’s routes` | for every modality the frame holds pathways for, the draw contains `US_IND`, **last** |
| `offers none of them where the frame has no view of the product at all` | a combination product still draws `[]` |
| `holds an investigational filing for every region and domain pair it claims` | all six pairs |
| `says what each one permits, and that it is not a route to market` | each of the five, with its authority |
| `every modality in the frame resolves to as many ROUTES as the frame holds` | the frame-bridge invariant, now on the marketing subset |
| `the stage a device or diagnostics programme is at` | the EU investigation, the EU performance study and the US IDE reach the drawn question |
| `marks the other regulator’s investigational filing rather than hiding it` | `wrong_regulator` fires on the CTA; the US list does not carry it |

## Verified by making each check fail

Five named mutations, each caught by the test that exists to catch it:

| Mutation | Refused by |
|---|---|
| M1 the draw stops at the frame's routes (**the bug itself**) | `offers a medicines programme the investigational filing beside the frame’s routes`, and the frame-order test |
| M2 `EU_CTA` out of the EU medicines list | `holds an investigational filing for every pair`, `reads as not a route to market in the option a person sees`, the EU medicines list |
| M3 the `EU_CTA` annotation removed | the extended coverage gate, and three more |
| M4 the combination-product guard dropped | `offers none of them where the frame has no view of the product at all` |
| M5 the investigational filing offered **before** the routes | `offers a medicines programme the investigational filing beside the frame’s routes`, and the frame-order test |

```
$ npx vitest run shared/regulatory/__tests__ server/services/ana/intelligence-questions/__tests__
Test Files  37 passed (37)
     Tests  445 passed (445)

$ TYPECHECK_HEAP_MB=20480 npm run ci:typecheck:no-regression
errors found: 0 (tsc exit 0) — OK, matches baseline

$ node scripts/ci/check-eslint-warning-ratchet.mjs --since HEAD
no file changed its warning count since HEAD
```

## What this does not do

A programme can now **say** it is filing an IND, a CTA, a clinical
investigation or a performance study. What AnA does with that answer — which
templates, which format, which validation profile — is the registry's. The
registry holds an entry for each of the five, and a format for three of them
(`eCTD` for the IND, `CTIS` for the CTA, `NeeS` for the MDR investigation);
the IDE and the IVDR performance study carry `submissionFormat: 'none'`, which
is the registry's honest statement that nobody has written one, not a claim
that none exists. Whether the authoring and submission surfaces compose a CTIS
Part I/II dossier rather than an eCTD sequence is a separate question, outside
this slice, and it is not claimed here.

The answers to this interview still reach no project record
(`docs/evidence/ANA-QUESTIONS/2026-10-12-enforcement/README.md`, task #15), so
the launch-scope gate still refuses `project_setup` in production. That is the
next thing, and it is unchanged by this.
