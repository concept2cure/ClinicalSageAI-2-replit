# The Vault's folder names, document titles and field lines are read whole

2026-11-11. Session `…01KnUGoX3g` (the Vault parity lane). Plan package F1 (the stylesheet is not an S6 path).
Completes `client/src/concept2cure/v2/styles/misc-surfaces-v2.css`.

## The defect

The founder, 2026-11-10: "The vault UI seems to be lacking in a lot of ways." And, 2026-11-11: "focus entirely on
getting what we built surfaces correctly on the UI and working for GA."

Opened at 1440px on the demo's IND project, the Vault's Library cut almost every name a person needs to read:

| At 1440px | Cut to an ellipsis |
|---|---|
| Folder names in the binder tree ("Module 1 · Admini…", "1.1.1 Form FD…", "3.2.S.1 Gener…") | 102 of 118 |
| Document titles in the list ("[Demo · Biotech] Investigator's Bro…") | 6 of 10 |
| A document's line of fields (type, versions, review stage, owner, date) | 5 of 10 |

On a 1920px screen the figures were the same: the page was held at the 1120px reading width, with empty margins
either side of a tree 220px wide. A person could not read their own filing structure without hovering each row.

## What already exists

| Piece | Path | What it does | What it did not do |
|---|---|---|---|
| The binder tree | `surfaces/Vault.tsx` (`vd-tree`, `vd-folder`, `vd-flabel`) | The filing's outline as folders, each with its count | Its label was one line with an ellipsis |
| The document list | `surfaces/Vault.tsx` (`vd-list`, `vd-row`, `vd-row-t`, `vd-row-s`) | Title, filing status, and one line of fields | Title and fields were one line each with an ellipsis; `coverage-v2.css` also sets the one-line title for other lists |
| The three panes | `styles/misc-surfaces-v2.css` (`vd-browse`: 220px tree, list), `app-v2.css` (`wa-split`: 360px record; `page-inner`: 1120px) | Structure, list, record (D6 §C.3) | Nothing let the Vault use a wider screen |

No component or markup changes. Searches run: `vd-flabel`, `vd-row-t`, `vd-row-s`, `vd-browse`, `vd-wrap`,
`text-overflow`, `220px` across `client/src/concept2cure/v2/` and `scripts/ci/`.

## What changed

Rules in `styles/misc-surfaces-v2.css` only.

- A folder's name wraps. The caret, icon and count keep their size and sit on the name's first line.
- A document's title and its line of fields wrap. The title's rule is ranked above the one-line title in
  `coverage-v2.css`, which the other lists keep.
- The Vault's page may grow to 1520px, and the tree takes part of the room (`clamp(220px, 34%, 340px)`). At 1280px
  the three panes are as they were; at 1440px the tree is 242px; at 1920px the tree is 340px and the list 692px.

This shows more of a person's work and removes nothing (P-122).

## Evidence

| File | What it shows |
|---|---|
| `01-measured.txt` | Before and after, in the running app at 1440, 1920, 1280 and 390px. After: 0 folder names, 0 titles and 0 field lines cut at every width; no horizontal scroll; every Vault tab and the no-project page checked |
| `02-red.txt` | The new contract (`vaultNamesReadWhole.contract.test.ts`, 4 cases) run against the stylesheet as it stood: 4 fail |
| `03-green.txt` | The same 4 pass; the five stylesheet gates pass |
| `04-before-1440.png`, `05-after-1440.png`, `06-after-1920.png`, `07-after-390-structure.png` | The Library before and after, and the Structure drawer on a phone |

## Not done here

- At 1440px a long heading deep in the tree takes three or four lines ("1.1.1 Form FDA 1571 — Investigational New
  Drug Application"), so the tree is taller and is scrolled more. It scrolls on its own.
- At 1440px the first document still sits below the six filters and the binder's two notes. That is the next
  slice, with the Required documents view naming each section it lists.
- The dark theme was not looked at for this change; no colour is touched.
