# A finding may not assert the absence of something AnA never asked

**Row:** D4 / *fail closed, never fabricate*
**Found by:** a reachability sweep of the cross-node issue detector, run because
the review's finding #3 — *"that check landed on a sponsor who had been made to
invent the data"* — looked like a shape rather than an incident.

It was a shape. **Eleven more times.**

## What was wrong

Every rule in `runCrossNodeAnalysis` has the form *"the programme says X, and
the mitigating fact is blank"*. `isBlank(undefined)` is TRUE. So a rule whose
mitigating field **no flow asks** fired on the trigger alone.

Thirty-five field ids read there are asked by no flow at all. The result, in
the sponsor's own interview:

| They answered | They were told | Severity |
|---|---|---|
| therapeutic area = oncology | "Oncology Program Without Biomarker Strategy" | warning |
| regulatory pathway = accelerated approval | "Accelerated Approval Without Confirmatory Trial Plan" | **critical** |
| designations include orphan | "Orphan Drug Without Natural History Data" | warning |
| four countries including Japan | "Multi-Regional Trial Missing Ethnic Bridging Considerations" | warning |
| product type = biologic | "Biologic Product Without Immunogenicity Assessment" | **critical** |
| device class = III | "Class III Device Without Clinical Evidence" | **critical** |
| device class = III | "High-Risk Device Without Human Factors Validation" | warning |
| paediatric population | "Pediatric Study Without Independent Safety Monitoring" | **critical** |

None of those mitigating questions is asked anywhere. A Class III device
programme was told, at severity **critical**, that it had no clinical evidence —
having never been asked whether it had any.

And three rules were the other failure, the one this repository calls a check
that only passes: `xn_phase3_no_interim` and
`xn_stability_insufficient_for_shelf_life` need a number no flow asks, so the
arithmetic never resolves; `xn_iso_14971_no_post_production` triggers on a
field no flow asks.

## What now happens

A rule **declares** what it reads:

```ts
triggeredBy: ['device_class', 'classification'],
mitigatedBy: ['clinical_data_available', 'clinical_evidence'],
```

and the engine computes, from the running flow's own definition, one of three
answers:

| | |
|---|---|
| `present` | one of them was answered → the rule must not fire |
| `blank` | asked, and left empty → the rule MAY fire |
| `unasked` | this flow asks none of them → **the rule stays silent**, because nothing was ever established |

`unasked` is not a silence to be fixed by firing anyway. It is a question AnA
does not ask yet, and it is now written down.

**A refusal is still an answer.** A sponsor who says `clinical_data_available:
'no'` has told AnA something, and the critical finding stands — the rule keeps
its `'no' | 'none'` branch beside the mitigation check. Narrowing the rules must
not disable them, and a test drives that case directly.

## The ledger of questions AnA does not ask

`NOT_ASKED_YET` in the gate, one entry per rule, each naming what is missing.
Ten entries today. **The list may only shrink**: a new entry means a new rule
was written against a question nobody asks. Each is also a question worth
adding — the confirmatory trial FDORA §3210 turns on, the immunogenicity
strategy every biologic owes, the human-factors validation IEC 62366-1 expects.

That is the difference this change makes: eleven invisible over-firings became
ten written gaps.

## The gates

`__tests__/cross-node-rules-can-fire.test.ts`:

| Gate | Holds |
|---|---|
| `declares what triggers it and what its finding rests on` | every rule but the one that reads no answer at all (it counts the criticals already found) |
| `is either reachable from a question some flow asks, or named as not asked yet` | the declared ids are ALTERNATIVES, exactly as the runtime reads them: some trigger asked, and some mitigation asked |
| `writes no reason for a rule that does not exist` | the other direction |
| `no longer fire on the trigger alone` | the six findings above, each from the answer a real interview takes |
| `still fire where the sponsor REFUSED the thing, which is an answer` | `'no'` is not an absence |
| `still fire where the mitigating question IS asked and left blank` | the REMS rule in `nda_submission`, which asks both — and silent in `labeling`, which asks only the trigger. The asymmetry this repair is about, in one test |

## Verified by making each check fail

| Mutation | Refused by |
|---|---|
| Y1 `unasked` treated as `blank` (**the defect**) | `no longer fire on the trigger alone`, and the REMS case |
| Y2 a stated mitigation ignored | `still fire where the mitigating question IS asked and left blank` |
| Y3 a refusal no longer counted as an answer | `still fire where the sponsor REFUSED the thing` |
| Y4 a rule's declarations removed | `declares what triggers it` |

```
$ npx vitest run tests/ana-intelligence server/services/ana/intelligence-questions/__tests__ \
      shared/regulatory/__tests__
Test Files  46 passed (46)
     Tests  700 passed (700)

$ TYPECHECK_HEAP_MB=20480 npm run ci:typecheck:no-regression
errors found: 0 — OK, matches baseline
$ node scripts/ci/check-eslint-warning-ratchet.mjs --since HEAD
4 lintable file(s) changed -- no file changed its warning count
```

## Also in this change

`tests/ana-intelligence/flow-registry-consistency.test.ts` read `.field` off
every `visibleWhen`, which a composite gate does not have — it broke the moment
the notified-body question became a two-answer gate, and this suite is not the
one the per-change runs cover. `predicateLeaves` was added beside
`predicateFieldIds` for callers that need the values as well as the fields (the
vocabulary probe compares a predicate's values against the options a field
offers), and the consistency test flattens through it.
