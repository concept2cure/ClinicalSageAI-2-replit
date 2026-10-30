# P-73, slice 2: the editor's "Draft from sources" drafts against the application the project records

**Design:** `docs/design/TRIAL_APPLICATION_DRAFTING_2026-10-30.md`, slice 2.
**Rows:** W3 / D2, D4.

## What already exists

- **The editor's route.** `POST /api/authoring/sections/:id/ai/draft` (`server/routes/authoring.router.ts`)
  built its prompt with `buildSectionDraftPrompt` (`server/services/authoring/authoring-draft-template.ts`). It
  used a region label, which the panel (`AuthoringAiDraft.tsx`) sends as FDA unless it is changed, plus the saved
  template.
- **What it ignored.** It never read the project's recorded application, or the requirements resolver that AnA's
  batch drafting uses:
  - `resolveDraftSubmissionType` (`server/services/ana/draft-submission-context.ts`);
  - `resolveDraftingRequirements` (`server/services/ana/AnaDocumentDraftingService.ts`).
- **The consequence.** A Health Canada CTA section was requested as "FDA regulatory content", with no Canadian
  requirements at all.

## The change

- **One function, two callers.** `recordedFilingDraftContext` reuses those two functions and the registry entry.
  It adds no resolver.
- **What the prompt now carries.** "RECEIVING APPLICATION ON RECORD: <application> (<id>), filed with <agency>",
  followed by that application's section requirements from the canonical record or blueprint. For example,
  Canada's 1.2.1 now gives the signed HC/SC 3011 form. The UK's says it has no Module 1 entry, rather than
  passing as FDA content.
- **When the requested region differs** from the application on record, the prompt says so. It asks for the
  receiving jurisdiction to be confirmed, and switches neither silently. The person's chosen region still names
  the writing region. A GLOBAL section with an EMA preference keeps EMA; an existing test pins that.
- **When nothing is recorded,** the prompt carries "SUBMISSION REQUIREMENTS STATUS: UNASSESSED", the same note AnA
  uses.
- **When the section's saved template records its own region** (a Japanese section in a global program), that
  region governs, and the project's application is not applied to it.
- **Response metadata** now carries `submissionType` and `requirementsSource`.
- **Test fixture.** `_authoring-canvas-fixture.ts` gains the `regulatory_programs.metadata` column that
  production has. The resolver reads it and fails closed without it.

## Red, then green

- **Red** (`slice2-red.txt`): 4 of 4 failed against the unfixed route. Every section was asked for as "FDA
  regulatory content", with no recorded application.
- **Green** (`slice2-green.txt`): 235 of 235, across the new test and the 13 existing editor-draft and assembly
  suites.
- **Mutations** (`slice2-mutations.txt`): all four turn the tests red.
  1. The requirements are dropped.
  2. The mismatch note is dropped.
  3. The template's region is ignored. This mutation first survived, so an assertion was added to the Japanese
     section test.
  4. The UNASSESSED note is dropped.
- **Pre-existing failures.** `authoringFromDraft.pglite.integration.test.ts` fails 3 tests identically on trunk
  without this change.

## Not done here

- **The panel's default region.** It still opens on FDA. Making it open on the recorded application's agency is a
  client follow-on.
- **Other callers.** Assembly drafting and `/api/claude/draft` are not yet on the recorded context.
