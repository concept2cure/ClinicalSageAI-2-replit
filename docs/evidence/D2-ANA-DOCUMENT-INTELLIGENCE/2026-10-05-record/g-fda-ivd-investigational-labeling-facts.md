# g-fda-ivd-investigational-labeling — regulatory facts relied on (2026-10-05)

ecfr.gov, govinfo.gov, fda.gov and law.cornell.edu are blocked by this
environment's egress policy, so no regulation page was opened. "Regulator text
(search)" below means the wording was read on 2026-10-05 in web-search results
(WebSearch restricted to `ecfr.gov`) that quote the eCFR page at the URL, not
in the page itself. In code each such element carries
`basisDetail: { confidence: 'regulator-text', url, checked: '2026-10-05', note: 'eCFR wording via search results; verbatim re-read owed' }`.
Nothing below is recall. An element whose wording could not be matched is not
encoded at all.

URLs:
- 809.10: https://www.ecfr.gov/current/title-21/chapter-I/subchapter-H/part-809/subpart-B/section-809.10
- 812.5: https://www.ecfr.gov/current/title-21/chapter-I/subchapter-H/part-812/subpart-A/section-812.5
- 812.2: https://www.ecfr.gov/current/title-21/chapter-I/subchapter-H/part-812/subpart-A/section-812.2

| # | Fact | Basis | Where used (`server/services/market-specs/device-labeling.ts`) |
|---|---|---|---|
| F1 | 809.10(a): the label states the information below "except where such information is not applicable". The list: proprietary name and established (common or usual) name; intended use(s); for a reagent, the established name and quantity, proportion or concentration of each reactive ingredient (for biological material, source and measure of activity); a statement of warnings or precautions for users per 16 CFR part 1500 (identified in the search result as (a)(4)); "For In Vitro Diagnostic Use" and any other limiting statement appropriate to the intended use; for a reagent, storage instructions adequate to protect stability (temperature, light, humidity; also for the reconstituted or mixed product); for a reagent, an expiration date based on the stated storage instructions; for a reagent, net quantity of contents; name and place of business of the manufacturer, packer or distributor; a lot or control number, identified as such, from which the complete manufacturing history can be determined. | Regulator text (search), 809.10 URL | `FDA_IVD_LABEL_ELEMENTS` (10 rows). Paragraph numbers inside (a) are not encoded except as `809.10(a)`: only (a)(4) was seen numbered. |
| F2 | 809.10(b), the package insert, in order: (1) proprietary and established name; (2) intended use(s) and type of procedure; (3) summary and explanation of the test; (4) principles of the procedure; (5) reagents; (6) instruments; (7) specimen collection and preparation; (8) procedure, with quality control under (8)(vi); (9) results; (10) limitation of the procedure; (11) expected values; (12) specific performance characteristics; (13) bibliography; (14) name and place of business of manufacturer, packer or distributor; (15) date of issuance of the last revision of the labeling, identified as such. | Regulator text (search), 809.10 URL. (1), (2), (4)–(12) were confirmed by the verifier; (3), (13), (14), (15) were confirmed by this implementer on 2026-10-05. | `FDA_IVD_INSERT_ITEMS` (16 rows). The plan asked for (3) and (13)+ as recall "until read"; they were read in search results, so they are regulator text (search) like the rest. |
| F3 | 809.10(c)(2)(i): "For Research Use Only. Not for use in diagnostic procedures." (c)(2)(ii): "For Investigational Use Only. The performance characteristics of this product have not been established." Both prominently placed on all labeling. | Regulator text (search), 809.10 URL | `RUO_STATEMENT`, `IUO_STATEMENT`, `FDA_RUO_STATEMENT`, `FDA_IUO_STATEMENT` |
| F4 | 809.10(c)(1): a shipment of an IVD is exempt from 809.10(a) and (b) (and any part 861 standard) when it is for an investigation subject to part 812 and part 812 is complied with. | Regulator text (search), 809.10 URL | The 809.10(c) note in `fdaIvdNotes`; (a)/(b) are not listed for an investigational IVD. |
| F5 | 812.5(a): an investigational device or its immediate package bears a label with the name and place of business of the manufacturer, packer or distributor, the quantity of contents if appropriate, and "CAUTION—Investigational device. Limited by Federal (or United States) law to investigational use." The label or other labeling describes all relevant contraindications, hazards, adverse effects, interfering substances or devices, warnings and precautions. | Regulator text (search), 812.5 URL | `INVESTIGATIONAL_CAUTION_STATEMENT`, `FDA_INVESTIGATIONAL_ELEMENTS` rows `inv_caution_statement`, `inv_name_place`, `inv_quantity`, `inv_hazards` |
| F6 | 812.5(b) Prohibitions: labeling shall not bear any false or misleading statement and shall not represent the device as safe or effective for the purposes under investigation. 812.5(c) is animal research ("CAUTION—Device for investigational use in laboratory animals…"), not encoded. | Regulator text (search), 812.5 URL | `inv_no_safety_claims` (prohibition; `checkAuthoredLabeling` reports it not_checkable). The verifier's note placing contraindications in (b) and the prohibition in (c) was wrong; the search result quotes the paragraph headings "(b) Prohibitions" and "(c) Animal research". |
| F7 | 812.2(c)(3): a diagnostic device is exempt from part 812 if the sponsor complies with 809.10(c) and the testing (i) is noninvasive, (ii) does not require an invasive sampling procedure that presents significant risk, (iii) does not by design or intention introduce energy into a subject, and (iv) is not used as a diagnostic procedure without confirmation by another, medically established diagnostic product or procedure. | Regulator text (search), 812.2 URL | `ivdStudyExemptUnder8122c3`; only `true` drops the 812.5 elements; `IVD_EXEMPTION_BASIS` in the result notes. |

## Interpretation the code makes (product decision of the plan, not regulator text)

- An investigational IVD is listed with the 809.10(c)(2)(ii) IUO statement
  whether or not the study is exempt under 812.2(c)(3) (step plan: "an IVD
  requires 809.10(c)(2)(ii)"). For a study subject to part 812, F4 shows the
  (a)/(b) exemption rests on part 812 compliance; the note says so.
- `checkAuthoredLabeling` is a presence check of fixed headings, phrases and
  statements in authored sections. found / not_found / not_checkable; never a
  compliance verdict.

## Owed

A verbatim read of 21 CFR 809.10, 812.2 and 812.5 on ecfr.gov when egress
allows; then drop the "verbatim re-read owed" note from `regulatorText()`.
