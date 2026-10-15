# g-submission-context-block — facts relied on (2026-10-05)

Step: one submission context block for IND, NDA and BLA chats, called from both
chat doors (`server/services/ana/submission-context-block.ts`).

## Regulator facts

| # | Fact as the block states it | Basis | Source | Checked |
|---|---|---|---|---|
| 1 | 21 CFR 312.23(a)(5) requires the Investigator's Brochure in an IND "if required under § 312.55". | regulator-text | https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-312/subpart-B/section-312.23 (read through WebSearch result text; WebFetch to regulator hosts is blocked here) | 2026-10-05 |
| 2 | § 312.55(a): before the investigation begins, a sponsor (other than a sponsor-investigator) gives each participating clinical investigator an IB containing the information in § 312.23(a)(5). So the IB is required for every sponsor except a sponsor-investigator. | regulator-text | https://www.ecfr.gov/current/title-21/chapter-I/subchapter-D/part-312/subpart-D/section-312.55 (WebSearch result text) | 2026-10-05 |
| 3 | The IB is filed at FDA eCTD Module 1 heading 1.14.4.1; investigational drug labeling at 1.14.4.2. | recall (FDA eCTD M1 specification v2.3), consistent with the canonical record `CTD_AUTHORING_GUIDANCE` entries 1.14.4.1 / 1.14.4.2 (`server/services/ind/ctd/authoring-guidance.ts`) | not re-read against fda.gov in this step | — |

The verifier noted that `authoring-guidance.ts:548` says the IB is "required by
21 CFR 312.23(a)(5)" without the § 312.55 condition. The new block keeps the
condition. That file is not in this step's scope; it is left for the step that
owns the overlay.

## Platform facts

- The body of each block is `renderLifecycleBrief('ind_initial' | 'nda' | 'bla')`
  (`server/services/ind/ctd/section-brief.ts`), from `LIFECYCLE_DOCUMENT_TYPES`.
  No second list of sections.
- Every tool the block names (`get_document_section_requirements`,
  `draft_authoring_document`, `batch_draft_sections`, `plan_ind_module_authoring`,
  `plan_submission_from_database_lock`) is classified `inScope` in
  `server/services/ana/ana-launch-scope.inventory.json`. The test checks every
  backticked tool name against that inventory.
- The block does not restate the NDA/BLA order. It points at
  `plan_submission_from_database_lock`, which reads it from `SUBMISSION_CHAIN`
  (`server/services/regulatory/submission-chain.ts`). The chain puts the Module 5
  reports and ISS/ISE before the 2.7.x and 2.5 summaries. The old block's
  "Module 1 first, then 2-5" contradicted that.
- No tool reports a project's IND section progress. `get_ctd_module_home` returns
  structure only. The IND block says so instead of naming a non-equivalent tool.

## Behaviour change: only a declared type gets a block

- **Old trigger:** the context `productType` was IND, NDA or BLA, **or** the
  orchestrator's detected type was IND.
- **New trigger:** the declared type only. That is the request's
  `submission_type`, then `context.productType`, then `context.submissionType`.
  Accepted values are IND/NDA/BLA or US_IND/US_NDA/US_BLA, case-insensitive.
- **Why detection is not read:** the detected type comes from
  `detectSubmissionType` / `resolveToDeficiencyType`, which fold CTA and CTN into
  `ind`, and MAA, NDS and JNDA into `nda`
  (`server/services/ana-ri/orchestrator.ts` SUBMISSION_PATTERNS). Reading it would
  give an EU CTA or MAA chat a US IND or NDA block. That is a cross-jurisdiction
  fallback, which invariant 1 of `docs/design/ANA_REGULATORY_RECORD.md` §4
  forbids.
- **What else gets no block:** supplements, amendments and every other type, as
  before.
- **Effect:** a chat that has no declared type but mentions "IND" in the message
  no longer gets the block. The old block it got there sent AnA to two tools that
  return 401 on every call.

## Out of scope (other steps)

- **Tool deletion:** `ind_generate_section` and `ind_get_status` are deleted in
  `g-retire-ind-generate-tools`. That step depends on this one. This block no
  longer names them, and the parity test refuses either name in either chat door.
- **The `/api/ind-generation` generator:** stays (DECISIONS.md #8).
