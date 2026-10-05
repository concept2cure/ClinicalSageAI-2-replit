# g-device-pathway-decisions — regulatory facts relied on

Step: the US device pathway engine stops returning pathways FDA would reject
(verified finding 58, `devices-us-pathway-decision-defects`).

Checked 2026-10-05 with WebSearch (rows 1-10, and row 13 in fix round 1). Regulator hosts are blocked for WebFetch, so
each row cites the page the search result quoted. **Basis** is `regulator-text`
only where a regulator-hosted URL returned the quoted wording. Otherwise it is
`recall`, labelled as such.

| # | Fact the code relies on | Where it is used | Basis | Source (checked 2026-10-05) |
|---|---|---|---|---|
| 1 | A HUD is a device "intended to benefit patients in the treatment or diagnosis of a disease or condition that affects or is manifested in not more than 8,000 individuals in the United States per year". The 21st Century Cures Act raised this from "fewer than 4,000". | `HUD_MAX_ANNUAL_US_POPULATION = 8000`, compared with `<=`. Rationale, alternatives and tool-schema wording. | regulator-text | https://www.fda.gov/industry/medical-products-rare-diseases-and-conditions/humanitarian-use-device-hud-designation-program ; https://www.fda.gov/media/130442/download |
| 2 | The first step toward an HDE is a HUD designation request to FDA's Office of Orphan Products Development (OOPD), with documentation that has authoritative references appended. | `NEEDS-INPUT-HUD`: with no population, the pathway is undetermined. | regulator-text | https://www.fda.gov/media/130442/download ; https://www.fda.gov/medical-devices/humanitarian-device-exemption/getting-humanitarian-use-device-market |
| 3 | Devices of a new type are "automatically" class III by operation of §513(f)(1), whatever their risk. De Novo under §513(f)(2) is a route to class I or II when there is no predicate. | The De Novo branch is evaluated before the class-III branch. De Novo is an alternative in class III with no predicate. | regulator-text | https://www.fda.gov/media/72674/download (De Novo Classification Process guidance) |
| 4 | De Novo is 21 CFR 860 Subpart D. §860.200 covers purpose and applicability. §860.220 covers request content. | Replaces every "21 CFR 860.93" De Novo citation. | regulator-text (eCFR / govinfo) | https://www.ecfr.gov/current/title-21/chapter-I/subchapter-H/part-860/subpart-D |
| 5 | 21 CFR 860.93 is "Classification of implants, life-supporting or life-sustaining devices". It is not De Novo. | Reason for fact 4. | regulator-text (govinfo) | https://www.govinfo.gov/content/pkg/CFR-1996-title21-vol8/html/CFR-1996-title21-vol8-sec860-93.htm |
| 6 | FDA has exempted almost every class I device except reserved devices. Exemption is limited by 21 CFR 862.9-892.9, and an exempt device still needs a 510(k) when a .9 limitation applies. | Class I is `exempt` only when `exempt === true`. Otherwise it is undetermined with `NEEDS-INPUT-EXEMPTION`. | regulator-text | https://www.fda.gov/medical-devices/classify-your-medical-device/class-i-and-class-ii-device-exemptions ; https://public-inspection.federalregister.gov/2017-07468.pdf |
| 7 | §513(g) lets a person obtain FDA's view of a device's classification and the requirements that apply to it. | `NEEDS-INPUT-PREDICATE` names 513(g) as an option. | regulator-text | https://www.fda.gov/media/78456/download |
| 8 | eSTAR is mandatory, unless exempted, for 510(k) from 2023-10-01 and for De Novo from 2025-10-01. | **The engine does not hard-code these dates.** It reads currency facts `fda-estar-510k-mandatory` and `fda-estar-denovo-mandatory`, cites their `sourceUrl`, and puts the factId on the finding. | regulator-text, already registered | https://www.fda.gov/media/172450/download ; https://www.fda.gov/regulatory-information/search-fda-guidance-documents/electronic-submission-template-medical-device-510k-submissions |
| 9 | MDUFA V (FY2023-2027) goals: a 510(k) decision within 90 FDA days; a De Novo decision within 150 FDA days; an original PMA without advisory-committee input within 180 FDA days. | Read from `ESTAR_CATALOG.reviewGoalDays` and labelled "MDUFA V goal". | regulator-text | https://www.fda.gov/media/158308/download |
| 10 | Pre-Submission written feedback is due within 70 calendar days, or at least 5 days before a scheduled meeting, whichever is sooner. | Q-Sub phase. The 70 is read from `ESTAR_CATALOG` (`qsub_pre_submission`). | regulator-text | https://www.fda.gov/media/114034/download |
| 11 | HDE review clock: 75 days. | Kept unchanged in the HDE branch and timeline. | **recall** (21 CFR 814 Subpart H). It is not in the eSTAR catalog, and this step did not re-read it. | — |
| 12 | The HUD statutory home is FD&C Act §520(m). | Code comment and citation. | **recall**. The exact subparagraph is not asserted. | — |
| 13 | Anyone can register in the CDRH Portal and send eSTAR or eCopy premarket submissions online; FDA recommends the Portal. Files over 4 GB, or PDFs with an attachment over 1 GB, can be mailed on electronic media to the CDRH Document Control Center (DCC). The Portal is therefore a route, not the only route. | ESTAR finding statement and the 510(k) / De Novo `submissionFormat` strings: "sent through the CDRH Portal or to the CDRH Document Control Center". (Fix round 1: the earlier "filed through the CDRH Portal" read as the required route.) | regulator-text | https://www.fda.gov/medical-devices/industry-medical-devices/send-and-track-medical-device-premarket-submissions-online-cdrh-portal ; https://www.fda.gov/medical-devices/how-study-and-market-your-device/ecopy-medical-device-submissions |
| 14 | FD&C Act §510(l): a class I device is exempt from 510(k) unless it is intended for a use of substantial importance in preventing impairment of human health, or presents a potential unreasonable risk of illness or injury (the "reserved" criteria). | `NEEDS-INPUT-EXEMPTION` citation "21 CFR 862.9-892.9; FD&C Act §510(l)". The .9 / reserved wording itself rests on row 6. | **recall** (statutory text not re-read this step). | — |
| 15 | A class III device requires premarket approval (FD&C Act §513(a)(1)(C), §515). A 510(k) exemption does not remove that. | `NEEDS-INPUT-CLASS-III-EXEMPT`: `{usClass:'III', exempt:true}` is undetermined, not exempt (fix round 1). | **recall**. | — |

## Engine behaviour these facts set (summary)

- `{III, no predicate, novelLowModerateRisk}` → De Novo, with PMA as the alternative.
- `{III, no predicate}` → IDE-then-PMA, with De Novo and HDE as alternatives.
- Class I without `exempt` → undetermined, with `NEEDS-INPUT-EXEMPTION`. `exempt === true` → exempt, except for class III.
- Class III with `exempt === true` → undetermined, with `NEEDS-INPUT-CLASS-III-EXEMPT` (the inputs conflict).
- Class II or unclassified with no predicate and no novelty claim → undetermined, with `NEEDS-INPUT-PREDICATE` (predicate, De Novo, or 513(g)).
- HUD: population ≤ 8,000 → HDE. Over 8,000 → HDE is not used. Population missing → undetermined, with `NEEDS-INPUT-HUD`; 510(k) is listed as an alternative there when `predicateExists` is true.
- `planDeviceSubmission` has no `useEStar` input. eSTAR is mandatory iff the currency fact is in force on `asOf` and `asOf >= effectiveDate`. The ESTAR finding is then a `requirement`, with `url` and `factId`.

## Registry note

`statusAsOf` promotes only `mandatory_upcoming` facts. Both eSTAR facts are stored as `in_force` with their effective date. As a result, `statusAsOf` reports a date before 2025-10-01 as `in_force` for De Novo. The engine therefore also checks `asOf >= fact.effectiveDate`. See needs_elsewhere in the step report.
