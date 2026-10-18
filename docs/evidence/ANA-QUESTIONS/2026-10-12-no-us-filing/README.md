# A European programme is not made to assert an FDA class

**Row:** D4 (AnA's interview is subject-matter intelligent and governed)
**Directive:** founder's, 2026-10-12 — positions the human can take, with an
other; consistent across every device and diagnostics scenario.
**Finding acted on:** `docs/evidence/ANA-QUESTIONS/2026-10-12-review/README.md`
— "an EU-only device programme is still required to state a US risk class."

## What was wrong

`device_classification` asks two classes, and they were not symmetric.

| Field | Required | An answer for a programme not filing there |
|---|---|---|
| `eu_mdr_class` — EU MDR Classification | no | `na` — "Not applicable / No EU filing planned" |
| `device_class` — Device Classification (US) | **yes** | **none** |

So a European device programme reaching this question had two ways past it:
assert an FDA class it had never determined, or say it did not know one. Those
are different statements and neither was true of it — and whichever it picked
went onto the record as the programme's own answer, where the route cautions,
the Annex VIII comparison and anything else that reads the class would treat it
as a declaration.

The EU field had the right design from the day it was written. The repair is to
use its own wording on the other field, read it the same way, and report the
one case where the two answers contradict each other.

## What now happens

- `device_class` offers **"Not applicable / No US filing planned"**
  (`no_us_filing`), in the EU field's words, because it is the same question
  about a different regulator.
- The fact reader states **no class** for it, and `DECLARED_NON_FACTS` says why
  — distinctly from `not_classified`, which says the person does not know yet.
  Both state no class; the record keeps which was said.
- The field stays **required**. It is the value that was missing, not the
  requirement: the class is a fact the record needs, and now every programme
  has a true answer to give.
- Nothing about the routes changed. FDA's routes are marked for a European
  programme by `wrong_regulator`, from the agencies it named — this answer must
  not become a second, quieter way of deciding which routes exist, and a test
  holds that it is not.
- **A new cross-node check**, `xn_no_us_filing_while_naming_fda`: FDA among the
  agencies AND no US filing planned is a contradiction, and it is reported as a
  warning that names both answers and what to do with either — determine the
  class, or take FDA off the list so AnA stops configuring the Module 1
  backbone, the validation profile and the gateway for it. It reads the
  agencies through `programmeFactsFrom`, the same fact reader the route
  cautions use, so it cannot disagree with the routes the person was offered.
  That also means it needed no second rule for `additional_agencies` — and a
  test watches it fire on that path rather than leaving it reasoned about.

## The gates

`__tests__/a-programme-that-does-not-file-in-the-us.test.ts`, 11 assertions:

| Gate | Holds |
|---|---|
| `both offer the answer a programme filing in one region only has to give` | the two class questions are symmetric — the property that was missing |
| `is required of everyone, which is only honest now that everyone has an answer` | `required: true` **and** the value exists |
| `is refused where the field is left blank` | the requirement is real, so the gate above is not vacuous |
| `reads no US filing as the absence of a class, not as a class` | `programmeFactsFrom` yields `{}` |
| `still has FDA’s routes marked by the regulator rule, not by this answer` | the EU list is drawn as before |
| `is not told it has contradicted itself, because it has not` | silent for an EU-only programme |
| `is reported when FDA is the primary agency` / `among the additional agencies` | both paths of the one rule |
| `says which two answers it is about, and what to do with either` | severity, both remedies, the citation, the trigger values |
| `is silent where a class WAS stated` | the rule turns on the non-answer, not on the agency |

## Verified by making each check fail

| Mutation | Refused by |
|---|---|
| N1 the `no_us_filing` option removed (**the defect itself**) | six of the eleven, and — separately — `every-offered-value-is-read`'s stale-exception gate, which refuses a declared non-fact for a value no question offers |
| N2 the value read as Class I instead of as no class | `reads no US filing as the absence of a class` |
| N3 the rule reads only `primary_regulatory_agency` | `is reported when FDA is among the additional agencies` |
| N4 the agency condition dropped, so the rule fires on any such answer | `is not told it has contradicted itself, because it has not` |
| N5 the field stops being required | `is required of everyone`, and `is refused where the field is left blank` |

```
$ npx vitest run server/services/ana/intelligence-questions/__tests__ shared/regulatory/__tests__
Test Files  38 passed (38)
     Tests  456 passed (456)

$ node scripts/ci/check-eslint-warning-ratchet.mjs --since HEAD
4 lintable file(s) changed -- no file changed its warning count
```

## Also in this change

The `submission_route` guidance said the list is "narrowed to what the modality
frame allows this product", which stopped being the whole truth when the
investigational filing was added to the draw
(`docs/evidence/ANA-QUESTIONS/2026-10-12-investigational/`). It now says that
the filing permitting the study rather than the sale follows the routes.

## What this does not do

The US class is still hand-written and required in four other flows
(`device-510k`, `device-pma` — both US interviews, where requiring it is right
— and `labeling`, `sop-development-specializations`, where it is the same
asymmetry in a smaller place). That is the "US class enumerated in about
fifteen places" finding, still open, and it is not claimed fixed here.
