# g-basis-constants-one-home: the regulatory facts this step relies on

Step: every shared basis constant in one file, `server/services/ind/ctd/regulatory-basis.ts`, with the ICH E3 URL corrected (ANA_REGULATORY_RECORD.md R1b; verified findings 5, 12 and 17).

Basis labels: **regulator-text** means the wording was matched against search results quoting a regulator-hosted copy at the URL shown, on the date shown. The session could not fetch the documents themselves, because fda.gov, ecfr.gov and ema.europa.eu are blocked for WebFetch here. **recall** means it was not checked this session.

## Facts checked or corrected in this step

| # | Fact | Basis | Source (regulator-hosted) | Checked |
|---|---|---|---|---|
| F1 | `fda.gov/media/71271/download` is FDA's copy of ICH E3, "Guideline for Industry: Structure and Content of Clinical Study Reports" (July 1996). | regulator-text | https://www.fda.gov/media/71271/download (search result title "Guideline for Industry Structure and Content of Clinical Study Reports"; FDA guidance page https://www.fda.gov/regulatory-information/search-fda-guidance-documents/e3-structure-and-content-clinical-study-reports) | 2026-10-05 |
| F2 | `fda.gov/media/84857/download` is FDA's copy of "E3 Structure and Content of Clinical Study Reports — Questions and Answers (R1)", issued January 2013 by CDER and CBER. It is not ICH E3. | regulator-text | https://www.fda.gov/media/84857/download; https://www.fda.gov/regulatory-information/search-fda-guidance-documents/e3-structure-and-content-clinical-study-reports-questions-and-answers-r1 | 2026-10-05 |
| F3 | The E3 passages the overlay cites FDA_E3 for are E3 text: §12.2.2 calls for a summary table of the relatively common adverse events, and §16.1.9 is "Documentation of statistical methods". These are research.md rows E8 and E15, which had recorded the wrong URL (84857). | regulator-text (search extract of 71271) | https://www.fda.gov/media/71271/download | 2026-10-05 |

Consequences in the code:
- `FDA_E3.url` is now `https://www.fda.gov/media/71271/download`, with `checked: '2026-10-05'`.
- Its ref reads "ICH E3, as published by FDA (July 1996)".
- The CSR headings that cite FDA_E3 are §12.2.2, §12.2.4, §14.3.1, §14.3.4, §15, §16.1.9, §16.1.11, §16.1.12 and §16.2.7, plus the chain's `csr` node. Each of these now names E3 itself rather than its Q&A.

## A deliberate deviation from the step text

The step says "media/84857 stays only on E3_QA_R1". `E3_QA_R1` does not point at 84857 and did not before this step. It points at the **EMA** copy of the E3 Q&A (R1), which is the copy research.md row E12 checked on 2026-10-04.

Re-pointing it at FDA's January 2013 copy would claim a check against a copy nobody read. So `E3_QA_R1` is unchanged, and no basis in `ind/ctd` binds 84857.

The test pins this: any basis binding 84857 must be `E3_QA_R1`. If an FDA-copy Q&A basis is wanted later, it must be read first and then declared here once.

## Facts moved unchanged (no re-check this step; their basis is as recorded on 2026-10-04 or 2026-10-05)

| Constant | URL | Recorded in |
|---|---|---|
| E3_QA_R1 | EMA E3 Q&A (R1) PDF | 2026-10-04/research.md E12 |
| FDA_PDF_SPECS | https://www.fda.gov/media/76797/download | 2026-10-04/research.md |
| FDA_STUDY_DATA_TRC | https://www.fda.gov/files/drugs/published/Technical-Rejection-Criteria-for-Study-Data.pdf | 2026-10-04/research.md |
| FDA_SDTCG | https://www.fda.gov/media/88173/download | 2026-10-04/research.md |
| FDA_ECTD_TCG | https://www.fda.gov/media/93818/download | 2026-10-04/research.md |
| M4E_R2 | https://www.fda.gov/media/93569/download | 2026-10-04/research.md E7 |
| FDA_ISS_ISE_PLACEMENT | fda.gov ISS/ISE placement page | 2026-10-04/research.md E10, E21 |
| FDA_ISE_GUIDANCE | https://www.fda.gov/media/72335/download | 2026-10-04/research.md E10 |
| FDA_STF_IG, FDA_OCMQ | fda.gov/media/187065; OCMQ page | 2026-10-04-depth/b3-safety-presentation-facts.md |
| CFR_314_50_F, CFR_314_101, cfr201_57() | eCFR part 314 subpart B, §314.101, §201.57 | 2026-10-04/research.md; b1-plr-rules-elsa-facts.md |

## Wording unified

The two ISS/ISE copies carried different refs:
- "FDA, Placement of Integrated Summaries of Safety and Effectiveness (ISS/ISE) in the eCTD" (chain)
- "FDA, Placement of ISS/ISE in the eCTD" (technical rules)

The surviving constant keeps the longer one, which is the FDA page's own title. The `content-iss-ise` rule in `FDA_TECHNICAL_RULES` now shows that ref.

The two M4E(R2) copies were identical.

## Owed

- A verbatim re-read of ICH E3 at fda.gov/media/71271, when a regulator host can be fetched. The check above is a search extract, the same standard as the 2026-10-04 research.
- research.md rows E8, E15 and E23 still show the 84857 URL. They are historical evidence and are not edited. This file supersedes them for the URL.
