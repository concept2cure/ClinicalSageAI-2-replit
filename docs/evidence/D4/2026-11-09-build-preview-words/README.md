# The build preview says what the build will do (J3 R9, D4, 2026-11-09)

**The finding.** J3 human test R9 (`docs/evidence/HUMAN-TEST/J3/README.md`) found two wrong lines in the build
preview:
- Every kept section said "Preserve existing section and text", even one with no text.
- Every draftable row, with AnA on, said "AnA can prepare a candidate only if this saved section is empty". The preview
  knows which sections are empty, so the line told the person nothing, and for a section with text it read as if AnA
  might draft it.

## What already exists (RULE 3)

- **`editor/AuthoringAssemblyBuild.tsx`, `AssemblyPlanRows`.** It renders the server's plan, one row per section. It is
  the only place this copy appears. No test pinned it.
- **`server/services/authoring/authoring-assembly-plan.ts`, `plannedRow`.**
  - A saved section's row is `disposition: 'preserve'`, and its `content` is the saved text.
  - A missing section's row is `'append'`, and its `content` is the template's stored text.
  - So `row.content` is what the section holds once built, either way.
- **`editor/useAuthoringAssemblyBuild.ts:98–100`.** After a build, AnA candidates are prepared only for rows that are
  `aiDraftable` and whose built section is empty.

Nothing new is added. The preview now states, per row, what those two files already do.

## The change

`assemblyRowWords(row, withAna)` is exported from the same file and used by `AssemblyPlanRows`.

**What happens to the section:**

| The row | The preview says |
|---|---|
| Saved, with text | Kept as saved, with its text |
| Saved, empty | Kept as saved; it has no text yet |
| Added, template text | Added, with the template's stored text |
| Added, no text | Added empty; scientific content is missing |

**The AnA line, shown only with AnA on:**

| The row | The preview says |
|---|---|
| Not draftable | AnA drafting is unavailable: *its reason* (unchanged) |
| Will be empty after the build | AnA prepares a candidate for it, for you to review. |
| Will hold text | It holds text, so AnA prepares no candidate for it. |

## Red, then green

**At HEAD** (`red-at-head.txt`), two checks failed:
- A new case in `editor/__tests__/workbenchAssemblyBuild.test.tsx` mounts the real `DocumentWorkbench` and previews a
  build with AnA. The kept section with saved text read: "Preserve existing section and textAnA can prepare a candidate
  only if this saved section is empty."
- `editor/__tests__/assemblyPlanRowWords.test.tsx` covers all four dispositions, the AnA lines, and the rule that a
  section is never said to hold text it does not hold. It failed because the function did not yet exist.

**Green** (`green.txt`): the six assembly suites pass, 153 of 153.

## Gates

- **ESLint:** clean on the three files.
- **Warnings:** the new case sits in its own `describe`, so the existing block stays under 100 lines and adds no warning.

**What this is not.** It is not the running-app walk. Seeing the preview's words in the seeded app is still part of
the D4 acceptance (D4.O).
