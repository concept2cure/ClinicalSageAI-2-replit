# Filing-spine design review, item 7: one name for each act and each state

Launch row **D2**. The review left this item open so it could be done in one pass with F22's picker. F22 still waits on the founder. Each part below stands without the picker, so it is done here; the picker's own labels are left to F22.

## What changed

| Before | After | Where |
|---|---|---|
| The Vault's "Place into submission" (button, dialog title, the File to vault hint) beside the editor's "Place into filing" for the same act | "Place into filing" everywhere | `Vault.tsx`, `VaultPlaceIntoSubmission.tsx`, `FileToVaultDialog.tsx` |
| The placement tooltips: "the snapshot is taken from saved content", "Snapshot the saved document…" | "the filing copy is taken…", "Take a filing copy of the saved document…", the name F17 gave it | `AuthoringPlaceIntoFiling.tsx` |
| A market's summary and line: "Flat Module 1, no channel", "No outline; no channel" | "…no transmit channel" | `server/services/regulatory/market-support.ts` (the longer details already said what the channel is for) |
| At 375px a region option clips its last clause, the part that says what the platform cannot do | The chosen region's full statement (the summary and the line, `marketSupportText`) is in the field's live description and follows the choice | `NewSubmissionForm.tsx` |

**Already done.** "Programme" no longer appears in any user-visible string in `SubmissionCenter.tsx` or `Projects.tsx`; only identifiers carry it.

**Left.** "Flat/Structured Module 1" stays. It is the accurate regulatory term, and a select label that names 12 options at once belongs to F22's picker.

## Red, then green

| File | Before |
|---|---|
| `red/place-into-filing-pins-red.txt` | 50 tests pinned the old Vault label. They are amended to the new one. |
| `red/no-transmit-channel-pins-red.txt` | 9 tests pinned the old summary or line. They are amended in place, with a dated note in `market-support.test.ts`. |
| `red/region-statement-red.txt` | 1 of 1 fails. The field did not state the chosen region. `newSubmissionRegionStatement.test.tsx` is new. |

In `green/`:
- `vitest.txt`: the suites above.
- `wide-summary.txt`: every suite that read either string, plus `server/services/ana`. 7,907 tests pass; the 2 failures are in `draft-authoring-document-tool.pglite.integration.test.ts`, red on trunk without this change (another lane's).
- Copy and scope gates green. `npm run typecheck`: 0 errors. No lint count changed.

FILING_SPINE §3's table and its F19 examples carry the new wording.
