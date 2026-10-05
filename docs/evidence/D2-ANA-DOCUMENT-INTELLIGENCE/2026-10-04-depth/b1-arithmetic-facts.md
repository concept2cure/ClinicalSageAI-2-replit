# b1-arithmetic: regulatory facts relied on

Checked 2026-10-04. Regulator sites cannot be fetched directly from this
environment. "regulator-text (search extract)" means the statement came back
from a WebSearch restricted to fda.gov, quoting the regulator-hosted document
at the URL shown. That is the search engine's extract, not a full read.

Changed files: `server/services/ana/dossierReconciliation.ts` (new
`checkFigureArithmetic`) and `server/services/ana/terminology-consistency.ts`
(new `'arithmetic'` finding kind).
Guard: `server/services/ana/__tests__/clinical-arithmetic.test.ts`.

| Fact | Confidence | Source | How the code uses it |
|---|---|---|---|
| "Adverse reaction rates expressed in percentages should ordinarily be rounded to the nearest integer". An exception is particularly serious adverse reactions (e.g. stroke, intracranial hemorrhage, agranulocytosis) occurring at low rates in a large study, where fractions of a percent may be meaningful | regulator-text (search extract) | FDA, *Adverse Reactions Section of Labeling for Human Prescription Drug and Biological Products — Content and Format* (2006), https://www.fda.gov/media/72139/download ; landing page https://www.fda.gov/regulatory-information/search-fda-guidance-documents/adverse-reactions-section-labeling-human-prescription-drug-and-biological-products-content-and | Tolerance is set by the precision the text states (d decimals → ±0.5·10^-d), not by a fixed one-decimal rule, so "8% (24/305)" (7.87%) is correct at integer precision. Bounded figures such as "<1%" are skipped, not recomputed. |
| The ICH E3 tree names "Synopsis figures left stale after a late TFL rerun" and "Counts that do not reconcile with the analysis sets in §11.1 and the synopsis" as pitfalls | platform record, as held by the canonical tree | `server/services/ind/ctd/csr-e3-sections-plan.ts:29`, `server/services/ind/ctd/csr-e3-sections-results.ts:22` | These are the defects the check catches inside one text. |
| An integrated summary (2.7.4 / ISS) pools several studies; a safety (as-treated) set can include subjects dosed without randomization; sex-specific or subgroup event denominators legitimately differ from the arm N | recall (ICH E3 / E9 analysis-set practice; not re-checked against regulator text in this step) | — | Why totals are **not** compared across populations: the proposed POPULATION_ORDER check (treated ≤ randomized, SAE denominator ∈ arm Ns) was dropped because it would fire on correct documents. |

The one-decimal claim in the original finding ("example tables give
percentages to one decimal") is **not** what the search extract of the
guidance says, and nothing in the code relies on it.

### Review fix (2026-10-04)

| Fact | Confidence | Source | How the code uses it |
|---|---|---|---|
| A CSR commonly states the randomized total and then, in one parenthetical, the sizes of the analysis sets (FAS / ITT / mITT, per-protocol, safety). These sets overlap one another and are not a partition of the total, so their counts are not expected to sum to it | recall (ICH E9 §5.2 analysis sets, ICH E3 §11.1 practice; not re-checked against regulator text in this step) | — | `armCounts` returns null (not checked) when any item names an analysis population or an exposure/disposition set: FAS, full analysis, ITT, mITT, intent-to-treat, PP, PPS, per-protocol, safety, set, population, analysis, evaluable, completed, discontinued, withdrew, dosed, "at least one dose", "all/any doses". This is the same population-mixing false positive for which POPULATION_ORDER was dropped. It had come back through the arm-list parser, and the reviewer reproduced it on four correct sentences, which are now guarded in `clinical-arithmetic.test.ts`. |
