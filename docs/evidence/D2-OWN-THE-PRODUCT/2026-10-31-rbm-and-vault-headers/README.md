# D2: Risk-based monitoring had no page margin, and the Vault header broke its own line (2026-10-31)

Found on the Chromium walk of the launch surfaces ("The UI doesn't work / design", the founder, 2026-10-31).

## What already exists

- **Risk-based monitoring** (`client/src/concept2cure/v2/surfaces/Rbm.tsx`, `RbmSurfaces.tsx`, `styles/rbm-v2.css`). Every sibling surface brings its own page padding: `.reg-wrap` (`app-v2.css`), Communication's `.cc`, and Project home's `.page-inner`. RBM's root `div` had none.
- **The Vault header** (`Vault.tsx`, `vaultCountLabel`). It names the parts of its count. The upload type picker had a screen-reader label and no visible one.
- RULE 4 lists Risk-based monitoring among the workspaces to converge into the project and the one editor. That convergence is not done here. These are defects in what is on screen today.

## What the person saw, and the fixes

| Surface | Before | Fix |
|---|---|---|
| Risk-based monitoring (`rbm-before.png`) | The title sat against the rail. The project picker and its "PROJECT" label ran off the right edge. | `.rbm-page` gives the page the same padding as its siblings. There is no max-width, because the docked AnA column needs the full width (`rbm-after.png`). |
| Risk-based monitoring | With no project chosen, the picker's caption read "Live RBM read-model". | The caption appears only when a project's board was read ("N sites — N subjects scored"). |
| Risk-based monitoring | AnA's dock said "Overview — tool `get_rbm_attention`". | It names the screen, "Overview". The tool is a developer's word. |
| Vault (`vault-before.png`) | The header's line wrapped on both sides of a separator, leaving a lone "·" on a line of its own. | The cause: the separator is an SVG, and SVGs are `display: block` (preflight), so it broke the line before and after itself. The separator is now inline, and each part of the line wraps as a unit with its separator (`vault-after.png`). |
| Vault | The upload type picker was an unlabelled "Other" box among the header buttons. | It is labelled "File type" on screen. |

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | The five new cases before the fix: `rbmPageChrome.test.tsx` (3) and `vaultHeaderHonesty.test.tsx` (2). All fail. |
| `rbm-before.png`, `rbm-after.png`, `vault-before.png`, `vault-after.png` | Chromium, 1440 × 900, before and after. |

**Also run.**
- After the fix, 15 of 15 pass.
- All Vault and RBM client suites: 684 of 687 pass. The 3 failures happen on trunk without this change, and are handled in the next commit:
  - `vaultLibrarySearch.test.tsx`, "limits the headline…";
  - `vaultPlaceFromVault.test.tsx`, "opens with a confirmed filing's section…";
  - `vaultVersionCompare.test.tsx`, "an earlier version compares…".
