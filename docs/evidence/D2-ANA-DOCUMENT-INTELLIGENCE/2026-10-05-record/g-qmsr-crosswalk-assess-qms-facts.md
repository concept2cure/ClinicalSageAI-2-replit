# g-qmsr-crosswalk-assess-qms: the regulatory facts this step relies on

Checked 2026-10-05. The regulator pages were reached through WebSearch results
restricted to ecfr.gov, fda.gov and federalregister.gov. WebFetch to regulator
hosts is blocked here, so no page was opened in full. "Regulator text" means the
wording appeared in a search result served from the regulator's own host, at the
URL given. A verbatim re-read is owed for each.

The QMSR fact itself (`us-qmsr`: in force 2026-02-02, FR 2024-01709, 820.30
references changed to 820.10(c), the QMSR does not use DHF/DMR/DHR) was
recorded by `g-us-qmsr-ldt-facts-facts.md` and is not repeated here. The
crosswalk reads its effective date from that fact (`QMSR_FACT_ID`); a test pins
`QMSR_EFFECTIVE` to the fact's `effectiveDate` and `in_force` status.

| Fact | Basis | Source | Used in |
|---|---|---|---|
| 21 CFR 820.10 requires a documented QMS that complies with ISO 13485 (incorporated by reference, 820.7). | regulator text | https://www.ecfr.gov/current/title-21/chapter-I/subchapter-H/part-820/subpart-A/section-820.10 | every row's "21 CFR 820.10 →" |
| 820.10(c): manufacturers of class II, class III and listed class I devices (software-automated, and the table to (c)(2)) comply with ISO 13485 clause 7.3 and its subclauses. | regulator text | same eCFR 820.10 page | `design_controls` row (`regulator-text`); design-element rows cite 820.10(c) |
| 820.35 (control of records): complaint records include device name, date received, any UDI or UPC; manufacturers meet ISO 13485 clause 4.2.5 and 820.35. | regulator text | https://www.ecfr.gov/current/title-21/chapter-I/subchapter-H/part-820/subpart-B/section-820.35 | `feedback_complaints` row (`regulator-text`), `qms_general` |
| 820.35(b): servicing records, "in adhering to Clause 7.5.4 in ISO 13485, Servicing Activities" (device, UDI/UPC, date, who, service, test data). | regulator text | same eCFR 820.35 page | `production` row |
| 820.45 (device labeling and packaging controls): procedures for labeling and packaging integrity, inspection, storage; examination for accuracy incl. UDI/UPC before release. | regulator text | https://www.ecfr.gov/current/title-21/chapter-I/subchapter-H/part-820/subpart-B/section-820.45 | `production` row, transition note |
| ISO 13485:2016 clause numbers and titles (§4, §4.2.3 medical device file, §4.2.5, §5, §6, §7.3.2–§7.3.10, §7.4, §7.5, §7.5.4, §7.6, §8.2, §8.3, §8.5.2, §8.5.3). | **recall** (ISO text; not a regulator page) | — | `iso13485Clause` of every row; the rows are `recall` for this reason |
| §7.3.10 "design and development files" as the place the QSR's DHF content sits; §4.2.3 medical device file as the DMR's nearest equivalent. | **recall** (FDA's own text says clause 4.2 and clause 7 and their subclauses) | — | `qms_general` purpose, `traceability` row, transition note — labelled "ISO clauses, not FDA terms" |
| Legacy QSR sections (820.20 management responsibility, 820.25 personnel, 820.30(b)–(j) design controls, 820.40 document controls, 820.50 purchasing, 820.60/.65 identification/traceability, 820.70/.75 production/process validation, 820.72 measuring equipment, 820.90 nonconforming, 820.100 CAPA, 820.120/.130 labeling/packaging, 820.180/.181 records/DMR, 820.198 complaints, 820.200 servicing). | **recall** of the removed 1996 text | — | `legacyQsr`, shown only as "formerly … (QSR, until 2026-02-01)" |
| 21 CFR 803 is medical device reporting. | **recall** | — | `feedback_complaints` qmsrBasis (carried over from the previous fdaMapping) |

## Not done here (other lanes)

- `submission-center-tool-defs.ts:849` (the `assess_qms` description) still says
  "each clause's FDA mapping (21 CFR 820.x)" and "QSR→QMSR mapping"; it is not
  wrong now but could name 820.10/820.35/820.45.
- `regulatory-capabilities-index.ts:60` says "FDA QSR/QMSR mapping".
- The 820.30 citations in DesignControls.tsx, design-controls.ts and
  combination-products-knowledge.ts move onto `citeQms` in
  `g-design-control-lists-one-home`; the design-element rows here exist for it.
