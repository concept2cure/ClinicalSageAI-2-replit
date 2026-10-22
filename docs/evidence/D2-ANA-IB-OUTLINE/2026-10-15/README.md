# D2 — AnA drafts an Investigator's Brochure to the platform's one IB outline (2026-10-15)

Lane `…session_01SuVLo2`.

## Before (measured at `5fc8ad1ba`)

A read-only map found **six IB section trees that clients can reach** and a seventh that is persisted but unused. The map is in this session's record of 2026-10-15, summarised below. Two of the reachable trees contradicted the canonical outline.

**The canonical outline** is `market-specs/document-template-library.ts` `investigators_brochure`. It has a typed basis, ICH E6(R3) Appendix A, labelled recall. The open-document brief and `get_document_template` both give it.

**AnA's chat drafting** (`ana-ri/document-templates.ts` `ind_investigator_brochure`) told the model it **must** use its own headings:
- "3. Physical, Chemical, and Pharmaceutical Properties", with "and Formulation" missing;
- a mandatory "References" chapter, which E6 does not define;
- a "Table of Contents" body section.

So an IB drafted in chat differed from the outline AnA gets everywhere else.

**The legacy `/api/concept2cure/templates` IND IB** headed section 6 "Guidance for Investigators", dropping "Summary of Data". It added a References chapter and filed the IB at CTD 5.3. A US IND files the IB at Module 1, 1.14.4.1.

`red/ib-one-outline.txt`: 3 of 3 red.

## After

Both are projected from the canonical outline:
- **The chat template's headings** are the outline's headings, in order. Its references cite the outline's basis label. Only the drafting guidance and word ranges are kept locally, keyed by the canonical section number.
- **The legacy template** is rendered from the outline by `server/routes/concept2cure-ib-template.ts`, filed at 1.14.4.1.

`green/ib-one-outline.txt`: 3/3. The 84 suites that load the templates, the IB surfaces or the chat template detection pass, 1,706 of 1,706. Typecheck shows 0 errors, and the lint ratchet against origin shows no file gaining a warning.

## Second slice (same day, measured at `3d8e30a41`)

Five more trees now take their body headings from the canonical outline. Red: `red/ib-trees-slice2.txt`, 4 of 4.

| Tree | Before | Now |
|---|---|---|
| IB builder (`ib-builder.ts`, the Investigator's Brochure surface) | Section 3 was titled its own way | Headings 1–6 come from the outline. Front matter, sub-sections and gap-engine inputs stay local until the outline carries them. |
| Authoring "Start from" seed (`template-seeds.ts` `crossagency_ib`) | Sentence-case copies, free-text source | Built from the outline. Codes 1–6 and orderings 100–600 are unchanged, so documents already started from it keep their codes. The source reference is the outline's basis label. |
| Projects blueprint (`project-bootstrap.ts` `ich_ib_sections`) | Module 5, named "ICH E6 §7" | Module 0 (a standalone document, as the protocol blueprint is), named "ICH E6(R3) Appendix A". Its persisted codes 1–9 are unchanged and remain a hand-on. |
| Medical-writing advisor (`medical-writing.ts`) | No Introduction, headings of its own | The outline's headings. RSI stays among its key requirements. |
| IND question flow (`ind-submission.ts` `ib_content_complete`) | Omitted the table of contents and "and Formulation" | Front matter, then the outline's numbered headings |

Green: `green/ib-one-outline.txt` 7/7. Every suite that loads the IB builder, the seeds, the blueprints, medical writing, the IND flow or the template library passes: 135 files, 2,535 of 2,535, the database-backed ones included. Typecheck shows 0 errors, and the ratchet against origin is clean.

## Third slice (the library's 24-hour hold lapsed, 21:45 UTC)

Red: `red/ib-library-slice3.txt`, 5 of 5.

**The canonical outline (`document-template-library.ts`).** It gains:
- `frontMatter`: title page, confidentiality statement and table of contents, with non-numeric codes. The wording comes from the IB builder.
- `subsections`: 4.1 Nonclinical Pharmacology, 4.2 Pharmacokinetics and Product Metabolism in Animals, 4.3 Toxicology, 5.1 Pharmacokinetics and Metabolism in Humans, 5.2 Safety and Efficacy, and 5.3 Marketing Experience (conditional).

Body codes 1–6 are unchanged, because the Authoring seed, the rule pack and saved documents carry them.

The M4E clinical overview outline gains 2.5.7 Literature References.

**The IB builder.** It takes its sub-sections (number, title and required) from the outline and keeps only the gap-engine inputs.

**The open-document brief.** For an IB it shows the front matter and each section's sub-sections.

Green: `green/ib-one-outline.txt` 12/12, plus the IB builder suite.

## Not done, recorded

Hand-ons, each from the map:

1. *(Done in the third slice, except Reference Safety Information, whose placement still needs the E6(R3) text.)* **The canonical outline lacked the E6 front matter and the sub-sections.** The front matter is title page, confidentiality statement and table of contents. The sub-sections are 4.1–4.3 and 5.1–5.3; `ib-builder.ts` has them. It was changed by another author within 24 hours of this commit, so it was not edited. Where Reference Safety Information sits must be confirmed against the E6(R3) text before it is added.
2. **`project-bootstrap.ts` `IB_SECTIONS` is the only persisted tree that diverges.** It numbers codes 1–9 with front matter in the body, so its "4" is Summary while every other tree's "4" is Nonclinical. It stamps module 5, where the registry places the US IB at M1. It is named "ICH E6 §7". Existing `project_sections` rows need a guarded, replay-safe code remap inside the migration set, under Rule 1.
3. *(Done in the second slice: `ib-builder` body headings and `template-seeds`.)*
5. **The phase-9 `c2c_rule_packs` IB row is labelled `ich-m4-v2.0`,** a wrong basis. It can be corrected only by a new version row.
6. **Lists and data still to align with the canonical headings:**
   - prose lists: `medical-writing.ts`, `ind-submission.ts` help text, `lifecycle-document-types.ts`, `authoring-guidance.ts` 1.14.4.1;
   - the demo IB pack, which has no Introduction and a dangling "Section 6" RSI;
   - the eval gold task.
