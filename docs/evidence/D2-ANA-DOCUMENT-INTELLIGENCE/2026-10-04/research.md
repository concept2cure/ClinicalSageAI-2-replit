# Research record — the regulatory facts this lane relies on (2026-10-04)

Every fact the code states as a regulator's requirement is listed here, with
the source it was checked against, how it was checked, and what remains to
check.

## How the checking was done, and its limits

- **Primary documents could not be opened from this environment.**
  - `curl` to `fda.gov`, `database.ich.org`, `ecfr.gov` and `cdisc.org` got
    `CONNECT tunnel failed, response 403`.
  - `WebFetch` to `database.ich.org` and `www.fda.gov` returned
    `EGRESS_BLOCKED`.
  - The Lawstronaut regulatory-text connector answered "needs you to sign in
    again". The 2026-09-22 record (`docs/evidence/REGULATORY-SME/`) found the
    same.
- **Web search was available.** Each fact below rests on search results that
  quote a regulator-hosted copy: `fda.gov`, `ema.europa.eu`, `tga.gov.au`,
  `hhs.gov` or `ecfr.gov`. The 2026-09-22 record set the rule that a result
  from the regulator's own domain counts as primary. These rows are
  `regulator-text` in code (`server/services/ind/ctd/csr-e3-basis.ts`).
- **What a search result is.** It is the search engine's extract of the page,
  not the page itself. Where a passage is quoted below it is the extract's
  wording. Before anything is quoted to a client as verbatim, it should be
  re-read in the PDF.
- **Everything else in the E3 overlay is labelled `recall`.** That covers
  ICH E3's headings and what belongs under each, as known to the author. E3
  is a 1995 Step 4 text whose numbering has not changed. `recall` is a weaker
  claim than `regulator-text`, and the overlay says so on every heading.

## Facts relied on

| # | Fact | Source (regulator-hosted) | Used in |
|---|---|---|---|
| E1 | FDA launched Elsa, an agency-wide generative AI tool, on 2025-06-02. It runs in GovCloud, and its models do not train on data submitted by industry. | [FDA press release](https://www.fda.gov/news-events/press-announcements/fda-launches-agency-wide-ai-tool-optimize-performance-american-people) | rules registry (Elsa note) |
| E2 | Elsa is used to summarise adverse events for safety profile assessments, to compare labels faster, and to generate code. | same | rules registry |
| E3 | FDA reviewers used Elsa to filter abstracts, find pertinent articles and summarise findings, and "subsequently reviewed and verified all ELSA output". | [fda.gov/media/189421](https://fda.gov/media/189421/download) | rules registry |
| E4 | December 2025: agentic AI was deployed to all FDA staff, for uses that include pre-market review and review validation. More than 70% of staff had used Elsa voluntarily. | [FDA press release](https://www.fda.gov/news-events/press-announcements/fda-expands-artificial-intelligence-capabilities-agentic-ai-deployment) | rules registry |
| E5 | Study-data technical rejection criteria. **1734**: a Trial Summary (TS) dataset for each study in eCTD 4.2 and 5.3, carrying the study start date. **1736**: DM, ADSL and define.xml present. | [TRC](https://www.fda.gov/files/drugs/published/Technical-Rejection-Criteria-for-Study-Data.pdf); [self-check worksheet](https://www.fda.gov/media/135247/download) | E3 §9, §16.4; rules registry |
| E6 | FDA PDF specifications. PDF 1.4–1.7, PDF/A-1 and PDF/A-2 are acceptable. Non-standard fonts are fully embedded with all characters. A document of 5 or more pages has a hyperlinked table of contents and bookmarks, with the bookmark hierarchy identical to the table of contents to four levels. No security or password. | [fda.gov/media/76797](https://www.fda.gov/media/76797/download) | E3 §3; rules registry |
| E7 | M4E(R2): the Clinical Overview is about 30 pages; the Clinical Summary is usually 50–400 pages, excluding attached tables. | [fda.gov/media/93569](https://www.fda.gov/media/93569/download) | rules registry |
| E8 | FDA hosts ICH E3. E3 §12.2.2 calls for a summary table of the relatively common adverse events. The adverse event listings are at 14.3.1 and 16.2.7. | [fda.gov/media/84857](https://www.fda.gov/media/84857/download) | E3 §12.2.2, §14.3.1 |
| E9 | 21 CFR 314.101(d)(3) allows refuse-to-file when an NDA is incomplete on its face against 505(b) / 314.50. FDA has 60 days to file the application or refuse it. | [eCFR 314.101](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-314/subpart-D/section-314.101); [FDA RTF guidance](https://www.fda.gov/files/drugs/published/Refuse-to-File--NDA-and-BLA-Submissions-to-CDER-Guidance-for-Industry.pdf) | sequence model |
| E10 | The ISE and ISS belong in 5.3.5.3. A narrative portion suitable for 2.7.3 / 2.7.4 is placed once there and referenced from 5.3.5.3. They are integrated analyses, not summaries. The ISE satisfies 314.50(d)(5)(v). | [FDA placement page](https://www.fda.gov/drugs/electronic-regulatory-submission-and-review/placement-integrated-summaries-safety-and-effectiveness-issise-applications-submitted-ectd-format); [ISE guidance](https://www.fda.gov/media/72335/download) | CTD 2.7.3 / 2.7.4 fix; sequence model |
| E11 | Study Data TCG. Reviewer guides go with the study data (cSDRG in M5, nSDRG in M4), and an ADRG is recommended. define.xml carries complete metadata. All datasets are SAS XPORT v5, one dataset per file and named the same as the file. A dataset over 5 GB is split. | [fda.gov/media/88173](https://www.fda.gov/media/88173/download) | rules registry; sequence model |
| E12 | ICH E3 Q&A (R1), June 2012: E3 is "a Guideline, not a set of rigid requirements or a template"; flexibility is inherent in its use. The Q&A lists the minimum appendices. | [EMA copy](https://www.ema.europa.eu/en/documents/scientific-guideline/international-conference-harmonisation-technical-requirements-registration-pharmaceuticals-human-use-ich-guideline-e3-questions-and-answers-r1_en.pdf); [TGA copy](https://www.tga.gov.au/sites/default/files/2024-08/ich_guideline_e3_-_questions_and_answers_r1.pdf) | medical-writing fix; E3 overlay §16 |
| E13 | eCTD TCG. Hyperlinks are relative. Granularity follows the ICH M4 granularity annex. File and folder names are lower case and use only letters, numbers, hyphens and underscores. A full path is at most 150 characters. | [fda.gov/media/93818](https://www.fda.gov/media/93818/download) | rules registry |
| E15 | E3 §16.1.9 holds the detailed documentation of the statistical methods. | [fda.gov/media/84857](https://www.fda.gov/media/84857/download) | E3 §16.1.9 |
| E16 | E3: every AE for each patient, including the same event more than once, is listed in 16.2.7 with both the preferred term and the investigator's original term. | same | E3 §12.2.4, §16.2.7 |
| E17 | E3 §14.3.4 is the Abnormal Laboratory Value Listing (each patient). | same | E3 §14.3.4 |
| E18 | The protocol (16.1.1), the statistical methods (16.1.9), the investigator and site list, and the sample CRFs belong in the report even when they are also in a TMF. | E3 Q&A (R1), EMA / HHS copies | E3 report notes |
| E19 | Study Data TCG: an important part of review is "traceability of the sponsor's results back to the CRF data". | [fda.gov/media/136460](https://www.fda.gov/media/136460/download) | E3 §14; sequence model |
| E20 | Type A meetings are for an otherwise stalled program or an important safety issue. Pre-IND and pre-NDA / pre-BLA meetings are Type B. Pre-NDA / BLA meetings are held generally not less than 2 months before submission. | [fda.gov/media/109951](https://www.fda.gov/media/109951/download); [fda.gov/media/72253](https://www.fda.gov/media/72253/download) | usNDA / usBLA blueprint fix |
| E21 | FDA ISE guidance: 2.7.3 provides "data summaries, not a complete exposition". | [fda.gov/media/72335](https://www.fda.gov/media/72335/download) | CTD 2.7.3 fix |
| E22 | 21 CFR 314.50(f)(2): the CRFs of each patient who died, or did not complete because of an adverse event (drug-related or not, including reference drug and placebo), unless FDA waives them. 314.50(f)(1): case report tabulations. | [eCFR 314 subpart B](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-314/subpart-B) | E3 §16.3.1, §16.4 |
| E23 | E3: copies of important publications are attached in 16.1.11 and 16.1.12. | [fda.gov/media/84857](https://www.fda.gov/media/84857/download) | E3 §15 |
| E24 | FDA PDF specifications: submit PDFs in a text-searchable format and avoid image-based PDFs whenever possible. A scanned document is made text searchable, and the OCR output is checked for complete and accurate conversion. | [fda.gov/media/76797](https://www.fda.gov/media/76797/download); [fda.gov/media/85816](https://www.fda.gov/media/85816/download) | rules registry (`pdf-text`) |

E14 is not a row. FDA's Comprehensive Table of Contents Headings and Hierarchy
(v2.3.3, [fda.gov/media/76444](https://www.fda.gov/media/76444/download)) was
located, but nothing in code rests on it. The US Module 1 numbering pins
(`tests/regulatory/fda-module1-numbering.test.ts`) should be re-read against it
once it can be opened.

## Owed

- Re-read E5, E6, E8, E11–E13, E15–E17 and E21–E24 in the PDFs themselves,
  and record the verbatim clause with its page. The same is owed for every
  `recall` heading in the E3 overlay. Any one of these makes it possible:
  - re-authorise the Lawstronaut connector;
  - allow `www.fda.gov`, `database.ich.org` and `www.ecfr.gov` in this
    environment's network policy.
- ICH E6(R3) and M4Q(R2) clause numbers are not cited in code. They were not
  verified.
