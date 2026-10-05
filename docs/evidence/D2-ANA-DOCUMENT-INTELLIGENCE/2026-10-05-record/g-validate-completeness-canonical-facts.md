# g-validate-completeness-canonical: facts this step relies on

Checked 2026-10-05. WebFetch cannot reach regulator hosts from this environment. A row marked **regulator-text (search)** was confirmed from WebSearch results that point at the regulator-hosted URL, but the text itself was not fetched. A row marked **recall** comes from memory or from the repository's own records, and is not regulator text.

This step adds no regulatory content. The required sections come from `server/services/ectd/required-sections.ts` (facts in `g-required-sections-home-facts.md`). The facts below are the ones that justify **deleting** the engine's hand table and its **verdict rule**.

| # | Fact | Basis | Where it is used |
|---|---|---|---|
| 1 | FDA may refuse to file an NDA that is incomplete because, on its face, it lacks information required under FD&C Act 505(b) and 21 CFR 314.50. | regulator-text (search): https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-314/subpart-D/section-314.101 and FDA's RTF guidance https://www.fda.gov/files/drugs/published/Refuse-to-File--NDA-and-BLA-Submissions-to-CDER-Guidance-for-Industry.pdf. Checked 2026-10-05. | **Every missing required section is a blocker.** The old `c.module <= '3'` split meant an NDA with no Module 4 or 5 had zero blockers and was rated `conditional_go`. |
| 2 | Form FDA 3601 is the Medical Device User Fee Cover Sheet. It is not a device application form. | regulator-text (search): https://www.fda.gov/medical-devices/premarket-submissions-selecting-and-preparing-correct-submission/medical-device-user-fees. Checked 2026-10-05. | The deleted device branch called 3601 the "Device Application Form". |
| 3 | Under IVDR (EU) 2017/746, post-market performance follow-up (PMPF) is in Annex XIII Part B. Annex XIV covers interventional clinical performance studies and other performance studies. | regulator-text (search): https://eur-lex.europa.eu/eli/reg/2017/746/oj/eng. Checked 2026-10-05. The annex text was not fetched. | The deleted IVDR list filed PMPF under "Annex XIV". The repo's canonical IVDR annex record is `pathway-engines/mdr-ivdr/tech-doc-assembler.ts`, so the engine now returns `not_assessed` for IVDR and points there instead of keeping a second annex list (DECISIONS.md #13). |
| 4 | IVDR Annex II section 6.3 holds stability data (shelf life, in-use and transport stability). | recall. The verified finding gives the same reading, and DECISIONS.md #7 notes that IVDR Annex II §6 is still owed a read. | This is a second reason the deleted IVDR list was wrong: it filed stability under its own "Stability" heading. Nothing in this step encodes it. |
| 5 | US Module 1: 1.12.1 is Pre-IND correspondence, 1.12.14 is the environmental analysis, 1.3.5 is patent and exclusivity information, 1.4.2 is the statement of right of reference, and 1.14 is labeling. | recall, matching the FDA region profile in `regional-ctd-templates.ts`, which the profile now reads. | The deleted table put EA at 1.14, patent information at 1.12, right of reference at 1.12.2 and Paragraph IV letters at 1.12.1. The engine no longer holds any Module 1 number. |
| 6 | EU Module 1: 1.6 is the environmental risk assessment, 1.8.2 is the risk-management system and 1.10 is paediatrics. | regulator-text (search). This was recorded in `g-required-sections-home-facts.md` row 1 (EMA EU M1 eCTD Spec v3.1). | The MAA test asserts 1.8.2. The deleted MAA branch (RMP at 1.5, PIP at 1.6, ERA at 1.8) could not be reached anyway, because TYPE_MAP sent MAA to the NDA table. |

## Behaviour pinned (not regulatory facts)

These outputs come from probe `vc-probe4.mts` on the working copy. Each line is `type/agency -> decision`.

```
NDA/FDA -> no_go profile=NDA:fda items=23      US_NDA/- -> same
BLA/- -> no_go profile=BLA:fda items=22        IND/FDA, US_IND/- -> no_go profile=IND:fda items=18
MAA/-, EU_MAA/EMA -> no_go profile=MAA:eu items=26 (agency reported EMA, not the old 'FDA' default)
JNDA/PMDA -> no_go profile=JNDA:jp items=19
MAA/FDA, IND/EMA, JP_MKT_APPROVAL, ANDA, 505(b)(2), CTA, IVDR-TF -> not_assessed (no assessor)
510(k), De Novo, PMA -> not_assessed, assessWith assessEstarFilingReadiness (POST /api/510k/estar/filing-readiness)
IVDR, IVDR_TD -> not_assessed, assessWith assembleTechDoc (GET /api/submissions/sequences/:seqId/technical-file?regulation=ivdr)
mdr_td -> not_assessed, assessWith assembleTechDoc (... technical-file?regulation=mdr)
```

Review fix round 1: the assessor pointer is an explicit allow-list keyed by the resolved registry id (`ASSESSOR_BY_REGISTRY_ID`). These are code facts, read from the engines, not regulatory facts.

- eSTAR: `estar-filing-readiness.assessContent` handles only `510k`, `de_novo`, `pma` (original and supplements, `PMA_KEY_TO_TYPE`), `q_sub`, `ide` and `513g`, with an `ivd` variant. Listed: US_510K, US_510K_MOD, US_510K_IVD, US_DE_NOVO, US_DE_NOVO_IVD, US_PMA, US_PMA_IVD, US_PMA_SUPP, US_IDE.
- Tech doc: `tech-doc-assembler` takes `EuRegulation = 'mdr' | 'ivdr'` and builds only the Annex II/III technical documentation. Listed: EU_MDR_TECHDOC and EU_MDR_CLASS_I/IIA/IIB/III with `regulation=mdr`; EU_IVDR, EU_IVDR_TECHDOC (the bridge's alias target for `IVDR_TD`, which has no registry entry) and EU_IVDR_CLASS_A/B/CD with `regulation=ivdr`.
- Everything else is `assessWith: null`, with the plain no-profile reason. That includes US_EUA, US_HDE, EU_MIR, EU_FSCA, EU_IVD_VIGILANCE, EU_TREND_REPORT_DEVICE, EU_PSUR_DEVICE/IVD, EU_CLIN_INVESTIGATION, EU_PERF_STUDY, EU_NB_CONSULT, EU_IVDR_ART48_CONSULT, EU_REF_LAB, EU_CER, EU_DOC and EU_SIG_CHANGE. The round-0 category/segment rule pointed them at eSTAR or the tech-doc assembler, which do not assess them. Full probe: 4 assessed, 9 eSTAR, 4 IVDR tech doc, 5 MDR tech doc, 212 null (green evidence).
- `targetAgency` on an assessed result is always the profile's home agency (`' '`, `'fda'` and `' FDA '` report `'FDA'`). On a not-assessed result it is the trimmed input, then the registry agency, then `'unspecified'`.

- `scoreSubmissionDraft` throws `CompletenessNotAssessedError` (code `COMPLETENESS_NOT_ASSESSED`, status 422) for a not-assessed type. It never calls the network-prior lookup, the risk model or the `risk_predictions` insert. Nothing divides 0 by 0.
- Feature drift: `REGULATORY_INTELLIGENCE_VERSION` is now 1.1.0, and `COMPLETENESS_FEATURE_DRIFT` in `regulatory-intelligence.ts` records it:
  - `missing_critical` counts every missing required section;
  - `missing_important` is 0;
  - `completeness_pct` is calculated over the canonical profile.
- Known profile defects are inherited, not introduced. They are owned by `g-required-sections-home` and the region profile:
  - EU 1.1 (table of contents) is required in an eCTD MAA;
  - the FDA NDA and BLA profiles require 3.2.A unconditionally.
