# Patient narratives in a medical writer's sentences (2026-10-30)

Launch rows D2 / D4, workstream W1 (CSR end to end). SYNTHETIC data only.

## What already exists

- `server/services/ana/safety-narrative.ts` `composeSafetyNarrative`: the one deterministic narrative composer
  (June 2026). Three callers: the CSR narrative job (`server/services/csr/narrative-compose.ts`), AnA's
  `draft_safety_narrative` (`AnaToolExecutor.ts`), and the E2B ICSR composer (`ind-lifecycle/e2b-icsr-composer.ts`).
- `server/services/csr/narrative-reconciliation.ts`: the fact gate. It checks dates, study days, ages, grades,
  severities, death words and withdrawal attribution, not wording. Unchanged here.

Nothing was rebuilt; the composer is completed.

## The defect

The composer read the CDISC codelist values out instead of writing sentences:
"Action taken with study drug: dose not changed", "The outcome was reported as recovered/resolved",
"The event was assessed as serious (criteria: hospitalization or prolonged hospitalization)". On the CDISC pilot,
whose AEREL values are NONE / REMOTE / POSSIBLE / PROBABLE, it wrote "the investigator assessed the event as
possible to Xanomeline", which is not English. "On dechallenge was positive." was ungrammatical on every caller.

## The change

Each CDISC term becomes the sentence a medical writer writes, keeping its meaning:

| Field | Value | Sentence |
|---|---|---|
| event | serious, `moderate` | "experienced a serious adverse event of Pneumonia, moderate in intensity" |
| AESHOSP | Y | "The event was serious: it required inpatient hospitalization or prolongation of existing hospitalization." |
| AEACN | DOSE NOT CHANGED / DRUG WITHDRAWN / DRUG INTERRUPTED | "The dose of X was not changed." / "X was permanently discontinued." / "X was temporarily interrupted." |
| AEOUT | RECOVERED/RESOLVED / RECOVERING/RESOLVING / FATAL | "The event resolved." / "The event was recorded as resolving." / "The event was fatal." |
| AEREL | NONE / REMOTE / POSSIBLE / PROBABLE | "not related" / "remotely related" / "possibly related" / "probably related" |

- The investigator's causality category is kept. It is not collapsed to related / not related, which is the
  SAP's decision.
- A value outside these lists is stated as recorded, as before. Nothing is guessed.
- The seriousness sentence uses no causal word ("because"): the D17 rule keeps causal words out of a narrative
  whose withdrawal the data do not attribute, and its test caught the first wording.
- The new lookups sit in helpers; `composeSafetyNarrative`'s complexity went from 33 to 31.

## Red, then green

| Check | Result |
|---|---|
| New composer cases before the change (`red.txt`) | 5 failed, 3 passed |
| Dechallenge sentence, fix reverted | 2 failed (the new case and the full-narrative case) |
| After: composer, CSR narratives, E2B ICSR, AnA narration tools, pharmacovigilance, narratives route | 51 files, 415 passed |
| The CSR gate's tamper tests (onset day, severity) | failed while their fixtures held the old wording, pass on the new wording |

Before and after, on the same synthetic subjects: `after-synthetic.txt`. Before, for subject SYN-NARR-0004:

> On study day 10, the subject experienced moderate Pneumonia. The event was assessed as serious (criteria:
> hospitalization or prolonged hospitalization). Action taken with study drug: dose not changed. The outcome was
> reported as recovered/resolved. The investigator assessed the event as not related to Placebo.

After:

> On study day 10, the subject experienced a serious adverse event of Pneumonia, moderate in intensity. The event
> was serious: it required inpatient hospitalization or prolongation of existing hospitalization. The dose of
> Placebo was not changed. The event resolved. The investigator assessed the event as not related to Placebo.

## Not changed

- Concomitant medications stay as WHO-DD records them (upper case). Lower-casing would mangle names such as
  "VITAMIN B12".
- A model rewrite is still governed by PQ-DRAFT-001; this is the template prose every narrative falls back to.

## Follow-up, read against the CDISC pilot (same day)

All 95 pilot narratives were composed locally with the new composer (pilot data stays outside the repository; only
counts are filed): **95 composed, 0 refused, 0 fact-gate failures, 0 old read-out phrases, 0 ungrammatical causality
sentences.** Reading them showed three more things a medical writer would not leave:

1. "a 80-year-old". `indefiniteArticle` (safety-narrative.ts) takes "an" before 8, 11, 18 and 80–89, and before a
   vowel. Used by the composer and by the withdrawal-only subject sentence (`narrative-compose.ts`).
2. The D17 list of TEAEs before a per-subject withdrawal read the codes out ("relationship to study treatment
   recorded as possible, outcome not recovered/not resolved"). It now uses the composer's own vocabulary, exported
   as `causalityPhrase` and `outcomeState`, so there is one list of these terms, not two: "(mild, not serious,
   possibly related to study treatment, not resolved)". A value outside the vocabulary is stated as recorded.
3. The list was in row order (days 3, 3, 22, 3). It is now in onset order: study day, then date; ties keep the rows' order.

| Check | Result |
|---|---|
| New cases before the change (`red-2.txt`) | 3 failed: the article, the list wording, the onset order |
| After: composer, CSR narratives, E2B ICSR, AnA narration tools, pharmacovigilance, narratives route | 56 files, 550 passed |
| D17 fixtures that matched the old list format | moved to the new format; their assertions are unchanged |
| Pilot re-run | 95 / 95 composed, 0 gate failures |
