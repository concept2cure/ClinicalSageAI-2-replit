# The tox-findings classifier states only what the input states, and never misses a stated adverse change

Row D2. Slice N1 of `docs/design/NONCLINICAL_IB_WHAT_EXISTS_2026-11-12.md` (defect L2). A repair to what launch
already offers: nothing new is built. Session `…01LjrcEe8y`.

## What already exists

`server/services/preclinical/tox-findings-classifier.ts`: a small knowledge base of regular-expression rules
(hepatocellular hypertrophy, phospholipidosis, thyroid follicular hypertrophy, α2u-globulin, adrenal cortical
change: adaptive or monitor; necrosis, inflammation, proliferation: adverse). A normally adaptive finding is
escalated to adverse when an adverse correlate is present or the severity is moderate or greater; an unknown finding
is indeterminate. It is reached at launch by AnA's in-scope `classify_tox_findings` ("engine: deterministic",
`server/services/ana/AnaToolExecutor.ts`), over findings a person states in the conversation, and by the Module 2.6
composer (`server/services/preclinical/m26-nonclinical-summaries.ts`), whose overview says which findings "define the
NOAEL". Searched: `classifyToxFinding`, `classify_tox_findings`, `tox-findings-classifier`, `ADVERSE_CORRELATES`,
across `server`, `shared`, `client/src` and `tests`. No second classifier exists.

## What was wrong (each run at `HEAD`)

1. Thyroid follicular cell hyperplasia came back "escalated to adverse due to adverse correlates" with none given:
   "hyperplasia" is both part of the thyroid rule's name and an adverse word.
2. **The unsafe direction.** An adenoma, a carcinoma, a sarcoma, a lymphoma or a metastasis given as a correlate did
   not escalate an adaptive finding. Thyroid follicular hypertrophy with a follicular cell adenoma stayed "adaptive,
   non-adverse ... not considered to limit the NOAEL". A follicular cell carcinoma given as the finding itself was
   adaptive (the thyroid rule took any "follicular").
3. An escalation by severity alone was framed "with adverse correlates". An escalated finding kept the adaptive rule's
   "reversible" and its low human relevance. Hyaline droplets (a rule that cannot be escalated) stayed adaptive with a
   necrosis stated beside it. A Kupffer cell hypertrophy was taken for hepatic enzyme induction. The correlates and
   adverse words of a finding no rule matched were not read.

## What changed

- The adverse words are the correlates and the words of every rule the knowledge base itself calls adverse, read to
  the end of the word. The proliferative rule names the malignancies a report writes (sarcoma, lymphoma, leukaemia,
  malignant, metastasis, cancer, -blastoma, melanoma, mesothelioma); "mass" and "nodule" are observations and are
  left out. Adjectives and the reversed laboratory order ("necrotic", "ALT increased") are read.
- Thyroid follicular hyperplasia, and nothing else, is adverse with its own reason: a hyperplastic change is not
  called adaptive here, and whether this one is the rodent response to enzyme induction is a pathologist's judgement.
  The thyroid rule needs the thyroid and a follicular hypertrophy or hyperplasia; the liver rule needs hepatocytes.
- An escalated finding has reversibility unknown unless a recovery cohort said, and human relevance uncertain.
  Severity alone is framed as severity. A rule that cannot be escalated, with an adverse change beside it, is
  indeterminate. A finding no rule describes, with an adverse change stated in it or beside it, is adverse.
- The reason names the whole words that escalated, and says when a word of negation stands beside them.
- A correlate that is not text is skipped (as the version before did; a draft of this change threw on one).

## The review of the committed version (2026-11-12), and what changed after it

An independent reviewer ran 3,925,548 inputs against the version before this change and refused the first commit:

| Finding | Fix |
|---|---|
| **A hang.** The narrowed thyroid rule, `thyroid.*(follicular.*(hypertrophy|…)|…)`, backtracked in cubic time: 0.4 to 0.6 s on a 10,000-character finding, 3 to 5 s on 20,000. | Three anchored lookaheads, each read once. A timing case now reaches every rule with a long text. |
| Wordings a report uses were not read: "increased alanine aminotransferase", "increases in serum ALT", "ALT elevation (3x)", "necrotizing", "hyperplastic". The version before missed them too. | The laboratory forms are bounded patterns over the spelled-out enzyme names, in either order; the stems read "necrotizing" and "hyperplastic". |
| A correlate split across entries (`["increased", "ALT"]`) was no longer read as one (2,512 inputs, less adverse than before). | The correlates are also read joined. |
| INHAND's "Hypertrophy, periportal, hepatocellular" fell out of the liver rule. | Up to two qualifiers between the change and the cell type, in either order. |
| The negation note reached neither an adverse rule's reason nor the overview the 2.6 composer prints, so "no mortality" was listed as defining the NOAEL with no caveat. | The note is on every adverse reason, the finding carries `negationUnread`, and the overview names such findings and says a pathologist confirms. |
| The thyroid case read only the finding: with "C-cell adenoma" in the organ field it still gave the enzyme-induction reason. Mild qualifiers ("minimal", "diffuse") fell out of it. | It applies only when hyperplasia is the only adverse word anywhere, and allows mild and distribution qualifiers. A focal, atypical or nodular hyperplasia gets the ordinary reason. |
| Hyaline droplets with a stated necrosis went from adverse (the version before, by accident) to indeterminate. | Adverse, the conservative call, with the rule's rodent-specific human relevance said and left to a pathologist. |
| The commit claimed a non-text correlate failed the whole batch before. It did not: the version before joined them. | The claim is withdrawn here and in the code; that test is marked as a guard. |

## What was tried and refused: reading negation

The defect list of the map also named "no tubular necrosis" and "hypertrophy without necrosis" being escalated. Two
versions that read negation were built and reviewed, and neither was committed:

- The first dropped everything from "no", "not" or "without" to the end of the clause. Its review (workflow
  `wf_db31d646-310`, 14,856 generated inputs) found 4,268 inputs, in 19 phrasings, where an adverse change the input
  stated went from adverse to adaptive: "no recovery of the necrosis", "not without necrosis", "necrosis not seen in
  controls".
- The second read an absence only where the word of absence directly governed the adverse word and the statement
  ended there. Its review (workflow `wf_b1bbb364-5b2`, 421,200 inputs) found 59,776 unsafe answers in 81 phrasings
  ("with or without necrosis", "no necrosis, except at the high dose", "no necrosis in any control animal", "not all
  animals were free of necrosis"), and an exponential backtrack: a 300-character list of adverse words took 23.7 s.

A missed adverse change is the error this classifier must not make; a stated absence counted as present is the one
it may. So negation is not read. When a word of negation stands beside an adverse word, the reason says that the
change is counted as present and that a pathologist confirms.

## Red first

The new test file, `server/services/preclinical/__tests__/tox-classifier-states-only-what-the-input-states.test.ts`,
run against the committed classifier: 12 of 16 cases fail. The four that pass are guards of what held before
(linear time, a stated absence counted as present, a non-text correlate, the existing calls).

## The property, checked against `HEAD`

A differential over 13,056 inputs (17 findings, 24 adverse words, 16 phrasings, in the finding and as a correlate):

- **0** answers less adverse than `HEAD` among inputs that hold an adverse word;
- **0** answers of adaptive or monitor where an adverse word is stated.

The reviewer's 3.9 million inputs found the same, outside the two cases now fixed (split correlates, and hyaline
droplets beside another rule's lesion). An input with no adverse word can be answered less adversely than before: an
INHAND "Hypertrophy, hepatocellular" given an unusual organ field is now adaptive where it was indeterminate; that is
the rule doing what it says.

Across severities, 36 answers go from adverse to indeterminate, all one case: a finding no rule describes ("liver:
hypertrophy", "Kupffer cell hypertrophy", "thyroid: follicular atrophy") at moderate or marked severity. `HEAD` called
these adverse only because the hepatocellular or follicular rule matched them by accident. Indeterminate never says a
finding does not limit the NOAEL; it asks for a pathologist.

The new test pins the property for 5,000+ generated inputs: every adaptive finding of the knowledge base, with every
adverse word, in 23 phrasings that the refused versions got wrong, in the finding and as a correlate, is adverse.

## Suites

After the review's fixes: `server/services/preclinical/__tests__`, `server/services/toxicology` and the three AnA test
files that name the tool: 17 files, 395 tests, all pass. ESLint: no warning in either file.
`ci:typecheck:no-regression --incremental`: 0 errors.
