# Concept2Cure skills pack

Agent Skills (open standard: a folder per skill with a `SKILL.md` carrying
`name` and `description` frontmatter) that teach Claude how to work with a
regulatory dossier and route every governed action to the Concept2Cure
connector by tool name. Claude drafts; Concept2Cure governs, validates and
submits.

| Skill | Use when | Connector tools it routes to |
|---|---|---|
| `ectd-module-structure` | placing or naming a document in an eCTD | `c2c_validate_ectd_structure`, `c2c_get_sequence_status`, `c2c_file_draft_for_review` |
| `ich-authoring-checklists` | drafting M4 CTD sections, GCP (E6(R3)) and estimand (E9(R1)) content | `c2c_lookup_ich_guideline`, `c2c_check_regulatory_currency`, `c2c_sweep_contradictions` |
| `fda-response-letter-format` | answering an FDA information request, CRL or RTF | `c2c_lookup_submission_deficiencies`, `c2c_run_crl_premortem`, `c2c_draft_cover_letter`, `c2c_draft_agency_response` |
| `submission-readiness-review` | deciding whether a sequence can go | `c2c_assess_sequence_readiness`, `c2c_readiness_overview`, `c2c_search_precedents`, `c2c_ga_readiness_probe` |

Install: copy `skills/concept2cure/<skill>` into your skills directory, or
point Claude at this folder. Requires the Concept2Cure connector to be
connected; every skill states what it will not do without it.
