# D2: the top bar names a project opened by its link, and fits a phone (2026-10-31)

Two defects from the same walk of the shell in Chromium ("The UI doesn't work / design", the founder, 2026-10-31). The pool exhaustion found on that walk is in `../2026-10-31-db-pool-leak/`.

## What already exists

- **The project chip** (`client/src/concept2cure/v2/Shell.tsx`, `ProjectChip`). It names the open project by code, or by title, from the shell's one project channel (`client/src/concept2cure/v2/shellProject.ts`). A project opened by id alone shows "Open project" rather than an invented name.
- **Project home's partial publish** (`ProjectHome.tsx`, `updateShellProject({ productType })`). It already writes the product type onto the open project once its read answers. Projects (`Projects.tsx`) publishes the title and code when it opens a project.
- **The top bar's responsive rules** (`client/src/concept2cure/v2/styles/app-v2.css`). Below 1180 px, the search label, organisation name and outer crumbs go. There was no phone rule.
- Searches run: `ProjectChip`, `tb-proj`, `shellProjectName`, `updateShellProject`, `publishShellProject`, `.topbar`, `max-width:640px`, the walk's `390` viewports.

## 1. Project home opened by its link: the chip said "Open project"

**What the person saw.** After a reload or a shared link, Project home showed "BX-204 IND", and the top bar said "Open project" beside it. That reads as "no project is open".

**Cause.** Opened by its link, the project is in the shell by id only. Nothing named it afterwards, although the page had read the name.

**Fix.** Once the project's read answers for the open project (`prog.id === pid`, the guard every read on that page uses), Project home publishes its name and code onto the shell project through the existing `updateShellProject`. A project the shell already names keeps its name.

| File | What it shows |
|---|---|
| `01-red.txt` | `projectHomeNamesLinkedProject.test.tsx` before the fix: the linked project is never named. The two guard cases pass, as they should. |
| `02-live-chip.txt` | Live, in Chromium: Project home opened by its link. The chip reads "BX-204", and still does after the rail's Vault entry. |
| `03-mutations.txt` | Three mutations, each caught by its own case: the read's project not compared with the open one, an existing name overwritten, nothing published. |

## 2. At phone width, the top bar was wider than the screen

**What the person saw.** At 390 px, Get help was cut off at the right edge (`topbar-390-before.png`).

**Cause.** The bar's ten items and their 12 px gaps came to 344 px in a 334 px bar.

**Fix.** At 640 px and below:
- the gaps and padding close up;
- the ⌘K hint goes, since a phone has no keyboard;
- the crumb goes, since the page's own heading names the screen;
- the project chip's name is hidden visually but kept for screen readers and its title.

The first attempt removed only the gaps and the hint. The freed space then showed "H…" and "No …" fragments, so the crumb and the chip label were taken out too.

| File | What it shows |
|---|---|
| `04-topbar-390-before.txt`, `topbar-390-before.png` | Before: content 344 px in a 334 px bar; Get help ends at x=400 on a 390 px screen. |
| `04-topbar-after.txt`, `topbar-*-after.png` | After, at 390, 360 and 320 px on Home and at 390 px on Project home: every control within the screen, and no clipped text. |

Desktop is unchanged: every rule is inside `max-width:640px`.

## Also run

- Project home and shell client suites: 417 of 419 pass.
- **The two failures are on trunk without this change** (run against `HEAD`'s `ProjectHome.tsx`, same result):
  - `projectHomeQuality.test.tsx`: "counts this project's open CAPAs…" expects a GET it does not see.
  - `projectHomeOwnershipBoundary.test.tsx`: "keeps one fenced workspace during pending adoption…" cannot find the "Start a conversation in" textbox.

  They belong to lanes that changed Project home within the last hour (`bd144ed165` and the ownership-boundary lane), and are left to them.
- ESLint: no errors; the warning ratchet reports no change.
