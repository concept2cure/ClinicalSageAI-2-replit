# RULE 2 / G4: the consistency check compares the saved text, not the text in the call

Row: D2 (W1). This is slice G4 of `docs/design/PARITY_WEAVE_VEEVA_BASICS_2026-10-29.md`. Benchmark: Weave AutoReview.

## What already exists

- **The comparison.** `runConsistencyCheck` (`server/services/truth-engine/truth-engine-service.ts`) and its deterministic comparator, `figure-consistency.ts`. Since 2026-10-01 the verdicts are the engine's, not a model's.
- **Two callers.** AnA's `check_consistency` (`server/services/ana/AnaToolExecutor.ts`) and `POST /api/submissions/:id/consistency` (`server/routes/submissions.ts`). Both passed the caller's `{ ref, text }` through as the claim and the sources.
- **The findings screen.** `consistency_findings`, shown by `SubmissionConsistency.tsx` (2026-10-26).
- **The saved-text store.** `authoring_sections`, the editor's sections, under `authoring_documents.client_program_id`. Plain text comes through `htmlToPlainText` (`leaf-pdf-renderer.ts`), the reduction the leaf renderer uses.

## The defect

A finding recorded against a submission could describe text that was not in it. The call's text was graded, whatever the dossier said. This is the Rule 2 class measured in `docs/evidence/RULE2/2026-10-26-model-figures-audit/`.

## What changed

- `runConsistencyCheck` takes `{ sectionId }` for the claim and for each source.
- It reads each section's saved text itself:
  - the query is tenant-scoped on both the section and its document;
  - a section of another project than the submission's is refused, as is one not found in the organization;
  - a claim section with no saved text is refused.
- A finding's ref names the section: its code, its title, and `[id]`. The audit row lists `claimSection` and `sourceSections`.
- AnA's tool takes `section_id`.
  - A call that names text instead is refused, and the refusal says text is not compared.
  - When the call also supplies text, the text is ignored, and the reply says so (`suppliedText: 'ignored'`).
- The route takes `sectionId` (uuid).
  - A body naming text only is refused (400).
  - A body that also supplies text gets `X-Consistency-Supplied-Text: ignored`.
- The tool's description and schema, its governed-write note and the medical-writing skill line now say the same.

## Proof

- **Shown failing first.** `consistency-deterministic.test.ts` has the case "compares the saved section, not the text in the call". The saved claim says 186 and the call says 100, and the finding must be on 186. It fails at HEAD with the engine and handler stashed (1 failed) and passes with the fix.
- **New cases, all passing.**
  - A section of another project is refused and nothing is written.
  - A section missing from the organization is refused.
  - A text-only source is refused before any write.
  - The audit row names the sections.
- **The route.** `submissions-consistency-audit-outcome.test.ts` gains two cases:
  - the engine receives section ids only, with the "ignored" header;
  - a text-only body is a 400.
- **The SQL.** The section read was run on PGlite through drizzle's `sql` and `sql.join`. It returns only the tenant's section, so another tenant's id reads as not found.
- **The rest.** `server/services/truth-engine`, the route suite and `submission-center-tools.test.ts` pass, 573 tests.

## Owed

- G5 is next in the same lane: the CTD module QC routes also grade the request body, and need the same fix before they are reached.
