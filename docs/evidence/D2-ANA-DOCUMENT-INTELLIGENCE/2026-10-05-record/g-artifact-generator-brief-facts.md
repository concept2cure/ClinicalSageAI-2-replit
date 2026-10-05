# g-artifact-generator-brief: facts relied on

Step: section rewrites from the AnA RI chat carry the section brief
(`server/services/ana-ri/artifact-generator.ts`). Finding 74(d), verified 2026-10-05.

## Regulatory facts

This step adds no regulatory statement of its own. The text the model receives
is whatever `resolveRequirements` (`server/services/ind/ctd/requirements-resolver.ts`)
renders from the existing record: `CTD_AUTHORING_GUIDANCE` via `renderSectionBrief`,
the ICH E3 tree via `renderE3Brief`, and the lifecycle types via `renderLifecycleBrief`.
Each of those carries its own basis. Their accuracy belongs to the steps that own
those records, not to this one.

| Fact the step assumes | Basis | Checked |
|---|---|---|
| ICH M4E(R2) governs the content of CTD Module 2.5 (Clinical Overview) and 2.7 (Clinical Summary). | **Recall.** Not read against ich.org text in this step. | n/a |
| ICH E3 governs the structure and content of a clinical study report. | **Recall.** Not read against ich.org text in this step. | n/a |

Neither fact appears in text this step writes. They are listed only because the
test fixtures name 2.5 and 2.7.3, and the record's entries for those codes cite them.

## Product facts (repository, verified 2026-10-05)

- `generateArtifact` has one caller: `POST /api/ana-ri/generate`
  (`server/routes/ana-ri/generate-execute.ts:83`). `section_code` is passed through
  as `sectionCode` and is documented on `ArtifactGenerationRequest` as a CTD section
  code for dossier placement.
- Before this change, `sectionCode` reached only governance (`ctdSection`,
  `hasPlacement`) and persistence (`placementTarget`). It never reached the model.
  See the red output: `g-artifact-generator-brief-red.txt`, 5 failed and 6 passed.
- Five of the eight action types are memos: `risk_memo`, `strategy_note`,
  `reviewer_question_brief`, `deficiency_preemption_memo` and `evidence_memo`.
  Only `rewritten_section`, `revised_artifact` and `attach_to_dossier` write a
  section's text, so only they get the brief.
- Resolver probe on 2026-10-05:
  - `'2.5'` gives an answer (ctd-section, "Clinical Overview").
  - `'2.7.3'` gives an answer (ctd-section, "Summary of Clinical Efficacy").
  - `'9.9.9'`, `'CH3'` and `'Device Description'` give `not_indexed`.
  - `'3'` gives a parent listing of Module 3 children.
  - `'1.14'` gives the US Module 1 listing with no jurisdiction label. Labelling
    US Module 1 as assumed belongs to the resolver's scope step, not this one.

## Known limits (not fixed here)

- The generator has no framework or program scope. A device project that sent the
  bare section number `3` would be shown the CTD Module 3 listing, labelled as
  "CTD section 3". The field's contract says the code is a CTD code. The label
  tells the reader which record answered. Gating by program framework needs the
  scope read in `docs/design/ANA_REGULATORY_RECORD.md` §7, which is not built yet.
- A Module 1 code is answered from the US tree. The message does not yet say that
  US was assumed, because the resolver does not report a jurisdiction yet
  (§4 invariant 1; resolver scope step).
