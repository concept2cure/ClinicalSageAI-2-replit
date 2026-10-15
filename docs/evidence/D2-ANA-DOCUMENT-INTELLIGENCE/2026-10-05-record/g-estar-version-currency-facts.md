# g-estar-version-currency — regulatory facts relied on

Checked 2026-10-05. fda.gov is egress-blocked from this environment (WebFetch
returns EGRESS_BLOCKED), so nothing below from fda.gov is a verbatim read. A
search extract of a regulator-hosted page is recorded as **recall (search
extract)**, never as regulator text. That is why every `ESTAR_VERSIONS` row is
`confidence: 'recall'`.

| # | Fact | Basis | Source | Checked |
|---|---|---|---|---|
| 1 | FDA's current eSTARs are nIVD eSTAR Version 7.1, IVD eSTAR Version 7.1 and Early Submission Requests eSTAR (PreSTAR) Version 3.1. nIVD/IVD cover 510(k), De Novo and PMA; PreSTAR covers Q-Submissions, IDEs and 513(g). | recall (fda.gov-restricted search extract of the page; not a verbatim read) | https://www.fda.gov/medical-devices/how-study-and-market-your-device/estar-program | 2026-10-05 |
| 2 | The retirement date for nIVD/IVD 7.0 and PreSTAR 3.0 was **not found**. The table records `retirementDate: null`, and the lifecycle is `retiring-date-unverified`. No date was invented. | absence in the search extract | same page | 2026-10-05 |
| 3 | 6.2 / 2.2 retirement date 2026-08-03. This is carried forward from the repository's existing table and was not re-checked. Whether FDA still lists these versions was not re-checked either. | recall (repository transcription, first recorded 2026-09-06) | same page | not re-checked |
| 4 | OMB numbers for 7.1 / 3.1 are carried forward from 7.0 / 3.0 and were not re-read. | recall | same page | not re-checked |
| 5 | As of 2026-06-01, the nIVD and IVD eSTARs include the content of the Human Factors Content Guidance, which was published 2026-05-29 and is effective 2026-08-01. | recall (fda.gov search extract) | same page | 2026-10-05 |
| 6 | Final guidance "Content of Human Factors Information in Medical Device Marketing Submissions". Federal Register document 2026-10734, 91 FR 32061, published 2026-05-29. It has a 60-day transition, and implementation begins 2026-08-01. | recall (search extract of the Federal Register page) | https://www.federalregister.gov/documents/2026/05/29/2026-10734/content-of-human-factors-information-in-medical-device-marketing-submissions-guidance-for-industry | 2026-10-05 |
| 7 | The vendored templates are "Version 7.0 (2026-06-01)", in both `eSTAR-510k-non-ivd.pdf` and `eSTAR-510k-ivd.pdf`. | **regulator text**: the FDA-issued template bytes, read from the XFA `template` packet with `listXfaPackets` (server/services/forms/fill-official-pdf.ts) | assets/estar-templates/ (checksum-pinned) | 2026-10-05 |
| 8 | The vendored 7.0 template cites the FDA Guidance "Content of Human Factors Information in Medical Device Marketing Submissions". It asks for HF Submission Category 1, 2 or 3, with a "Guide Me" branch of up to three questions. Category 1 "corresponds with Section 1 of the HFE/UE report", Category 2 with "Sections 1 - 4", and Category 3 with "Sections 1 - 8". Appendices A/B/C of the guidance give samples per category. | **regulator text**: the XFA template packet of both vendored PDFs (quoted strings above) | assets/estar-templates/ | 2026-10-05 |

## What the code does with them

- Facts 1–4 are recorded in `server/services/pathway-engines/estar/estar-versions.ts`. Each row carries `lastVerified`, `sourceUrl` and `confidence: 'recall'`, and the superseded rows carry a `note` stating what is not known.
- Facts 6 and 8 are in the human-factors slot authority in `estar-mapper.ts`. The category is the sponsor's answer in the eSTAR; no engine decides it.
- Fact 7 is the `version: '7.0'` on the manifest descriptors. It is compared against fact 1 by `templateVersionCurrency`, and the mismatch blocks `canFileNow`.

## Owed (ops / founder)

- A verbatim read of the eSTAR Program page. It must confirm the 7.1 / 3.1 rows and the 7.0 / 3.0 retirement date, and whether 6.2 / 2.2 are still listed. Only after that read may rows move to `regulator-text`.
- Re-vendoring the 7.1 nIVD and IVD PDFs: `checksums.txt`, the manifest `version`s and a re-enumeration of `estar-field-map.ts`. What changed from 7.0 to 7.1 has not been read. Until this is done, every device filing-readiness verdict carries the version blocker.
