# Two figure engines read one capability, and the submission consistency check runs the narrower one

**Package:** F1 (repairs in shipped behaviour). **Date:** 2026-11-02.
**This is a finding with its measurements, not a change.** Nothing in `server/` was edited.

On 2026-11-01 the labelled-figure lexicon's evidence closed with an open question:

> The remaining misses are overwhelmingly **arm- or event-qualified** … A label with no arm and
> no event in it would compare one arm's neutropenia against another's and call the difference a
> conflict. Carrying that qualifier through the lexicon, the comparators and the reconcilers is a
> **design change, not a pattern**, and it is recorded as open rather than bodged in.

I set out to make that design change. RULE 3 says search first, and the search found it already
built.

## What already exists

`server/services/truth-engine/clinical-claims/` — **8,476 lines** across nineteen modules, with its
own result vocabulary in `shared/ana/clinical-claims-vocabulary.ts`. It models exactly the frame the
note said was missing, and more: study or pool, analysis population, **arm**, measure, scope
(subgroup, period, timepoint, part), endpoint, effect type, scale, interval level and sidedness.
Two figures are compared only when their frames are identical; everything else is `not_compared`
with one of forty reason codes, including `arm_unidentified` ("not bound to an arm or to the total
in its own clause", C11), `per_arm_vs_total` ("per-arm figures are never summed", C22) and
`unrecognised_qualifier` ("its scope is unknown; it is never read as overall", §5.2).

It is reached by three callers:

| Caller | Question it answers |
|---|---|
| `authoring/section-claims-check.ts` | a section's figures against the documents it **cites**, at the save of an AnA draft |
| `authoring/document-figure-consistency.ts` | a document against **itself**, across its own sections (ICH E3 §1) |
| `vault/catalog-fact-verification.ts` | a catalog record's facts against their source |

**It is not reached by the fourth caller of the same capability.**
`POST /api/submissions/:id/consistency` → `truth-engine-service.runConsistencyCheck` →
`figure-consistency.compareLabelledFigures` → the labelled-figure lexicon. Same input — saved
authoring sections, by id, tenant-scoped — and a different, much narrower engine. That route is the
one whose `200 []` over "248 subjects" against "251 subjects" started this whole thread.

## Measured, on the same corpus as the 2026-11-01 note

Fifteen phase-III randomised-trial abstracts from PubMed, 123 sentences stating a figure a reviewer
reconciles. `recall-both-engines.ts` (filed here) runs both engines over each sentence:

```
governed sentences:                       123
the LEXICON labels:                        58  (47%)
the CLAIMS engine FRAMES as a claim:        0  (0%)
the CLAIMS engine SAW a figure at all:    112  (91%)
```

`recall-claims-as-documents.ts` feeds whole abstracts instead, so the engine has document context:

```
documents: 15      claims framed: 3      figures unframed: 428

   307  figure_not_read              25  population_unidentified
    29  bound_not_value              22  unrecognised_qualifier
    14  exposure_adjusted_rate       15  study_unidentified
                                     10  arm_unidentified
```

## What that means, said plainly

**The claims engine is not a drop-in replacement, and swapping the route to it today would make the
consistency check report less, not more.** It sees a figure in 91% of these sentences against the
lexicon's 47% — but it *frames* almost none of them, because an abstract names no study, no analysis
population and no arm, and the engine refuses a verdict without them. That refusal is the engine
working correctly; it is built for CSR and Module 2.7 text with headings, a study id and arm
bindings, which is what its three existing callers hand it.

So the two engines are not better-and-worse. They answer differently-shaped questions:

- the **lexicon** reads a labelled figure out of any prose and compares by label — wide, shallow,
  and wrong the moment a figure is arm-qualified (which is why `figure-consistency` has to carry an
  `ARM_LEVEL` guard that refuses a verdict rather than fabricate one);
- the **claims engine** reads a fully framed claim out of framed text and compares frame to frame —
  narrow, deep, and silent where the frame is absent.

Both silences are honest. Having two of them, under one capability, reached from four places with
no rule saying which is which, is not.

## What I did not do, and why

Converging them is a RULE 3 decision, not a session's: *"A second implementation is allowed only
when the first cannot be fixed. The design must say why, and the first must be migrated onto the
second and deleted in the same change."* Neither direction is free:

- **Route the submission check at the claims engine.** It would gain the whole frame — arms,
  populations, subgroups, per-arm-vs-total — on real CSR sections, which is what that route is
  actually fed. It would lose every comparison on text that states no frame, which on this corpus is
  nearly all of it. Whether that is a loss depends on whether a submission's saved sections look
  like a CSR (framed) or like an abstract (not), and I have not measured that on real tenant data.
- **Widen the lexicon with a qualifier instead.** That is the design change the 2026-11-01 note
  recorded — and building it now would be writing a second, shallower copy of `ClaimFrame`, which is
  the exact thing RULE 3 forbids.

**What is needed first is a measurement nobody has: what do real saved authoring sections look
like?** Run both engines over a tenant's actual sections and count framed claims against labelled
figures. If the sections are framed, routing the check at the claims engine is the convergence and
the lexicon keeps only its non-clinical labels (CMC, device, submission identifiers). If they are
not, the honest answer is that the check is reporting on unframed prose and should say so.

That measurement needs tenant data this session does not have, so it is handed on rather than
guessed at. `recall-both-engines.ts` takes a corpus path as its first argument and will run against
any JSON array of `{ pmid, abstract }` — point it at an export of real sections.

## Also found

`figure_not_read` is 307 of the claims engine's 428 unframed figures here: its own canonical-form
vocabulary, not its framing rules, is what it most often stops at. If the convergence goes toward
the claims engine, that table is where the work lands — and it is one table, in one engine, rather
than two vocabularies drifting apart.
