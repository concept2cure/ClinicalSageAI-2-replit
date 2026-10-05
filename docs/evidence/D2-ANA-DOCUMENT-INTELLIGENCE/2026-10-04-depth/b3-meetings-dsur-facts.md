# b3-meetings-dsur — regulatory facts relied on

Checked 2026-10-04 by WebSearch. Regulator sites block WebFetch, so every
"regulator-text" fact below was read in a search extract of the
regulator-hosted document named by its URL. Anything seen only in trade press
or in a search engine's summary, or not in the extract, is labelled **recall**.
The code records each one with the same label (`E3Basis.confidence`).

## FDA formal meetings (PDUFA products)

| Fact | Source | Label |
|---|---|---|
| FDA finalized "Formal Meetings Between the FDA and Sponsors or Applicants of PDUFA Products" in Aug 2026 (FR notice 2026-16452, 13 Aug 2026). It finalizes the 22/23 Sept 2023 revised draft. | https://www.federalregister.gov/documents/2026/08/13/2026-16452/formal-meetings-between-the-food-and-drug-administration-and-sponsors-or-applicants-of-prescription ; https://www.fda.gov/regulatory-information/search-fda-guidance-documents/formal-meetings-between-fda-and-sponsors-or-applicants-pdufa-products | regulator-text (FR and FDA guidance page, in search results) |
| There are six formal meeting types: A, B, B(EOP), C, D and INTERACT. | https://www.fda.gov/media/172311/download (2023 revised draft text) | regulator-text |
| Type B(EOP) covers End-of-Phase 2 / pre-Phase 3 meetings, and certain End-of-Phase 1 meetings (21 CFR 312 subpart E, 21 CFR 314 subpart H or similar products). Any other EOP1 meeting is a plain Type B. So since 2026-10-05 ana-ri sends EOP1 requests to `fda_formal_meeting_package`, which says this; the EOP template matches phase 2 / pre-phase 3 only. | https://www.fda.gov/media/172311/download | regulator-text |
| Scheduling goals: Type A 30 days, Type B 60, Type B(EOP) 70, Type C 75, Type D 50, INTERACT 75 days from receipt of the request. | https://www.fda.gov/media/151712/download (PDUFA VII letter, FY2023–2027) | regulator-text |
| Type B package due no later than 30 days before the meeting. Type B(EOP) package due no later than 50 days before. | https://www.fda.gov/media/172311/download | regulator-text (2023 draft text; not re-read in the final) |
| Packages go **with the request** for Type A, Type D and INTERACT. | https://www.fda.gov/media/172311/download | regulator-text (2023 draft text) |
| Type D: FDA answers the request in 14 days. A Type D meeting covers at most 2 focused topics and needs input from at most 3 disciplines or divisions. | https://www.fda.gov/media/172311/download | regulator-text (2023 draft text) |
| Type C package due 47 days before the meeting. | Search summary only | **recall** |
| A Type C meeting on a novel surrogate endpoint takes its package with the request. | Verifier's search extract, not re-read | **recall** |
| FDA answers the meeting request in 14 days for Type A and B(EOP), and in 21 days for Type B, C and INTERACT. | Search summary of FDA performance reports | **recall** |
| The final guidance allows a written-response-only reply for Type B (pre-IND), C, D and INTERACT regardless of the format requested. It says INTERACT is not appropriate once a pre-IND meeting has been held or an IND filed, and recommends about 10 questions. | raps.org / drugdiscoverytrends.com (trade press) | **recall**. Only the INTERACT eligibility line is in the code, labelled recall. |
| The Dec 2017 draft (fda.gov/media/109951) already gave Type B(EOP) as 70/50. The old 60/30 EOP2 figure was a transcription error. | Verifier | **recall** |
| Eligibility wording for Type A, B and C. | General knowledge of the guidance | **recall** |
| PDUFA VIII (FY2028+, fda.gov/media/193977) is not yet in effect and is not used. | https://fda.gov/media/193977/download | regulator-text (existence only) |

## ICH E2F DSUR

| Fact | Source | Label |
|---|---|---|
| E2F §19 is "Summary of Important Risks": a concise, cumulative, issue-by-issue summary of important identified and potential risks. Resolved risks stay in, briefly described. Narrative or tabular. | https://www.ema.europa.eu/en/documents/scientific-guideline/ich-guideline-e2f-development-safety-update-report-step-5_en.pdf ; https://database.ich.org/sites/default/files/E2F_Guideline.pdf | regulator-text |
| E2F §20 is "Conclusions": changes to previous knowledge of efficacy and safety since the last DSUR, and the actions taken or to be taken. | same | regulator-text |
| E2F §7.2 is interval line listings of serious adverse **reactions**. §7.3 is cumulative summary tabulations of serious adverse **events** since the DIBD. The RSI used for expectedness is stated. | same; ICH example DSURs on database.ich.org | regulator-text |
| E2F §1–§18 titles (Introduction … Overall Safety Assessment), as already recorded in the lifecycle entry and now in `ICH_E2F_DSUR_SECTIONS`. | same | regulator-text |
| §16 region-specific information may be given in appendices. For a US IND it covers: subjects who died (case number, assigned treatment, cause of death), subjects who dropped out in association with AEs, the general investigational plan for the coming year, and a log of outstanding business. | E2F guideline; ICH example DSUR (appendices R2, R3, R6, R7); https://www.fda.gov/downloads/drugs/guidances/ucm073109.pdf | regulator-text |
| Other US appendices (R1 cumulative SAR tabulation, R4 significant Phase 1 protocol modifications, R5 manufacturing changes). | Search extract of the ICH example DSUR (R1, R4); R5 not seen | **recall** (labelled as such in the §16 key content element) |
| E2F: "All sections should be completed; when no information is available, this should be stated." The same holds where a section is not applicable, or the sponsor has no access to the information. This is why every `ICH_E2F_DSUR_SECTIONS` entry is `required: true` (fix of 2026-10-05; §9-§11 and §14-§17 had been marked optional) and why the ana-ri instruction says "keep the heading and say so". | https://www.fda.gov/downloads/drugs/guidances/ucm073109.pdf (FDA-hosted ICH E2F, search extract, checked 2026-10-05); the reviewer read the same rule in the EMA-hosted Step 5 PDF (URL above), search extract, 2026-10-05 | regulator-text |
| DSUR is due within 60 days of the DLP (existing record, unchanged). | E2F | regulator-text (unchanged) |
