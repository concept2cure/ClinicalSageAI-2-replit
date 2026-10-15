# g-ich-m4-headings — facts relied on (2026-10-05)

Step: `g-ich-m4-headings` (lane ctd-gates; verified finding 33, steps 1–2;
docs/design/ANA_REGULATORY_RECORD.md "One ICH M2–M5 record", §9 K, §10, R5).

Method. The regulator hosts (fda.gov, database.ich.org, ema.europa.eu) are
refused by this environment's egress for fetches. Each fact below was matched
against **search-result extracts** of the regulator-hosted documents on
2026-10-05 (WebSearch restricted to fda.gov, database.ich.org and
ema.europa.eu). Nothing here was read in full. Wherever the extracts did not
show a heading's number and wording, the row is labelled **recall**.

## What the code labels regulator-text

`server/services/ind/ctd/ich-m4-headings.ts` uses the existing constant `M4E_R2`
(regulatory-basis.ts: ICH M4E(R2), as published by FDA,
https://www.fda.gov/media/93569/download) for these rows only. For each, the
search extract of the FDA-hosted M4E(R2) (and of the ICH-hosted
database.ich.org/sites/default/files/M4E_R2__Guideline.pdf) showed the number
with the wording used:

| Code | Heading |
|---|---|
| 2.5.7 | Literature References |
| 2.7.2.4 | Special Studies |
| 2.7.3.4 | Analysis of Clinical Information Relevant to Dosing Recommendations |
| 2.7.3.5 | Persistence of Efficacy and/or Tolerance Effects |
| 2.7.4.1 | Exposure to the Drug |
| 2.7.4.3 | Clinical Laboratory Evaluations |
| 2.7.4.5 | Safety in Special Groups and Situations |
| 2.7.4.6 | Post-marketing Data |
| 5.3.1.1 | Bioavailability (BA) Study Reports |
| 5.3.1.2 | Comparative BA and Bioequivalence (BE) Study Reports |
| 5.3.1.3 | In Vitro–In Vivo Correlation Study Reports |
| 5.3.2.1 | Plasma Protein Binding Study Reports |
| 5.3.2.2 | Reports of Hepatic Metabolism and Drug Interaction Studies |
| 5.3.3.1 | Healthy Subject PK and Initial Tolerability Study Reports |
| 5.3.3.3 | Intrinsic Factor PK Study Reports |
| 5.3.3.5 | Population PK Study Reports |
| 5.3.4.2 | Patient PD and PK/PD Study Reports |

## Labelled recall, though a search extract matched the wording

These rows are `recall` because `regulatory-basis.ts` (append-only, outside this
step's files) does not yet declare an M4S or M4 constant, and a file in
`ind/ctd` may not declare its own (basis-constants-one-home.test.ts). Each
carries the note *"wording matched against a search extract of the FDA-hosted
copy on 2026-10-05; regulator-text once its constant is declared"*.

- **ICH M4S(R2)**, FDA-hosted at https://www.fda.gov/media/71628/download (ICH:
  database.ich.org/sites/default/files/M4S_R2_Guideline.pdf).
  - The extracts showed:
    - 4.2.3.4.1 Long-term studies;
    - 4.2.3.5.4 Studies in which the offspring (juvenile animals) are dosed and/or further evaluated;
    - 4.2.3.7.1 Antigenicity;
    - 2.6.2.1 Brief Summary;
    - 2.6.4.2 Methods of Analysis;
    - 2.6.6.2 Single-Dose Toxicity;
    - 2.6.6.10 Tables and Figures.
  - The other M4S rows (2.6.2.x, 2.6.4.x, 2.6.6.x, 4.2.1–4.2.3, 4.2.3.3.x,
    4.2.3.4.x, 4.2.3.5.x, 4.2.3.7.x) are recall, filled in by the same
    numbering pattern.
- **ICH M4(R4), Organisation of the CTD**. The FDA-hosted M4 organisation
  guidance (https://www.fda.gov/files/drugs/published/M4-Organization-of-the-Common-Technical-Document-for-the-Registration-of-Pharmaceuticals-for-Human-Use-Guidance-for-Industry.pdf;
  ICH: database.ich.org/sites/default/files/M4_R4__Guideline.pdf).
  - The extracts showed:
    - a 2.1 CTD Table of Contents in Module 2;
    - Module 3 containing 3.1 Table of Contents of Module 3, 3.2 Body of Data and 3.3 Literature References;
    - Module 4 containing 4.1 Table of Contents of Module 4, 4.2 Study Reports and 4.3 Literature References.
  - Rows 2, 2.1, 2.6, 2.7, 3, 3.1, 3.2, 3.3, 4, 4.1, 4.2 and 5 are labelled recall.
  - The 2.1 wording "Common Technical Document Table of Contents (Modules 2–5)" is recall.

## Recall only (not matched by any extract)

- **ICH M4E(R2)** rows other than those in the first table: 2.7.1.x, 2.7.2.1–3
  and 2.7.2.5, 2.7.3.1–3 (with 2.7.3.3.1–3), 2.7.3.6, 2.7.4.1.1–3, 2.7.4.2 and its
  subdivisions, 2.7.4.4, 2.7.4.5.1–8, 2.7.4.7, 5.3, 5.3.1.4, 5.3.2.3, 5.3.3.2,
  5.3.3.4, 5.3.4.1 and 5.3.5.
- **ICH M4Q(R1)**: 3.2.S Drug Substance and 3.2.P Drug Product. These are skeleton
  only. Module 3 content and deeper headings belong to the CMC lane.

## The defect this record makes detectable

- `server/services/templates/ectd-fallback-templates.ts:1037/1046` ships
  `Module_4_3_1_Single_Dose_Toxicity` / "MODULE 4.3.1 - SINGLE DOSE TOXICITY".
- Per the M4S extracts above (recall for the "undivided" reading):
  - 4.3 is Literature References, with no numbered subdivision;
  - single-dose toxicity is 4.2.3.1, which `CTD_AUTHORING_GUIDANCE` already holds.
- `isIchHeading('4.3.1')` is now false.
- Correcting that template is a separate step: it is a registry fix owned by
  the consistency gate (finding 33, steps 3–5) and is not made here.

## Not modelled, stated

- The tabulated nonclinical summaries (2.6.3, 2.6.5, 2.6.7) are numbered in M4S
  by table, e.g. "2.6.7.1 Toxicology: Overview" (recall). Those table numbers
  are not rows, so `isIchHeading('2.6.7.1')` is false.
- The 2.3 QOS subdivisions (2.3.S.x, 2.3.P.x) mirror Module 3 and are left to
  the CMC lane.
- `ectdElement` (the ICH eCTD v3.2.2 DTD element names) waits for the DTD to be
  vendored (finding 37).
