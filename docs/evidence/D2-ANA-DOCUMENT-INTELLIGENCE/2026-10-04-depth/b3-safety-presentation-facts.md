# b3-safety-presentation — regulatory facts relied on (checked 2026-10-05)

Regulator sites are blocked for direct fetch in this environment. Each fact
below was confirmed through a web search restricted to `fda.gov` on
2026-10-05; the URL is the regulator-hosted result the fact came from.
Anything not so confirmed is labelled **recall**. The code's `CHECKED` date
in `server/services/ind/ctd/csr-e3-basis.ts` is the overlay's shared
2026-10-04 date; these two bases were re-confirmed on 2026-10-05.

## 1. OND Custom Medical Queries (OCMQs) — `FDA_OCMQ`

Source: https://www.fda.gov/drugs/development-resources/office-new-drugs-custom-medical-queries-ocmqs
(regulator-text), with https://www.fda.gov/media/193392/download and the FMQ
update deck https://www.fda.gov/media/185950/download.

- OCMQs, formerly FDA Medical Queries (FMQs), are standardized groupings of
  similar AE terms that help identify potential safety issues during review
  of AE data. OND staff use them for premarket safety evaluation.
- Each OCMQ has Narrow and Broad components, and some have an Algorithmic
  component. The Algorithmic component uses term combinations, laboratory data,
  concomitant medications, medical history or timing. Narrow favours
  specificity and Broad favours sensitivity.
- MAPP 6025.8 sets out the Narrow, Broad and Algorithmic categories.
- "The use of FMQs by sponsors in whole or in part is entirely voluntary"
  (FMQ material, fda.gov/media/185950). The search summary also says applicant
  use of OCMQs is voluntary.
- **Volatile, deliberately not encoded:** "104 available OCMQs" (fda.gov) and
  the MedDRA version the current OCMQ release covers. Both change with each
  MedDRA release, so the record says "version-matched to the integrated
  database's MedDRA version" instead.
- **Recall:** the ~90% (Narrow) and ~30% (Broad) probability thresholds. They
  were surfaced from secondary material, not shown on a regulator page in this
  session, and are not encoded.

## 2. Standard Safety Tables and Figures (ST&F) — `FDA_STF_IG`

Sources:
- https://www.fda.gov/drugs/development-resources/standard-safety-tables-and-figures-stfs
- MAPP https://www.fda.gov/media/187067/download
- Integrated Guide https://www.fda.gov/media/187065/download (regulator-text)

Facts:
- The ST&Fs are an Integrated Guide (IG) plus Targeted Analysis Guides (TAGs).
  The MAPP describes their use by OND clinical reviewers during review of NDAs,
  BLAs and certain supplements. They are a **reviewer tool**, not a sponsor
  submission requirement, so every line in the record reads "anticipate".
- IG layout: OCMQ displays are arranged by organ system, and OCMQs within an
  organ system are ordered by decreasing risk difference. AE terms are
  generally ordered by decreasing risk difference.
- **Recall:** that risk-difference confidence intervals are unadjusted for
  multiplicity, and the "95% CI" wording. Both were seen in secondary snippets
  only. The record says "an unadjusted confidence interval" and gives no level.

## 3. Targeted Analysis Guides (ISS-LAB)

- Kidney Injury TAG: https://www.fda.gov/media/187063/download
- Muscle Injury TAG: https://www.fda.gov/media/187064/download

The two TAGs exist and reviewers use them where the program's data warrant it.

## 4. Where the record now says this

| Place | Change |
|---|---|
| `csr-e3-basis.ts` | `FDA_STF_IG`, `FDA_OCMQ` (regulator-text) |
| `csr-e3-sections-results.ts` 12.2.2 | presentation (framed as anticipation; "The CSR is not required to use this layout"), basis `[FDA_E3, FDA_STF_IG, FDA_OCMQ]` |
| `csr-e3-sections-results.ts` 12.2.3 | grouped-term pitfall; first basis `[FDA_STF_IG, FDA_OCMQ]` |
| `lifecycle-document-types.ts` standalone `iss` | regulatoryBasis ×2, ISS-AE elements ×2 + guidance sentence, ISS-LAB TAG element |
| `authoring-guidance.ts` 2.7.4 | one expectedData and one commonPitfalls entry |

The nda and bla ISS components were deliberately left unchanged. The record
holds three ISS descriptions, and copying the text into all three would deepen
that duplication. See the step's needs_elsewhere.
