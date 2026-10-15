# A gate two answers decide, and a citation that stops claiming to be checked

**Row:** D4
**Findings acted on**, both from `2026-10-12-review/`:
- *"hiding the MDR class from a diagnostics programme made the `na` answer the
  notified-body question depends on unreachable"* — **deferred there with its
  reason**: one field and one operator could not express the gate.
- *"the IVDR class option presents a recall-level paraphrase as checked Article
  48 authority, discarding the `basis` the platform keeps for exactly that."*

## 1. The notified body was asked of the wrong programmes

`notified_body` was gated on `eu_mdr_class neq 'na'`.

A **diagnostics** programme is not asked its MDR class at all — it is
classified under the IVDR, which is the next question. So the answer was
absent, `neq 'na'` read **TRUE**, and the question was asked of every
diagnostics programme with nothing behind it. Meanwhile the programme that HAD
stated an IVDR class — whose Class B, C and D routes **are** a notified body's
assessment — was never asked on that basis. And a device programme that had
stated no class at all was asked too, for the same reason.

The gate the question actually has: **an MDR class other than "no EU filing
planned", OR an IVDR class.**

So the predicate language gained `anyOf` and `allOf`, in the **one evaluator**
the engine, the validator and the card all use — so a composite gate is decided
the same way in all three, which is the property the previous slice established
and this one must not break. Two details are deliberate:

- **A group with neither key, or an empty one, is NOT satisfied.** `every` over
  an empty list is true, so an empty `allOf` would have opened every gate
  written that way. A gate nobody wrote must not read as open.
- **`predicateFieldIds` flattens a group**, and the engine treats a gate with
  ANY leaf in the question's own node as undecidable server-side — so the field
  is sent with its predicate and the card decides it, exactly as a single-field
  own-node gate already was. The every-flow sweep in `same-question-gate` now
  walks composites too.

The question also says what it means, which it did not before: a notified body
assesses MDR Class IIa, IIb and III and IVDR Class B, C and D; for MDR Class I
it is involved only where the device is sterile, has a measuring function or is
a reusable surgical instrument, and for IVDR Class A only where it is sterile —
in each case for that aspect alone (MDR Art 52(7); IVDR Art 48(10)).

## 2. The IVDR routes stopped claiming to be checked

`IVDR_CONFORMITY_ROUTES` is the platform's one statement of the Article 48
routes, and it carries its own `basis`:

```
confidence: 'recall',
note: 'Paraphrase from recall, corroborated by secondary search extracts on
       2026-10-05 … EUR-Lex text not read (host egress-blocked). Verbatim
       re-read owed.'
```

`basisLabel` is the one renderer, and it *never presents recall as checked
regulator text*. The IVDR class question built its own line instead —
`IVDR (EU) 2017/746 Art 48; <annexes>` — which reads exactly like a checked
citation. The platform keeps the mechanism for this precisely so that a
paraphrase cannot be dressed as the regulation; discarding it was the defect.

The option's authority is now `basisLabel(route.basis)`, which renders
"… (recall — not checked against the regulator's text)".

## The gates

`__tests__/a-gate-two-answers-decide.test.ts` (11):

| Gate | Holds |
|---|---|
| `is asked of a device programme that stated an MDR class` | the first arm |
| `is NOT asked where no EU filing is planned` | `na` |
| `is NOT asked where neither class was stated` | **the defect**: an absent answer read TRUE |
| `IS asked of a diagnostics programme that stated an IVDR class` | the second arm, which did not exist |
| `is NOT asked of a diagnostics programme that stated no IVDR class` | the programmes that were all asked for no reason |
| `says which classes a notified body actually assesses` | the help text, with Art 52(7) |
| `anyOf` / `allOf` / `nests` | the evaluator |
| `is NOT satisfied by a group nobody wrote` | `{}`, `{anyOf: []}`, `{allOf: []}` |
| `names every field it reads` | `predicateFieldIds` over a nested group |

and in `pathway-question-uses-the-catalogue.test.ts`:
`does not present a paraphrase from recall as checked regulator text`.

## Verified by making each check fail

| Mutation | Refused by |
|---|---|
| U1 the old one-predicate gate restored (**the defect**) | `is NOT asked where neither class was stated`, and `is NOT asked of a diagnostics programme that stated no IVDR class` |
| U2 an empty group reads as an open gate | `is NOT satisfied by a group nobody wrote` |
| U3 `anyOf` treated as `allOf` | five tests |
| U4 `predicateFieldIds` blind to a group's leaves | `names every field it reads` |
| U5 the IVDR authority back to a flat citation | `does not present a paraphrase from recall as checked` |

```
$ npx vitest run server/services/ana/intelligence-questions/__tests__ shared/regulatory/__tests__
Test Files  39 passed (39)
     Tests  468 passed (468)

$ TYPECHECK_HEAP_MB=20480 npm run ci:typecheck:no-regression
errors found: 0 (tsc exit 0) — OK, matches baseline

$ node scripts/ci/check-eslint-warning-ratchet.mjs --since HEAD
7 lintable file(s) changed -- no file changed its warning count
```

## What this does not change

`issueChecks[].condition` stays a single `FieldPredicate`: the issue detector
reads `condition.field` to extract the trigger values an inspector reads off the
record, and widening it would mean deciding what "the trigger field" is for a
group. Nothing needed it yet, and a language feature nothing uses is a check
that only passes.
