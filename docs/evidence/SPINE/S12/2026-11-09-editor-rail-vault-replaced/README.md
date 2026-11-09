# S12: the editor's Sources rail names a replaced Vault version

**Package:** S12 (founder decisions P-83, P-109 with its third clarification). The flag is placed in D4's one editor,
under the coordinating session's terms of 2026-11-09: name the lines first, and stay out of `RichSectionEditor.tsx`
and `rich-section-editor.css`. **Plan:** D4. **Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`.

The previous slice (`../2026-11-09-vault-deliverable-flags-sections/`, `c9f0a3e35`) named, on the project's changes
and Evidence, a section drafted from a Vault version that a later approved version replaced. This slice says the same
in the editor, where the section is worked.

## What already exists (RULE 3)

| Piece | Path | Does | Did not |
|---|---|---|---|
| The Sources rail | `editor/DocumentWorkbench.tsx` (`rail === 'sources'`, `sourceStateLabel`) | Lists the section's data-room citations, with "Source has been replaced since cited" for a superseded one | Lists no Vault-drafted spans |
| Data Origins | `editor/RichSectionEditor.tsx` (`lineage`) | Shows Vault spans' provenance for selected text, with a state that compares only the span's own version hash | Never considers a later version. That file is the coordinating session's, and this slice does not touch it |
| The project's changes | `GET /api/c2c/projects/:id/source-changes`, `vaultChanges` (`vault-citation-changes.ts`) | The program's sections whose Vault version a later approved one replaced, each with `approvedVaultId` | — |
| "Open in Vault" | `vaultTarget.ts` `setVaultTarget`, then `onNav('vault')`, as `FileToVaultDialog.tsx` does | Opens the Vault on one named document | — |

## What changed

There is no new route, panel, card or service.

- **`editor/SectionVaultReplacements.tsx`**, a split rendered in the rail. It reads the project's changes and keeps
  this section's `vaultChanges`. Each one becomes a row in the rail's own `.cmt` markup:
  - the Vault document's title;
  - the rail's words, "Source has been replaced since cited";
  - "Drafted from v1.0 · v3.0 is approved";
  - **Open in Vault** on the approved version.

  It draws nothing when nothing applies. A failed or malformed read says "Vault citations could not be checked for this
  section", never "none".
- **`editor/DocumentWorkbench.tsx`**: one import, and one line at the foot of the Sources rail. It sits after the
  rail's state ternary, so a failed data-room citations read does not hide it; the two are independent reads. This
  moved from the place first named to the coordinating session (inside the citations' success branch) after the walk
  found every C2C-101 section's citations read refused locally (below).

## Red first

- **The component.** `editor/__tests__/sectionVaultReplacements.test.tsx` has three cases:
  1. the row's words and Open in Vault, which calls `setVaultTarget` with the approved version, then `onNav('vault')`;
  2. nothing drawn for another section's row, and no read without a project;
  3. a failed read and a malformed read each say they could not be checked.

  All three pass (`ui.log`). On trunk the component does not exist.
- **The editor's suites.** 88 of 89 files pass. The one failure, `sourceAssemblyOwnership.test.tsx` ("does not replace
  an unrelated valid target…"), fails identically with trunk's `DocumentWorkbench.tsx`, so it is not this change's.
- **Checks.** Typecheck reports 0 errors. ESLint gained no warning.

## In the running app

`walk.cjs` (`walk.log`, `walk.json`, `screenshots/`) runs on C2C-101 at 1440 light.

**What is seeded.** It seeds as `../2026-11-09-vault-deliverable-flags-sections/walk.cjs` does, and that README says
why: v1, v2 in review, v3 approved, and a span in section 2.5.3 of the Module 2.5 Clinical Overview drafted from v1.
It first retires the spans its own earlier runs seeded (`deleted_at`, as the lineage gate retires a span), so the rail
holds this run's row alone.

1. The editor opens the document and section 2.5.3. More → Sources opens the rail.
2. The rail shows one row: "Drug substance specification · Vault — Source has been replaced since cited — Drafted from
   v1.0 · v3.0 is approved — Open in Vault" (`sources-rail-1440-light.png`).
3. Open in Vault opens the Vault on that document. Its detail names this run's `ds-spec-<run>-v3.pdf`, "Approved",
   "v3.0 · 3 versions" (`open-in-vault-1440-light.png`).

With trunk's `DocumentWorkbench.tsx`, the walk stops at step 2: no row (`red.log`, `walk-red.json`).

## Found

**Every C2C-101 section's data-room citations read is refused locally.** `GET /api/authoring/sections/:id/sources`
answers 503 `NATIVE_SOURCE_ACCESS_UNAVAILABLE` ("Current Quality evidence could not be verified"), raised by
`record-source.ts` `nativeAdmissionFailure` for a native Quality source in the project's data room. The rail then says
"Couldn't load this section's sources", which is the honest state. This is the Quality lane's, reported to the
coordinating session. It is not caused by this change: it is the same with trunk's editor.
