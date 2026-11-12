# The Library's find bar sits across the structure and the list, so documents are on the first screen

2026-11-12. Session `…01KnUGoX3g` (the Vault parity lane). Plan package F1 (the change includes stylesheet rules).
Completes `client/src/concept2cure/v2/surfaces/Vault.tsx`.

## The defect

The founder, 2026-11-10: "The vault UI seems to be lacking in a lot of ways." P-122: a person's own work is on the
first screen.

Opened at 1440 by 900 on the demo's IND project, the Vault's Library showed no document without scrolling. The first
document's row began at 853px. Before it came the search, the two scopes and six filters, all inside the list's
column (446px wide), where the filters took three rows; at 1280px they took five.

## What already exists

| Piece | Path | What it does | What it did not do |
|---|---|---|---|
| The search row | `surfaces/Vault.tsx` (`vd-find`): the search, Saved views, Earlier versions, All my projects | One state with AnA's `vault.search` | It sat inside the list's column |
| The filters | `surfaces/Vault.tsx` (`VaultFindFilterRow`, `vd-facets`): Type, Filing, Classification, Evidence kind, Review, CTD section | Each narrows the list; counts from a verified read | Each select was as wide as its longest option, so two fitted a row |
| The three panes | `styles/misc-surfaces-v2.css` (`vd-browse`: the tree and the list), `app-v2.css` (`wa-split`: the record) | Structure, list, record | Nothing spanned the tree and the list |

No control is added, removed or renamed. Searches run: `vd-find`, `vd-facets`, `vd-facet`, `VaultFindFilterRow`,
`vd-browse`, `vd-list`.

## What changed

- `surfaces/Vault.tsx`: the search row, the saved views panel and the filters move, as they are, into a bar
  (`vd-findbar`) that is the first child of the browse grid. The list keeps where it is (the folder), the binder's
  note, the prompts and the documents.
- `styles/misc-surfaces-v2.css`: the bar spans both columns. Inside it the filters are a grid that fits as many
  to a row as there is room for, each at least 104px.

Nothing is hidden or put behind a disclosure (P-122): every control is where a person looks first, in less room.

## Evidence

| File | What it shows |
|---|---|
| `01-measured.txt` | Before and after in the running app. At 1440 by 900 the first document moves from 853px to 708px and 2 of 10 are wholly on the first screen (was 0); the six filters take 1 row (was 3). At 1920 by 1080: 6 documents (was 5). At 1280 by 800 the first document moves from 1124px to 904px. On a phone from 1131px to 1013px. No horizontal scroll, no console error |
| `02-red.txt` | The new pin (`vaultFindBar.test.tsx`, 2 cases) against the Library as it stood: 2 fail |
| `03-green.txt` | The same 2 pass; every Vault client suite, 71 files and 796 cases; the stylesheet gates |
| `04-before-1440x900.png`, `05-after-1440x900.png`, `06-after-390x844.png` | The Library before and after |

## Second step, the same day: 1280 by 800

At 1280 by 800, with the record docked, the list's column is 308px. The bar across the tree and the list still took
two rows of filters there, and above the first document (904px) the binder's note repeated the outline the folder's
line already named, and each confirm prompt said its folder twice: in the sentence and again as the control's label.

- `surfaces/Vault.tsx`: the bar moves, as it is, from the browse grid to the Library's grid (`vd-grid`), so it spans
  the structure, the list and the record. Docked, the record starts under it. The binder's note says "From the
  filing's outline, version …" when the folder's line above already names the outline; on any folder inside the
  binder it still names it.
- `surfaces/VaultConfirmSuggested.tsx`: the control beside "N suggested in <folder>, awaiting confirmation." reads
  "Confirm…" (it asks for a reason next); its accessible name keeps "Confirm N suggested in <folder>". For one
  filing the reason's label says "this filing" (it said "these 1 filings").
- `styles/misc-surfaces-v2.css`: the sentence and its control share a line; below 1280px, where the Library's grid is
  not split, the bar keeps a 16px space under it. `surface-text-ramp.css` is regenerated (trunk's was stale).

Nothing is removed, hidden or renamed for a reader of the page.

| File | What it shows |
|---|---|
| `07-measured-1280.txt` | At 1280 by 800 the first document moves from 904px to 699px and is wholly on the first screen (was none). At 1440 by 900, 3 of 10 (was 2); at 1920 by 1080, 7 (was 6); on a phone the first begins at 894px (was 1013). The dark-theme walk of every Library view |
| `08-red-1280.txt` | The two pins (`vaultFindBar.test.tsx` now asks for the Library's grid; `vaultConfirmSuggested.test.tsx` a new case) against the surfaces as they stood: 2 fail |
| `09-green-1280.txt` | The same pass; every Vault client suite (73 files, 803 cases); the stylesheet gates; the lint ratchet |
| `10-after-1280x800.png`, `11-dark-1440x900.png`, `12-dark-confirm-form.png` | The Library at 1280 by 800, and in the dark theme |

## Not done here

- On a phone the first document is still below the first screen (894px of 844): the page's heading wraps to four
  lines and the six filters take two rows. The heading is the shared page header's, not this lane's.
- The tree begins beside the list, under the bar.
