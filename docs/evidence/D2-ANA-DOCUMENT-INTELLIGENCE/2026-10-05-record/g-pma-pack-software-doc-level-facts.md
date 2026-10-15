# g-pma-pack-software-doc-level: regulatory facts relied on

Step: pma:fda `fda-pma-21cfr814-20-v1.1`
(`migrations/20261005b_pma_fda_outline_v1_1_software_documentation_level.sql`)
relabels node C.4. It changes from "Software description and level of concern"
to "Software description and FDA documentation level (Basic/Enhanced)". It
supersedes exactly v1.0.

`migrations/20260810_pma_fda_814_20_outline.sql` was amended in place under
CLAUDE.md Rule 1. Its supersede UPDATE now names `fda-pma-2024` only. Checked
2026-10-05.

WebFetch to fda.gov is blocked in this environment. **Regulator text** means
the wording was matched against WebSearch results, restricted to `fda.gov`, that
quote FDA's own copy at the URL shown. The PDF itself was not opened.
**Recall** means the fact was not checked against regulator text this session.

| # | Fact | Basis | Where used |
|---|---|---|---|
| 1 | FDA's final guidance "Content of Premarket Submissions for Device Software Functions" was issued on 14 June 2023. It replaces the 2005 guidance (the one built on Level of Concern) with two Documentation Levels, Basic and Enhanced. Basic applies wherever Enhanced does not. | **Regulator text** (search extract). Sources: https://www.fda.gov/media/153781/download, https://www.fda.gov/media/170714/download, and https://www.fda.gov/regulatory-information/search-fda-guidance-documents/content-premarket-submissions-device-software-functions. Re-checked in this step by WebSearch on 2026-10-05. The extract confirms the 14 June 2023 issue date, that the guidance replaces the 11 May 2005 guidance, that the documentation level replaces the 2005 level of concern, and that Basic applies "where Enhanced Documentation does not apply". | C.4 label in v1.1. The v1.1 `uncertainties` text and `governing_rule`. |
| 2 | Enhanced applies where a failure of a device software function could present a hazardous situation with a probable risk of death or serious injury. This is assessed before risk control measures. | **Regulator text** (search extract of fda.gov/media/153781). It was checked by the dependency step, `g-fda-software-documentation-level-facts.md` row 2, on 2026-10-05. It was not re-searched here. | Header of the v1.1 migration only. The determination itself lives in `server/services/market-specs/software-lifecycle.ts` (`fdaDocumentationLevel`). This step adds no logic. |
| 3 | 21 CFR 814.20(b) lists PMA contents and names no software heading. Placing software under (b)(4)(i), the complete device description, is this outline's own construction. | **Recall.** The v1.0 outline was transcribed from 814.20(b) by 20260810, and the regulation was not re-read this session. | Stated in the v1.1 `uncertainties`, so a filer sees the placement is not regulator text. |
| 4 | `source_basis = 'statutory_transcription'` and `confidence = 'high'` for v1.1. | This is the attestation `20260810c_rule_pack_provenance.sql` already makes for every pma:fda row. v1.1 repeats it so the attestation holds from the first deploy. Without it, 20260810c runs before v1.1 exists and v1.1 carries `undeclared`/`unknown` until the next deploy (shown red in `-red.txt`). The C.4 relabel is the one non-transcribed element, and the `uncertainties` text says so. | v1.1 provenance UPDATE. |

**Not claimed.** v1.1 does not change mandatory flags, keys or any other label
(tested node-for-node against v1.0). Documents already bound to v1.0 keep v1.0's
outline and its C.4 "level of concern" label under DECISIONS.md #6 (detect and
surface; never rewrite silently). This step does not touch them.

**Owed read** (DECISIONS.md #7): open https://www.fda.gov/media/153781/download
and confirm the Enhanced definition verbatim.
