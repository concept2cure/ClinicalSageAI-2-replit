# W2 / D4 — current protocol authoring depth

Reviewed 2026-10-07. Scope: existing Authoring document templates and registry project scaffolds; no new authoring engine or external integration.

The prior named `protocol` template projected the 15-heading E6(R2) project scaffold. The `protocol-m11` outline identifier and renderer test fixture existed, but production M11 data did not. The library also sent `ICH_CLIN_OVERVIEW` and `ICH_CLIN_SUMMARY` requests to a broad Module 2 scaffold despite having exact named component outlines.

## Changes

- `shared/regulatory/protocol-m11.ts` owns the current M11 heading tree: 14 level 1 headings, 70 level 2 headings and three front-matter entries. Headings were checked against the FDA-hosted final May 2026 template. Purpose notes are explicitly platform authoring summaries.
- `ich_protocol_sections` keeps its existing identifier and projects that tree for new registry scaffolds. Module 0 denotes a standalone document grouping, not CTD placement. The E6(R2) heading copy in this scaffold was replaced; existing stored projects are not silently renumbered.
- The named `protocol`, `protocol-m11` compatibility alias, registry `ICH_PROTOCOL` and existing `DocumentOutline` renderer project this one record. `AnaDocumentDraftingService` consumes the outline renderer for actual protocol section requirements, including parent child headings; an unmodelled deeper/legacy/CTD heading returns an explicit unindexed answer. Retained headings are distinguished from assessment/content applicability.
- Clinical overview and summary registry requests now use their exact existing named component sections.

## Sources checked

1. FDA M11 guidance page, final May 2026: https://www.fda.gov/regulatory-information/search-fda-guidance-documents/m11-clinical-electronic-structured-harmonised-protocol
2. FDA final M11 template: https://www.fda.gov/media/192647/download (70 PDF pages). The underlying ICH template was adopted on 19 November 2025. Instructions specify interventional scope, retention of level 1/2 headings, deletion of instructional section 0 at finalisation and applicable country/region differences.
3. ICH Step 4 template: https://database.ich.org/sites/default/files/ICH_Step4_M11_Final_Template_2025_1119.pdf. ICH copyright is acknowledged in the canonical record; this adaptation is not endorsed by ICH or FDA.

## Verification

`protocol-red.txt`: the actual library tests failed before correction on the old protocol objective heading and the broad clinical overview registry fallback (two failed, 33 passed).

`protocol-green.txt`: initial corrected library suite, 35 passed.

`protocol-integrated.txt`: final library, existing outline renderer, registry coverage and submittability coverage suites; 247 tests in four files passed. These verify current critical headings, one record projected through named/registry/project paths, standalone grouping, checked provenance, honest applicability/exchange scope and refusal to invent deeper unmodelled headings.

`protocol-lint.txt`: zero errors; three existing warnings in the large shared bootstrap file. No new warnings in changed/new protocol or library code/tests. New shared record and server outline adapter passed a narrow TypeScript check (`protocol-record-types.txt`). Full-project TypeScript and integrated build are owned by the lead session.

`protocol-drafting-red.txt`: five new protocol-consumption checks failed while 20 existing checks passed. `protocol-drafting-green.txt`: the corrected regional and blueprint drafting suites passed 43 tests in two files. Later IND-safety additions are verified separately in `protocol-ind-safety-green.txt`. The final drafting-service/lifecycle lint log has zero errors and eight pre-existing warnings (`protocol-drafting-lint.txt`).

## Qualification limits

This change provides current source-grounded front matter and level 1/2 authoring structure. It does not encode the deeper headings, repeatable objective fields, complete mandatory/conditional text, controlled terminology, electronic cardinality or M11 technical exchange. It does not qualify scientific adequacy, source completeness, ethics review, country adoption, filing schema, agency acceptance or client production use. Those require applicable guidance, controlled sponsor records, reviewer approval and representative workflow qualification. Existing E6(R2) section mappings require review before adoption of changed M11 numbering.
