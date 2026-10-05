# Search log, fix pass (2026-09-28)

**These are index results, not source text.** Every value below comes from the WebSearch index: titles, URLs and a model-written summary. No issuer page was read, because every issuer host was refused (`red/egress-recheck.txt`). The manifest records these values only in `*Candidate(s)` fields, as provisional versions, or in `verification` text. None of them is in `sourceUrl`, `date` or `sha256`.

A summary may repeat back a date that was typed into the query. **Echo risk** below marks each case where the query itself contained the value.

| Objection | Query | What the index returned | Used as |
|---|---|---|---|
| [6] | `FDA guidance "Multiple Endpoints in Clinical Trials" final October 2022 family-wise error rate` | fda.gov/media/162416/download; FR 2022-10-21 (2022-22882); a 2017 draft of the same title, which is a separate file | new `supporting` entry FDA-GUID-MULTIPLE-ENDPOINTS@final-2022-10 |
| [6] | `ICH E9 guideline text "multiple primary variables" … "family-wise"` | E9 §5.6 covers multiplicity. The summary could not confirm that E9 uses "family-wise". | `openChecks` on stats-primary-endpoint-multiplicity |
| [9] | `ICH E9 Statistical Principles … Step 4 5 February 1998 E9(R1) Step 4 20 November 2019` | E9 Step 4: February 1998. E9(R1): November 2019. | month-level support |
| [9] | `ICH E9 Statistical Principles for Clinical Trials E9_Guideline.pdf database.ich.org` | The E9_Guideline.pdf URL, titled "GUIDELINE FOR GOOD CLINICAL PRACTICE". No date. | unchanged |
| [9] | `"E9" "Statistical Principles for Clinical Trials" ICH "5 February 1998"` | "endorsed … on February 5, 1998" (FR 1998-09-16 notice) | ICH-E9 dateCandidate 1998-02-05, **echo risk** |
| [9] | `ICH E9(R1) addendum estimands adopted Step 4 "20 November 2019"` | "adopted … on 20 November 2019" (ECA news page) | ICH-E9-R1 dateCandidate 2019-11-20, **echo risk** |
| [9] | `ICH E2A Clinical Safety Data Management … Step 4 date` | Step 4 dated 27 October 1994 | ICH-E2A dateCandidate (no date in query) |
| [9] | `ICH E6(R2) integrated addendum good clinical practice Step 4 adopted date` | Step 4 on 9 November 2016 | ICH-E6-R2 dateCandidate (no date in query) |
| [9] | `ICH Q7 … Step 4 date November 2000` | Step 4 dated 10 November 2000; two file names | ICH-Q7 dateCandidate (the query named the month only) |
| [9] | `ICH M4(R4) Organisation of the Common Technical Document Step 4 date` | Step 4 in June 2016 | ICH-M4-R4 dateCandidate 2016-06 |
| [8] | `EUR-Lex Regulation (EC) No 1901/2006 consolidated version 02006R1901` | eur-lex.europa.eu/eli/reg/2006/1901, titled 02006R1901-20190128. Current consolidated version 28/01/2019. OJ L 378, 27.12.2006. | EU-REG-1901-2006@CONS-2019-01-28 |
| [8] | `EUR-Lex 02017R0745 consolidated version …` | Consolidated versions 2017-05-05, 2020-04-24, 2023-03-11, 2023-03-20, 2025-01-10 and 2026-01-01; 2026-01-01 called the most recent. Consolidated texts are "documentation tools and have no legal effect". | EU-REG-2017-745@CONS-2026-01-01 |
| [8] | `Regulation (EU) No 216/2013 electronic publication Official Journal authentic from 1 July 2013` | The electronic OJ has been authentic since 1 July 2013 (OJ L 69, 13.3.2013) | versionScheme.EU-OJ wording |
| [4][10] | `govinfo CFR 2026 title 21 volume 5 part 312 "4-1-26 Edition"` | No 2026 Title 21 edition found; the index says it "may not yet be publicly available". The 4-1-25 edition was found. | versionCandidates 2025-04-01 / 2026-04-01; version kept provisional |
| [4] | `govinfo USCODE-2024 title42 section 262 regulation of biological products` | USCODE-2024-title42 … sec262.htm | US-USC-42-262 re-pinned USCODE-2023 → USCODE-2024, the same edition as 21 USC 355 |
| [3] | `"42 U.S.C. 262" source credit "title III, §351, 58 Stat. 702"` | Source credit: July 1, 1944, ch. 373, title III, §351, 58 Stat. 702 | `openChecks` on fda-bla-vs-nda |
| [3] | `FDA "Deemed to be a License" Provision … "section 351" "section 505"` | fda.gov/media/119274. The summary says it names section 505 FD&C and section 351 PHS Act. Final guidance per FR 2020-03-05. | verification text of the supporting entry; `openChecks` |
| [12] | `EMA paediatric investigation plan procedural advice when to submit PIP questions and answers` | EMA PIP Q&A page; applications-and-procedures page | noted in the EMA entry |
| [12] | `EMA "Procedural advice on paediatric applications" EMA/672643/2017 PIP submission timing` | ema.europa.eu …procedural-advice-paediatric-applications_en.pdf. The summary gives: not later than upon completion of adult human PK; "during or even before initial PK studies"; Rev. 12, 15 April 2025. | new `supporting` entry EMA-PROC-ADVICE-PAEDIATRIC-APPLICATIONS@UNPINNED |
| [12] | `EMA procedural advice on paediatric applications revision latest version date EMA/672643/2017` | "Rev. 12, dated 15 April 2025", and separately "references to Rev. 15". The two contradict each other. | the reason the version is `UNPINNED` |

Fetch attempts in this pass: WebFetch `https://www.fda.gov/media/162416/download` returned `EGRESS_BLOCKED`. The curl probe results are in `red/egress-recheck.txt`. The Lawstronaut MCP still requires re-authentication and was not used.
