# Four checks now read the question the interview actually asks

**Row:** D4
**Follows:** `2026-10-13-never-asked/`, which stopped eleven rules asserting
absences AnA had never probed and left a written ledger of ten questions
nobody asks.

## The ledger was wrong about four of them

Checking each entry against the flows found that four of those questions ARE
asked — in the interview's own words, under ids the detector had never heard
of:

| Rule | It read | The interview asks |
|---|---|---|
| `xn_class_iii_device_no_clinical_data` (**critical**) | `clinical_data_available`, `clinical_evidence` | `device_pma`: **`clinical_study_conducted`** + `clinical_no_study_justification`; `device_510k`: **`clinical_data_required`**, `clinical_study_type` |
| `xn_biologic_no_immunogenicity` (**critical**) | `immunogenicity_assessment`, `immunogenicity_strategy` | `ind_submission`: **`immunogenicity_assessment_planned`**; `bla_submission`: **`immunogenicity_risk_factors`** |
| `xn_accelerated_approval_no_confirmatory` (**critical**) | `confirmatory_trial`, `post_marketing_commitment` | `bla_submission`: **`confirmatory_study_needed`**, `confirmatory_study_protocol` |
| `xn_pediatric_without_safety_monitoring` (**critical**) | `has_dsmb`, `dsmb`, `data_monitoring` | `ind_submission`: **`data_safety_monitoring`** (which offers `not_defined`), `safety_monitoring_plan_detail` |

So these were not missing questions. They were a detector written against an
imagined vocabulary while the interview asked the right thing beside it — the
same failure as the class values that had drifted out of the fact reader, and
the same failure as the agency list a flow wrote for itself.

Each rule's `mitigatedBy` now names what the flows ask. **Four checks, all
four severity critical, went from firing at everyone to reading the sponsor's
own answer.**

## Two corrections the change needed

**A refusal is an answer, and `false` is a refusal.** A yes_no answer reaches
the detector as a real boolean from the card and as a string from the tool
surface. `strVal(false)` is `''`, so a sponsor answering *no, we ran no
clinical study* counted as having ANSWERED and silenced the critical finding —
the exact inverse of the defect being fixed. `isRefusal` now takes
`value === false`, and `'not_defined'` beside it, because the IND interview's
safety-monitoring question offers that by name.

**A question not yet reached is not a question declined.** The IND interview
asks about the immunogenicity assessment several nodes after the product type.
Firing *"Biologic Product Without Immunogenicity Assessment"*, at severity
critical, the moment someone answers "biologic" is the same insult in a smaller
form. The mitigation state gained a fourth answer:

| | |
|---|---|
| `present` | answered, and not a refusal → silent |
| `blank` | asked, **reached**, and left empty → the finding is real |
| `pending` | asked, and the person has not got there yet → silent |
| `unasked` | the flow asks none of them → silent |

`reached` is `state.completedNodes` against the node that holds the field —
data the detector already had.

## The gates

| Gate | Holds |
|---|---|
| `is not a question they declined` | the IND biologic case, all three ways: not reached → silent; reached and blank → fires; answered → silent |
| `still fire where the sponsor REFUSED the thing, which is an answer` | `clinical_study_conducted: false` fires; the same with a written justification is silent |
| `still fire where the mitigating question IS asked and left blank` | REMS in `nda_submission`, naming the node reached; silent in `labeling`, which asks only the trigger |
| `is either reachable from a question some flow asks, or named as not asked yet` | the ledger shrank from ten entries to six |

## Verified by making each check fail

| Mutation | Refused by |
|---|---|
| Z1 a question not yet reached treated as declined | `is not a question they declined`, and `no longer fire on the trigger alone` |
| Z2 a boolean `false` read as an answer | `still fire where the sponsor REFUSED the thing` |
| Z3 the device interviews' own clinical questions unread again | the reachability gate, and the refusal case |

```
$ npx vitest run tests/ana-intelligence server/services/ana/intelligence-questions/__tests__ \
      shared/regulatory/__tests__
Test Files  46 passed (46)
     Tests  701 passed (701)

$ TYPECHECK_HEAP_MB=20480 npm run ci:typecheck:no-regression
errors found: 0 — OK, matches baseline
```

## The six that remain

`NOT_ASKED_YET` still holds six, each a question worth adding rather than a
vocabulary mismatch: the biomarker strategy, the natural-history data an orphan
programme is asked for, the ethnic-bridging consideration ICH E5/E17 expects,
human-factors validation (IEC 62366-1), the interim analysis, and the months of
long-term stability data the ICH Q1E extrapolation check needs. Those are real
gaps in the interview, and they are the next thing.
