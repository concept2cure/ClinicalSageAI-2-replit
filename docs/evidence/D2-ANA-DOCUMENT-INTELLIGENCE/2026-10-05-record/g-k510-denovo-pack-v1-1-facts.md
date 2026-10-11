# g-k510-denovo-pack-v1-1 — facts relied on

Step: the 510(k) and De Novo outline packs carry the MDUFA user fee (Form FDA 3601), and the 510(k) pack carries the risk-management section (finding 57's deferred Rule 1 item; critic gap G3).

| # | Fact | Basis | Source | Checked |
|---|---|---|---|---|
| 1 | Form FDA 3601 is the Medical Device User Fee Cover Sheet. 510(k) (Traditional, Special, Abbreviated) and De Novo submissions are subject to user fees and go with a completed 3601. | regulator text (fda.gov search extracts; the page itself was not opened because WebFetch to fda.gov is blocked) | https://www.fda.gov/industry/medical-device-user-fee-amendments-mdufa-fees/mdufa-cover-sheets ; https://www.fda.gov/medical-devices/premarket-submissions-selecting-and-preparing-correct-submission/medical-device-user-fees ; De Novo fee guidance https://www.fda.gov/media/107658/download | 2026-10-05 |
| 2 | FDA's eSTAR v7.0 templates (vendored at `assets/estar-templates/eSTAR-510k-non-ivd.pdf` and `eSTAR-510k-ivd.pdf`) declare an "Administrative Documentation \| User Fee Form" attachment (`ADAddAttachment910`), routed to CH1.04/CH1.09. In the FDA branch its text reads "Please attach your User Fee form here. Please be sure to submit your user fee payment at least three (3) business days before submitting…". | regulator artifact, read directly (`listEstarAttachmentSlots` plus the template XFA script) | vendored templates (checksums in assets/estar-templates/checksums.txt) | 2026-10-05 |
| 3 | The same templates route "Benefits, Risks, and Mitigation Measures" attachments (Design Control Activities, Signed Statement for V&V, Risk Mitigation Table, Benefit Risk Discussion, Alternative Practices) to CH2.08. The template script shows the `RiskManagement` subform for a **Special** 510(k), with DesignControl and V&V visible. It shows it for De Novo and PMA. It sets `RiskManagement.presence = "hidden"` for a **Traditional** and an **Abbreviated** 510(k). | regulator artifact, read directly (nIVD template script) | vendored nIVD template | 2026-10-05 |
| 4 | A Special 510(k) relies on risk management and design-control activities. Its Design Control Activities Summary identifies the risk-analysis methods used to assess the change. | regulator text (fda.gov search extracts) | https://www.fda.gov/media/116418/download (The Special 510(k) Program guidance); https://www.fda.gov/medical-devices/premarket-notification-510k/how-prepare-special-510k | 2026-10-05 |
| 5 | Some user-fee exemptions exist, for example certain small-business or pediatric-only waivers. | recall, not regulator text; nothing here depends on it | — | — |

## What follows from these facts

- **User fee.** It is a mandatory node in both v1.1 packs: 510(k) A9 and De Novo A7 (facts 1 and 2). The exemptions (fact 5) are recall and are not modelled. Taking an exemption is the filer's answer in the eSTAR.
- **510(k) risk management.** D6 is `mandatory: false` (fact 3). FDA's template does not ask a Traditional or Abbreviated 510(k) for that section. **This disagrees with `estar-mapper.ts`**, which makes `risk-management` an `always` slot for every 510(k). That correction belongs to the mapper (see needs_elsewhere). The outline does not demand the section of every filer to hide the disagreement.
- **De Novo.** v1.0 already had `F Risk management summary`, so no risk node was added.
- **Labels avoid the phrase "cover sheet".** The mapper's cover-letter slot matches it as a substring. Mutation 3 in the green evidence shows that phrase marking the cover letter present as well.

## Measured, not inferred

- `estar-mapper-matches-shipped-outlines.contract.test.ts` checks fully authored packs:
  - v1.0: k510 `[risk-management, user-fee-cover-sheet]` and De Novo `[user-fee-cover-sheet]`, unchanged.
  - v1.1: `[]` for both.
- Node-to-slot additions: k510 A9 → `user-fee-cover-sheet`, D6 → `risk-management`; De Novo A7 → `user-fee-cover-sheet`. No other node changed slot.
