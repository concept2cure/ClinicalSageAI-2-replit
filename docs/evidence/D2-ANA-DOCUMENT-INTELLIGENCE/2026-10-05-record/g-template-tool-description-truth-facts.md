# g-template-tool-description-truth — facts relied on

Step: follow-up F5. `get_document_template`'s description
(`server/services/ana/submission-center-tool-defs.ts`) said that every outline it
serves is a "factual document spine from published guidance". This change states
no new regulator fact. Every claim it makes is about where the platform's own
outlines come from, so each basis below is a code path that was read on
2026-10-05, not a regulator text.

| # | Claim in the description | Basis | Kind |
|---|---|---|---|
| C1 | `clinical_study_report` is read from the ICH E3 tree. | `document-template-library.ts`: `sections: e3TopLevel().map(e3TemplateSection)`. Proven in the test: the sections equal `e3TopLevel()` number and title. | code |
| C2 | `smpc` is read from the QRD SmPC record. | `document-template-library.ts`: `SMPC_QRD_SECTIONS.filter((s) => s.depth === 0)`. Proven in the test: every number and heading is a `SMPC_QRD_SECTIONS` entry. The record carries its own basis per heading. | code |
| C3 | `pbrer` is an "interim copy of the ICH E2C(R2) numbering". | `document-template-library.ts`, comment on `pbrer`: "Interim hand copy of the E2C(R2) numbering until one canonical E2C(R2) tree exists". Its heading facts are in `docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-04-depth/b1-template-library-facts.md`. | code |
| C4 | `investigators_brochure` and `risk_management_plan` are lists kept by hand. | `document-template-library.ts`: literal `sections` arrays, with no record import. | code |
| C5 | The `cover_letter` headings are "platform headings, not a regulator's text". | `document-template-library.ts`: five literal headings with no source cited for them. The basis cites only the regional Module 1 placement (FDA 1.2, EU 1.0; `server/services/regional-ctd-templates.ts` lines 83 and 164). | code |
| C6 | Every other outline (QOS, nonclinical overview, clinical overview, clinical summary, 510(k) summary, GSPR, PER, IMPD) is kept by hand against its cited basis. | `document-template-library.ts`: literal `sections` arrays. | code |
| C7 | (Ordering, not a claim to AnA.) The presentation rule, the `template_id`/`family` usage and the record-derived list sit ahead of the hand-kept list, and the whole description is 972 characters. | `server/services/ai-gateway/gateway.ts:919` `OPENAI_MAX_TOOL_DESCRIPTION_CHARS = 1024`; line 1079 trims a longer description to 1023 characters plus an ellipsis on OpenAI-compatible providers. `server/services/ai-governance/approved-models.ts:152-156` lists gpt-4o as the "first OpenAI fallback when Anthropic is unavailable". Fix round 1: the round-0 description was 1712 characters and was cut at `investigators_broch`. | code |

## Where this differs from the step text

The plan step said the description should name the PBRER (E2C(R2)) and "the
regional cover letters" as read from the canonical record. On 2026-10-05 neither
one is:

- The PBRER is the interim hand copy described in C3. It is derived from the tree
  in `g-periodic-chat-copies` (batch 3), after `g-periodic-safety-report-trees`
  (batch 2).
- The cover letter's headings are hand-written (C5). Only its regional placement
  comes from a record.

The description must not overstate, so it names both as kept by hand. Once those
outlines derive from their records, `TEMPLATE_OUTLINES_FROM_RECORD` gains the id.
The test then requires a proof against the record for that entry.

## Recall

None used.
