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

## Not done, recorded

Hand-ons, each from the map:

1. **The canonical outline lacks the E6 front matter and the sub-sections.** The front matter is title page, confidentiality statement and table of contents. The sub-sections are 4.1–4.3 and 5.1–5.3; `ib-builder.ts` has them. It was changed by another author within 24 hours of this commit, so it was not edited. Where Reference Safety Information sits must be confirmed against the E6(R3) text before it is added.
2. **`project-bootstrap.ts` `IB_SECTIONS` is the only persisted tree that diverges.** It numbers codes 1–9 with front matter in the body, so its "4" is Summary while every other tree's "4" is Nonclinical. It stamps module 5, where the registry places the US IB at M1. It is named "ICH E6 §7". Existing `project_sections` rows need a guarded, replay-safe code remap inside the migration set, under Rule 1.
3. **`ib-builder.ts` `IB_STRUCTURE`** should take number, title and required from the canonical record, keeping only its gap-engine inputs. Its codes are not persisted.
4. **`template-seeds.ts` `IB_OUTLINE`** should be built from the canonical record. Its codes 1–6 already match.
5. **The phase-9 `c2c_rule_packs` IB row is labelled `ich-m4-v2.0`,** a wrong basis. It can be corrected only by a new version row.
6. **Lists and data still to align with the canonical headings:**
   - prose lists: `medical-writing.ts`, `ind-submission.ts` help text, `lifecycle-document-types.ts`, `authoring-guidance.ts` 1.14.4.1;
   - the demo IB pack, which has no Introduction and a dangling "Section 6" RSI;
   - the eval gold task.
