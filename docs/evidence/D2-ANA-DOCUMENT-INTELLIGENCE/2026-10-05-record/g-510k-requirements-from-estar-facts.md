# g-510k-requirements-from-estar: regulatory facts relied on

Checked on 2026-10-05. Regulator hosts are blocked for WebFetch in this
environment. "Regulator text" below means the wording that `WebSearch`, limited
to `fda.gov`, returned for the page at that URL. Nobody opened and read the page
itself.

| # | Fact | Basis | Source / checked |
|---|---|---|---|
| 1 | Since 2023-10-01, every 510(k) must be submitted as an electronic submission using eSTAR, unless exempted. | Regulator text (search snippet) | https://www.fda.gov/medical-devices/how-study-and-market-your-device/estar-program, checked 2026-10-05 |
| 2 | Since 2025-10-01, every De Novo must be submitted as an electronic submission using eSTAR, unless exempted. | Regulator text (search snippet) | https://www.fda.gov/medical-devices/how-study-and-market-your-device/estar-program, checked 2026-10-05 |
| 3 | 510(k) and De Novo submissions must be submitted through the CDRH Portal. This is the basis for the form name `eSTAR (submitted via CDRH Portal)`. | Regulator text (search snippet) | https://www.fda.gov/medical-devices/industry-medical-devices/send-and-track-medical-device-premarket-submissions-online-cdrh-portal, checked 2026-10-05 |
| 4 | Form FDA 3601 is the Medical Device User Fee cover sheet. A 510(k) (Traditional, Special or Abbreviated) requires one. Completing it issues a payment identification number beginning "MD". | Regulator text (search snippet) | https://www.fda.gov/medical-devices/premarket-submissions-selecting-and-preparing-correct-submission/medical-device-user-fees, checked 2026-10-05 |
| 5 | A De Novo request also carries a MDUFA user fee, and therefore a 3601. | Recall | The search did not return regulator text naming De Novo specifically. The mapper's `user-fee-cover-sheet` slot is in `baseSlots`, so it applies to De Novo. That is unchanged by this step. |
| 6 | The 3601 is completed in the FDA user-fee system and is not a section of the eSTAR PDF. The eSTAR cites the payment identification number. This is why 3601 is listed both as a required form and as the user-fee row, and why the form satisfies the row. | Recall (the user-fee system issues the number: fact 4) | none |
| 7 | eSTAR carries the Indications for Use (FDA 3881) content, so the 3881 is met through the IFU row and is not listed as a separate form. | Secondary source (Freyr), as recorded in the verifier's report for finding 70 | Not regulator text |
| 8 | 21 CFR 807.92 (510(k) summary) and 807.93 (510(k) statement) are alternatives. One or the other is mandatory. | Recall. This is the authority string already on the mapper's `510k-summary-or-statement` slot. | eCFR not read in this step |
| 9 | Every other row's necessity and authority: labeling 807.87(e), T&A 807.87(k), biocompatibility ISO 10993-1 always-required, the seven flag-conditional slots, and the when-applicable slots. | Not restated here | Read from `server/services/pathway-engines/estar/estar-mapper.ts` through `estarSlots()`. This step changes no slot and no necessity. Each slot's basis is the mapper's own authority string. |

## What this step does not decide

- **Biocompatibility.** It stays `always`, because of the mapper's documented
  rationale: patient contact is not an intake flag. A patient-contact flag
  would be an intake change and a question for an SME.
- **IVD De Novo.** It still falls to the nIVD De Novo slot set. That is the
  mapper's existing scope note.
