# g-design-control-lists-one-home — facts relied on

Step: the three design-control element lists (design-controls.ts `DHF_ELEMENTS`,
DesignControls.tsx `DC_820_30`, combination-products-knowledge.ts
`DESIGN_CONTROL_ELEMENTS`) read the one QMSR crosswalk,
`shared/regulatory/qmsr-crosswalk.ts`, through `citeQms(id, asOf)`.

| # | Fact | Basis | Source | Checked |
|---|------|-------|--------|---------|
| 1 | The QMSR (21 CFR 820, final rule FR 2024-01709) applies from 2026-02-02; 21 CFR 820.30 (QSR design controls) is removed; design and development controls are ISO 13485:2016 §7.3 reached through 21 CFR 820.10(c). | regulator-text (inherited) | Recorded by the dependency step in `g-qmsr-crosswalk-assess-qms-facts.md`; https://www.federalregister.gov/documents/2024/02/02/2024-01709/medical-devices-quality-system-regulation-amendments ; https://www.ecfr.gov/current/title-21/chapter-I/subchapter-H/part-820/subpart-A/section-820.10 | 2026-10-05 (that step) |
| 2 | The QMSR does not carry the QSR 820.30(e) requirement that each design review include an individual without direct responsibility for the stage reviewed; commenters raised it and FDA's preamble states the QMSR differs from the QSR on this point, relying on ISO 13485 §7.3.5. | regulator-text, **search extract only** (FR preamble as hosted by FDA); verbatim re-read and the comment number (cited elsewhere as "Comment 46") are owed | https://www.fda.gov/media/177022/download (Federal Register Vol. 89 No. 23, 2024-02-02) | 2026-10-05 (WebSearch extract) |
| 3 | ISO 13485:2016 §7.3.5: design and development review participants include representatives of functions concerned with the stage being reviewed, as well as other specialist personnel. | recall (ISO text, not a regulator page); the "representatives of functions concerned" half is echoed in the FR extract of row 2 | ISO 13485:2016 | — |
| 4 | ISO 13485:2016 §7.3.10: design and development files maintained for each device type or family, including or referencing records generated to demonstrate conformity to design and development requirements and records for design and development changes. | recall (ISO text) | ISO 13485:2016 | — |
| 5 | Crosswalk paragraph mapping 820.30(b)…(j) ↔ ISO 13485:2016 §7.3.2…§7.3.10 (plan, inputs, outputs, review, verification, validation, transfer, changes, file). | recall; owned by the crosswalk row data, not restated here | shared/regulatory/qmsr-crosswalk.ts | — |

What the code does with them:

- `assessDhfCompleteness(dhf, asOf)`: every citation is `citeQms(element, asOf)`. On and after
  2026-02-02 a review without an independent reviewer is an **advisory** naming ISO 13485:2016
  §7.3.5 (row 2/3), and `designReviews` is satisfied by any recorded review; before that date the
  QSR blocker citing 21 CFR 820.30(e) stands. A malformed `asOf` throws (fail closed).
- combination products: element citations are `citeQms`; the QMSR-era design-review expectation
  and the design-file wording follow rows 3 and 4; the QSR wording is kept for pre-2026-02-02 dates.
- DesignControls.tsx: checklist refs and every on-screen citation are `citeQms(id, today)`; the
  "(independent)" label on design reviews is removed (row 2).

Not touched here (other steps): `combination-products-knowledge.ts` 21 CFR 4.4(b)(1) call-outs,
including the `assessDeviceConstituentControls` rationale line "design controls under 21 CFR
820.30 (called out … by 21 CFR 4.4(b)(1))" — step g-combination-product-4-4-callouts.
