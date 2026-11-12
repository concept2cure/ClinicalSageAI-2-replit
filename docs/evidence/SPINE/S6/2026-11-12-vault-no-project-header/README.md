# Vault with no project open: nothing is offered that needs a project

2026-11-12. Session `…01KnUGoX3g` (the Vault parity lane). Plan package F1. Completes
`client/src/concept2cure/v2/surfaces/Vault.tsx`. Found on this lane's UI walk of the Vault, on PostgreSQL, in the
running app.

## The defect

With no project open, the Vault asks one question: which sponsor's Vaults to show (P-107 item 3a). Above that
question, the page offered seven controls, and none of them could act:

- **Trial master file.** It opened a page that then said a trial master file belongs to a project's study.
- **New folder, Upload a folder, Add files.** All three were disabled.
- **Three starters for AnA:**
  - "What is missing for this filing?" (no filing is open);
  - "Which documents are not yet effective?" (it asks about "this Vault");
  - "Search my connected repositories" (it asks for documents "relevant to this project").

`01-before-no-project.png` shows the page.

## What already exists

| Piece | Path | What it does |
|---|---|---|
| The no-project Vault | `Vault.tsx` (`ProjectVaults`), `vaultSponsors.ts` | "Choose a project's Vault", then "Which sponsor?", one row per sponsor |
| The header's actions | `Vault.tsx` (`.ph-acts`) | Trial master file (where the eTMF can be opened), New folder, Upload a folder, Add files (for a person who may write) |
| The starters | `Vault.tsx` (`VAULT_STARTERS`) | Three prompts, each about the open project or filing |
| The pin | `vaultHeaderHonesty.test.tsx`, "with no project open, Upload is disabled and says why" | Kept the disabled button as the way to say why |

## What changed

- **The header's actions and the starter row are shown only with a project open.** Each returns, unchanged, once
  one is. The page's own empty state says why ("Choose a project's Vault"), so a disabled button is no longer needed
  to say it.
- **The no-project branches inside them are removed.** These were the `!projectId` disabled conditions and the two
  "Open a project first" titles, which the guard made unreachable.
- **The pin is replaced.** It now holds that with no project open there is no header action and no starter, and
  that with a project open both are there.

Nothing a person could do is lost: every control removed here did nothing until a project was open (P-122).

## Evidence

| File | What it shows |
|---|---|
| `01-before-no-project.png` | The page before, at 1440 by 900 |
| `02-after-no-project.png` | After: the title, "Choose a project's Vault" and "Which sponsor?" with its two rows |
| `03-after-project-open.png` | After, with a project open: the four header actions and the three starters, as before |
| `04-red.txt` | The new pin against the code as it stood: it fails (the Add files button is there) |
| `05-green.txt` | Every Vault and eTMF client suite: 77 files, 840 tests, all pass |

The walk read the header's buttons on both pages: none with no project open; "Trial master file", "New folder",
"Upload a folder" and "Add files" with one open. No console error on either.

## Not done here

**A 510(k)'s Library lists the eSTAR outline twice.** Seen on the same walk (`[Demo · MDX] NeuroPanel-Dx 510(k)`):

- the filing binder ("Filing binder · 510(k) × FDA · eSTAR", sections A to G) holds the files placed against the
  outline;
- further down, the authored 510(k) document's own sections appear with the same headings A to G.

The two count different things (6 files; 31 sections). Which of the two the tree should show, or how one should
carry the other's state, is a design decision in S6's binder (`server/routes/c2c/project-vault.ts`
`documentFolder` and `filingCabinet`). It is recorded for S6's open items and not changed here.
