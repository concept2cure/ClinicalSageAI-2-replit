# b1-guidance-facts — regulatory facts relied on

Checked 2026-10-04. Regulator sites are blocked for direct fetch in this
environment. Here "regulator-text (search extract)" means a WebSearch limited
to regulator domains returned the statement from the regulator-hosted document
at the URL shown. That is the search engine's extract of the document, not a
full read. Everything else is labelled recall.

Changed file: `server/services/ind/ctd/authoring-guidance.ts`, entries 2.7.3,
2.7.4, 2.7.6, 1.9 and 1.14.4.1, each amended in place.
Guard: `tests/regulatory/ctd-guidance-correctness.test.ts`.

## 1. ISE / ISS placement (2.7.3, 2.7.4 generationPrompt)

| Fact | Confidence | Source |
|---|---|---|
| The ISE and ISS are filed in 5.3.5.3. A narrative portion suitable for Module 2 may be placed once in 2.7.3 / 2.7.4 and referenced from 5.3.5.3 | regulator-text, as already recorded in research.md E10 and in the entries' own `.guidance` | https://www.fda.gov/drugs/electronic-regulatory-submission-and-review/placement-integrated-summaries-safety-and-effectiveness-issise-applications-submitted-ectd-format |
| ISE = 21 CFR 314.50(d)(5)(v); ISS = 314.50(d)(5)(vi) | as already pinned by tests/regulatory/ana-ctd-section-truth.test.ts | eCFR 21 CFR 314.50 |

## 2. Narratives of deaths and SAEs (2.7.4)

| Fact | Confidence | Source |
|---|---|---|
| M4E 2.7.4.2.2 Narratives: the **locations** of individual narratives of deaths, other SAEs and other significant AEs of special interest "should be referenced here" | regulator-text (search extract) | https://www.fda.gov/media/93569/download (FDA M4E(R2)); https://database.ich.org/sites/default/files/M4E_R2__Guideline.pdf |
| "The narratives themselves should be a part of the individual study reports, if there is such a report"; where there is no individual report they can be placed in Module 5, section 5.3.5.3 | regulator-text (search extract) | same |
| Narratives are not included in 2.7.4 unless an abbreviated narrative is critical to the assessment | regulator-text (search extract run by the verifier on 2026-10-04; not re-extracted verbatim in this step's search) | same |
| In the CSR, narratives are at ICH E3 12.3.2 and 14.3.3 | as held by the canonical tree, server/services/ind/ctd/csr-e3-sections-results.ts:117 and csr-e3-sections-appendices.ts:27 | — |

## 3. Synopses of individual studies (2.7.6)

| Fact | Confidence | Source |
|---|---|---|
| ICH eCTD specification for 2.7.6: "The synopses should already be located in the Clinical Study Reports in Module 5 and should not, therefore, be repeated in Module 2. It is considered sufficient to provide hyperlinks from the listing of the studies, located here, to the locations of the synopses in Module 5." | regulator-text (search extract) | https://www.fda.gov/media/71513/download (FDA, M2 eCTD); https://admin.ich.org/sites/default/files/inline-files/eCTD_Specification_v3_2_2_0.pdf |
| EU: "acceptable either to include copies of the synopses for each study in section 2.7.6 or to provide hyperlinks to synopses located in Module 5" | regulator-text (search extract) | https://esubmission.ema.europa.eu/ectd/docs/Harmonised%20guidance%20eCTD%20-%20version%206.0.pdf ; https://esubmission.ema.europa.eu/doc/eCTD%20Guidance%20Document%201.0%20FINAL%20FOR%20PUBLICATION.pdf |
| Paper-CTD M4E puts the Listing of Clinical Studies first in 2.7.6, followed by the synopses | recall | ICH M4E(R2) |

So the corrected text does **not** say synopses must never appear in Module 2.
It says that for a US eCTD they are hyperlinked rather than repeated, and that
EU guidance and paper CTD accept copies.

## 4. PREA and orphan designation (1.9)

| Fact | Confidence | Source |
|---|---|---|
| 505B(k)(1): PREA does not apply to a drug for an indication with orphan designation. 505B(k)(2): it does apply when the (a)(3) molecularly targeted pediatric cancer investigation applies under (a)(1)(B) | regulator-text (search extract: "the 'orphan exemption' does not apply to products that trigger PREA under section 505B(a)(1)(B)") | https://www.fda.gov/media/168202/download (draft PREA guidance); https://www.fda.gov/media/157840/download |
| An original NDA/BLA submitted on or after 2020-08-18 for a new active ingredient, intended for an adult cancer and directed at a molecular target FDA finds substantially relevant to a pediatric cancer, must contain reports of the molecularly targeted pediatric cancer investigation unless waived or deferred, even with orphan designation | regulator-text (search extract) | https://www.fda.gov/media/133440/download (FDARA Implementation Guidance for Pediatric Studies of Molecularly Targeted Oncology Drugs) |
| iPSP is due no later than 60 days after the EOP2 meeting (505B(e)) | recall, unchanged in the entry | — |

The proposal to add 'IND' to 1.9 `requiredFor` was rejected. `requiredFor`
drives readiness (types.ts:50-51). The iPSP is owed only for drugs PREA
applies to, and only after EOP2, so marking 1.9 required for every IND would
invent an obligation. The test pins `['NDA','BLA']`.

## 5. Investigator's Brochure (1.14.4.1)

| Fact | Confidence | Source |
|---|---|---|
| FDA Module 1: 1.4.1 = letter of authorization; 1.14.4.1 = investigator's brochure | regulator-text (search extract; research.md E14), and pinned by the platform's CV data (server/services/ectd/controlled-vocab/cv-v4-data.ts:103, :180) and tests/regulatory/fda-module1-numbering.test.ts | https://www.fda.gov/media/76444/download |
| E6(R3) final, published by FDA as guidance: IB content is Appendix A | regulator-text (search extract) | https://www.fda.gov/media/169090/download ; https://www.ema.europa.eu/en/documents/scientific-guideline/ich-e6-r3-guideline-good-clinical-practice-gcp-step-5_en.pdf ; https://database.ich.org/sites/default/files/ICH%20E6(R3)_Step4_FinalConsolidatedGuideline_2026_0616_.pdf |
| E6(R3) adds the frequency and nature of adverse reactions to the reference safety information used to determine the expectedness of serious adverse reactions | regulator-text (search extract) | same |
| E6(R2) section 7 = IB | recall | — |
| Clause numbers A.3.6 "Effects in Humans", A.3.7 "Summary of Data and Guidance for the Investigator", and "A.3.6(b)" for the RSI | **recall / unverified.** They appear only in non-verbatim search summaries. The code cites "Appendix A" without clause numbers, and the prompt uses the headings as plain words | — |

`wordCountRange` [300, 800] was removed from 1.14.4.1. The range fitted the
old "1.4.1 reference stub" framing, and the prompt now drafts the full IB. No
replacement number was invented. The field is optional (types.ts:70). Nothing
reads `CtdSection.wordCountRange` for this code: authoring-plan-generator.ts:621
reads IND_SECTIONS, which has no 1.14.4.1 entry.
