# G14 (screen half): the IND screen's briefing book is the project's meeting-package document in the editor

Row: D2 (W1). This is slice G14 of `docs/design/PARITY_WEAVE_VEEVA_BASICS_2026-10-29.md`, its reachable half. Benchmark: Weave lists briefing books as a document type.

## What already exists

- **The editor already starts the meeting package.** Built-in registry templates exist for all four meetings (`server/services/authoring/builtin-authoring-templates.ts`); `getBuiltinAuthoringTemplates()` was read on 2026-10-29:
  - `US_PRE_IND` is the "Pre-IND Meeting Request — preparation worksheet", with 8 sections: request letter, cover letter, background, nonclinical, clinical plan, CMC, questions for FDA, references;
  - `US_TYPE_A/B/C_MEETING` are meeting packages of 6 sections, the FDA meeting-package core (`lifecycle-record-outlines.ts` `meetingPackageOutline`).
- **Project Plan's start.** `TemplateStart` (`client/src/concept2cure/v2/surfaces/ProjectBiotechPlan.tsx`) opens a project's working copy of a template, creates one through `useAuthoringCreation`, or hands the template to AnA.
- **The IND screen built its own book.** Its briefing-book card (`IndLifecycle.tsx`, `wired['briefing-book']`) posted a form to `POST /api/ind-lifecycle/briefing-book` (`ind-briefing-book-service.ts`) and showed the result as a read-only preview with `canFile: false`. Nothing was saved, reviewed, signed or filed.
- **A second assembler.** `server/services/ana/briefing-book-core.ts` sits behind AnA's `assemble_briefing_book`. That tool belongs to the `submission-twin` surface, which RULE 2 gives no sessions.
- **A different document.** The Advisory Committee flow (`intelligence-questions/flows/briefing-book.ts`) is not this slice.

## What changed

- `IndBriefingBookStart.tsx` puts a meeting-type choice on the briefing-book card:
  - the choices are Pre-IND (Type B), Type A, Type B and Type C;
  - each maps to its own built-in registry template, never a shared template standing in;
  - the card renders `TemplateStart` (now exported) for the IND's project, so it opens the project's working copy or creates one, then opens it in the editor (`openImportedDocument`).
- An IND linked to no project says so, and starts nothing.
- The form-based assembler entry is removed from the screen, with its unused question parser and meeting-type list.

## Proof

- `client/src/concept2cure/v2/__tests__/indBriefingBookStart.test.tsx` passes 3 of 3:
  - the exact registry template is used and a shared one never is;
  - the meeting-type choice follows through to the template;
  - with no built-in template returned, the card says so and starts nothing.
- `indLifecycleDeliverables.test.tsx`:
  - the card renders the start for the IND's project, shows no "Assemble now", and calls no `/api/ind-lifecycle/briefing-book`;
  - an unlinked IND says so.
  - **Shown failing first:** both cases fail with `IndLifecycle.tsx` stashed (2 failed) and pass with the change.
- **Updated tests.** Two tests had pinned the old card's "Draft with AnA":
  - `indLifecycleTargetDate.test.tsx` now proves that button on the cover-letter card;
  - `indLifecycleScopeAndAffordances.test.tsx` asserts the unlinked briefing book offers no AnA button, since there is nothing to write into.

  The IND suites pass 40 of 40.
- **Gates.** `ci:launch-scope-api` (537 paths, none refused), the CSS gate and full `tsc` are clean.

## Owed (G14's other half)

- **Server leftovers.** `POST /api/ind-lifecycle/briefing-book` and `/briefing-book/pdf`, with `ind-briefing-book-service.ts`, now have no client caller. They stay until the IND demo lane confirms nothing else calls them.
- **The AnA assembler.** `briefing-book-core.ts` is behind an out-of-catalog AnA tool (`submission-twin`). Converging or deleting it is the founder's call under RULE 2.
- **Seeding.** The sponsor's questions are not seeded into the new document. The builtin template creates empty sections, and the governed section edit is where they are written.
