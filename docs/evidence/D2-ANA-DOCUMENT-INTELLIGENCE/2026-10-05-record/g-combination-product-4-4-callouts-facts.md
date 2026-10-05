# g-combination-product-4-4-callouts — facts relied on

Step: `planCombinationCGMP`, `listDeviceProvisionsForDrugBase`, the
`assessDeviceConstituentControls` rationale and the AnA tool `plan_combination_cgmp`
state the 21 CFR 4.4(b)(1) call-outs that are in force on `asOf`.

How these were checked: www.ecfr.gov, www.federalregister.gov, www.govinfo.gov and
law.cornell.edu are all refused by this container's egress proxy (CONNECT 403,
2026-10-05), so no regulator page could be read verbatim. The clause list below comes
from WebSearch result extracts, five queries on 2026-10-05. In each, the extract was
attributed to, or listed first, the eCFR page for 21 CFR 4.4. Secondary sources
(intuitionlabs.ai, meddeviceguide.com, hoganlovells.com, suttonscreek.com) were
consistent with it. In the code these rows are `regulator-text` with the note "search
extract of the eCFR page …; verbatim re-read owed". That follows the precedent of
`shared/regulatory/qmsr-crosswalk.ts`. **Owed:** a verbatim read of the eCFR 4.4 page
by someone with access, before this is treated as anything firmer than a search
extract.

eCFR 21 CFR 4.4: https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-4/subpart-A/section-4.4

| # | Fact | Basis | Source | Checked |
|---|------|-------|--------|---------|
| 1 | The QMSR final rule (FR 2024-01709, 89 FR 7496, 2024-02-02), in force 2026-02-02, amended 21 CFR 4.4(b)(1). The provision now refers to ISO 13485:2016 clauses and 21 CFR 820.10 instead of the former Part 820 section numbers. The term "management responsibility" gained "general requirements", and § 820.10 was added. | regulator-text, **search extract only** | https://www.federalregister.gov/documents/2024/02/02/2024-01709/medical-devices-quality-system-regulation-amendments ; eCFR 4.4 (above) | 2026-10-05 (WebSearch) |
| 2 | The 4.4(b)(1) management responsibility and general requirements call-out is ISO 13485 Clause 4.1, Clause 5 and its subclauses, Clause 6.1, plus 21 CFR 820.10. | regulator-text, **search extract only** | eCFR 4.4 | 2026-10-05 |
| 3 | The design and development call-out is ISO 13485 Clause 7.3 and its subclauses. It also carries the requirement that "the organization shall document one or more processes for risk management in product realization. Records of risk management activities shall be maintained." | regulator-text, **search extract only**. Three separate extracts carry the risk-management sentence. That the sentence is the Clause 7.1 text is **recall** (ISO 13485:2016 §7.1), so the code labels it "the §7.1 risk-management requirement". | eCFR 4.4 | 2026-10-05 |
| 4 | The purchasing call-out is ISO 13485 Clause 7.4 and its subclauses. | regulator-text, **search extract only** | eCFR 4.4 | 2026-10-05 |
| 5 | The analysis of data, improvement, and complaint handling call-out is ISO 13485 Clause 8.2.2 with 21 CFR 820.35(a), Clause 8.4, and Clause 8.5 and its subclauses. | regulator-text, **search extract only** | eCFR 4.4 | 2026-10-05 |
| 6 | The installation activities call-out is ISO 13485 Clause 7.5.3. | regulator-text, **search extract only** | eCFR 4.4 | 2026-10-05 |
| 7 | The servicing activities call-out is ISO 13485 Clause 7.5.4 with 21 CFR 820.35(b). | regulator-text, **search extract only** | eCFR 4.4 | 2026-10-05 |
| 8 | Before 2026-02-02, 21 CFR 4.4(b)(1) called out QSR §§ 820.20 (management responsibility), 820.30 (design controls), 820.50 (purchasing controls), 820.100 (CAPA), 820.170 (installation) and 820.200 (servicing). | recall (removed text) | — | — |
| 9 | 21 CFR 4.4(b)(2) (drug cGMP into a device base: §§ 211.84, 211.103, 211.132, 211.137, 211.165, 211.166, 211.167, 211.170) was **not** re-read in this step. | recall; each (b)(2) row carries a recall basis | — | — |
| 10 | The (i)…(vi) paragraph numbering inside 4.4(b)(1) was not confirmed, so the code cites "21 CFR 4.4(b)(1), <item>" and never a sub-paragraph. | — | — | — |
| 11 | The ISO 13485:2016 clause titles in the requirement text (quality policy, objectives, supplier evaluation, corrective and preventive action under §8.5.2/§8.5.3, and so on) are the standard's own titles, not a regulator page. | recall (ISO text) | ISO 13485:2016 | — |

What the code does with them:

- `DEVICE_PROVISIONS_CALLED_INTO_DRUG_BASE` holds rows 2–7, one row each. Each row carries `basis`, which is `regulator-text` with the eCFR 4.4 URL, `checked` 2026-10-05 and the search-extract note. Each row also carries `formerly`, the removed QSR section, labelled "(QSR, until 2026-02-01)".
- `QSR_DEVICE_PROVISIONS_CALLED_INTO_DRUG_BASE` holds row 8 with a `recall` basis. It is served only for an `asOf` before 2026-02-02.
- `planCombinationCGMP` and `listDeviceProvisionsForDrugBase` take `asOf`, which defaults to today (UTC). A malformed date throws rather than the code guessing which text applies. The 4.4(b)(1) rationale line, the transition note and the 820.10/820.30 citation are all built from the list in force.
- `assessDeviceConstituentControls` builds its 4.4(b)(1) rationale line from the same list.
- The `plan_combination_cgmp` tool description names 21 CFR 820.10 and the ISO 13485:2016 clauses, says the list is resolved for `asOf`, and no longer enumerates the removed sections. Its input schema now has `asOf`.

Not touched here: the `CITATIONS` registry entry '21 CFR 820' still says "being
superseded by the QMSR", and other 820.30 mentions remain in the human-factors and
pathway engines of the same file. Both are part of the broader QMSR burn-down
(item 59, proposal step 8).
