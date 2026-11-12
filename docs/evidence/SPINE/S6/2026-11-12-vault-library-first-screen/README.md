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

## Not done here

- At 1280 by 800 no document is wholly on the first screen yet (the first begins at 904px): the page's heading,
  its three questions to AnA and the tabs take the first 330px, and the folder's line, the binder's note and the
  two confirm prompts another 250px. Those are words and actions a person uses; none was moved here.
- The tree begins beside the list, under the bar, so it starts two rows lower than it did.
