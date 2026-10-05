# g-csr-pack-provenance-amend — facts relied on

Step: the csr, ib and protocol rule packs stop claiming high-confidence ICH M4 provenance
(finding 80 `devices-csr-outlines-e3`, part (a) only; DECISIONS.md #24: provenance and numbering corrected, no CSR governed document, no new E3 pack).

Search date for every "regulator-text" row: 2026-10-05. Regulator sites refuse WebFetch from this environment, so each row was matched against search results that quote or index the regulator-hosted document. It was not read in full.

| # | Fact | Basis | Source |
|---|------|-------|--------|
| 1 | ICH M4 organises the CTD into five modules: M1 is regional, and M2-M5 are common. M5 holds clinical study reports "in the order described in Guideline M4E". M4 places CSRs in the dossier. It does not define a CSR's internal structure. | regulator-text (search-indexed), checked 2026-10-05 | https://database.ich.org/sites/default/files/M4_R4__Guideline.pdf ; https://www.fda.gov/files/drugs/published/M4-Organization-of-the-Common-Technical-Document-for-the-Registration-of-Pharmaceuticals-for-Human-Use-Guidance-for-Industry.pdf |
| 2 | "ICH M4 does not define the structure of a CSR, an IB or a protocol." This is the negative claim, inferred from row 1 plus the existence of E3, E6 and M11. | recall | — |
| 3 | ICH E6(R3) Step 4 (January 2025) puts the Investigator's Brochure in Appendix A and the Clinical Trial Protocol and Protocol Amendment(s) in Appendix B. | regulator-text (search-indexed), checked 2026-10-05 | https://database.ich.org/sites/default/files/ICH_E6(R3)_Step4_FinalGuideline_2025_0106.pdf ; https://www.fda.gov/media/169090/download |
| 4 | ICH M11 (CeSHarP), with its guideline, protocol template and technical specification, was adopted at Step 4 on 19 November 2025. | regulator-text (search-indexed), checked 2026-10-05 | https://database.ich.org/sites/default/files/ICH_Step4_M11_Final_Template_2025_1119.pdf ; https://www.ich.org/news/ich-m11-expert-working-group-issues-final-overview-presentation |
| 5 | ICH E3 has 16 top-level sections. | platform data: `e3TopLevel()` in server/services/ind/ctd/csr-e3-guidance.ts, whose basis is FDA_E3 (https://www.fda.gov/media/71271/download, checked 2026-10-05) in regulatory-basis.ts. The test computes the "8 of 16" figure from the pack rows and this tree. It is not hand-typed. | |
| 6 | The seeded protocol pack's nine headings (General information … Ethics, regulatory and quality oversight) resemble E6 protocol content headings and are not numbered to the M11 template. | recall. The attestation says "not numbered to the M11 template". It does not claim a match. | — |
| 7 | The seeded IB pack's six headings (Summary … Summary of data and guidance for the investigator) correspond to the E6 IB content headings. There is no TOC and there are no subsections. | recall (E6(R2) §7.3 / E6(R3) App. A heading list) | — |

## Repository facts (read 2026-10-05)

- migrations/20260528_phase9_document_schema.sql seeds csr:ich, ib:ich and protocol:ich as `ich-m4-v2.0`. They have 8, 6 and 9 root sections and no children. No later migration supersedes them.
- Before this change, migrations/20260810c_rule_pack_provenance.sql step 2 (`WHERE version LIKE 'ich-m4-%'`) stamped all three 'ICH M4 …' / harmonised_standard / high. Step 1 only COALESCEs NULLs, so a deployed database keeps those values unless a statement assigns new ones explicitly.
- The file is already in C2C_MIGRATION_FILES (scripts/db/migration-set.mjs:969), so no set entry is needed.
- scripts/ci/check-rule-pack-provenance.mjs still counts csr:ich, ib:ich and protocol:ich as attested, through the `WHERE doc_type = … AND agency = …` pair form. Undeclared stays at 5/5.

## Attestation chosen

All three are `reasoned_construction` with confidence `low`, because each is a hand-built partial outline. `review_status` is unchanged at `unreviewed`. The governing_rule names the real guideline and says "partial". The uncertainties field says the version label is historical.
