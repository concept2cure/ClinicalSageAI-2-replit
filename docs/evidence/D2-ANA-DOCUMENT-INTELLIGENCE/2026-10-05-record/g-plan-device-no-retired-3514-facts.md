# g-plan-device-no-retired-3514 — regulatory facts relied on

Checked 2026-10-05. Regulator sites are blocked for direct fetch in this
environment, so "regulator-text" below means the statement appeared in a
WebSearch extract of the named fda.gov page, on that date. Anything else is
labelled recall.

| # | Fact | Basis | Source | Checked |
|---|------|-------|--------|---------|
| 1 | With eSTAR, no separate CDRH Premarket Review Submission Cover Sheet (Form FDA 3514) is needed; the eSTAR template carries it. | regulator-text (search extract) | https://www.fda.gov/medical-devices/how-study-and-market-your-device/estar-program | 2026-10-05 |
| 2 | All 510(k) submissions, unless exempted, must be eSTAR from 2023-10-01; all 510(k) and De Novo submissions to CDRH or CBER, unless exempted, require eSTAR. | regulator-text (search extract) | https://www.fda.gov/medical-devices/how-study-and-market-your-device/estar-program | 2026-10-05 |
| 3 | De Novo eSTAR mandatory from 2025-10-01. | recall, consistent with the verified finding (FDA govdelivery / RAPS) and estar-mapper.ts | — | — |
| 4 | Form FDA 3514 is the cover sheet for PMA, HDE, De Novo, 510(k), CLIA waiver by application and some IND/BLA; its use is voluntary but recommended; an eCopy is required under FD&C Act §745A(b). | regulator-text (search extract; attribution within the result set to the CDRH cover-sheet attachment / Pre-Sub guidance) | https://www.fda.gov/media/83820/download ; https://www.fda.gov/about-fda/ecopy-program-medical-device-submissions-frequently-asked-questions | 2026-10-05 |
| 5 | HDE applications are exempt from MDUFA user fees (FD&C Act §738(a)(2)(B)(i)). | regulator-text (search extract) | https://www.fda.gov/media/85591/download ; https://www.fda.gov/medical-devices/premarket-submissions-selecting-and-preparing-correct-submission/humanitarian-device-exemption | 2026-10-05 |
| 6 | Form FDA 356h is the application form, and serves as the cover sheet, for a BLA. | regulator-text (search extract) | https://www.fda.gov/files/about%20fda/published/FDA-356h_AcroForm_Sec_07-07-2023_0.pdf ; https://www.fda.gov/media/85659/download | 2026-10-05 |
| 7 | 21 CFR 601.2 requires a BLA on the form FDA prescribes; 21 CFR 814.104 governs HDE application content. | recall | — | — |
| 8 | CLIA categorisation (and a CLIA waiver) applies only to IVDs, so a device stated not to be an IVD answers the `cliaWaived` flag "no". | recall (also the DEVICE_FLAGS label "CLIA-waived (IVD)") | — | — |

Content of the 510(k) and De Novo plan sections is not restated here: it is the
eSTAR slot registry in `server/services/pathway-engines/estar/estar-mapper.ts`
(`estarSlots`), each slot carrying its own authority.
