# P-122, CMC item 7: what ICH Q6A or Q6B expects in a specification, beside the specifications (2026-11-12)

Inventory row B5 (`../../inventory/cmc.md`), left as the first line of "Not done" in `../README.md`.

## What already exists (Rule 3)

| Piece | Path | Before |
|---|---|---|
| The reference | `server/services/global-ri/cmc-specifications.ts` | The ICH Q6A universal tests, the tests for a solid oral, oral liquid and parenteral product, and the ICH Q6B set. Pure data and two functions. No model, no tenant data. |
| Its route | `GET /api/global-ri/cmc/specifications/:productType` (`server/routes/global-ri/cmc.routes.ts`) | Mounted. Needs a signed-in author role. Claimed only by the locked Global RI screen, so production refused it 403 `LAUNCH_SCOPE`. |
| Its other reader | AnA's `global_ri_cmc_specifications` | In conversation only. |
| The specifications register | `CmSpecs` in `client/src/concept2cure/v2/surfaces/CmcModule.tsx` | The table, edit, signed approval and history. It showed no reference. |
| The Q3 reference | The impurity register's "Against the guideline" column (item 4, `../4-register-engines/`) | Already reached. This is the Q6 half of the same row. |

Searches run: `Q6A`, `Q6B`, `cmc/specifications`, `universal-tests`, `SpecTest`, `cmc_specifications` in `server`,
`shared` and `client/src`; `git log --all --diff-filter=D -- '*pecReference*' '*Q6*'` found no deleted file.

## What changed

- `client/src/concept2cure/v2/surfaces/cmcSpecReference.tsx` (a file of the CMC registers, which stand at the
  size ceilings): a card under the specification table. It lists the tests the chosen guideline expects in every
  specification and, for a chosen dosage form, the form's own. The engine's caveat is printed under the list.
- It is a reference and says so: "a reference, not a check of the specifications above". It gives no verdict on
  the project's own specifications. A specification's attribute is free text, so "missing" would be a string
  match.
- It opens on the project's own guideline when the shell knows the product type (a drug: Q6A; a biologic: Q6B).
  When it does not, no guideline is chosen and nothing is read until the person chooses.
- For ICH Q6B only the forms the engine has a set for are offered (any form, parenteral).
- `shared/constants/ui-surface-registry.ts`: the CMC screen claims `/api/global-ri/cmc/specifications`, the one
  route it calls. The rest of `/api/global-ri` stays with the locked screen and is still refused in production.
- No route, service, table, AnA tool or screen is added.

## Red and green

| What | Red | Green |
|---|---|---|
| Production serves what the CMC screen calls | `red-gate-without-the-claim.txt`: with the card mounted and no claim, the launch-scope gate test fails: "out-of-scope /api/global-ri/cmc/specifications/:p ← cmc" | `green.txt`: the gate test, the card's tests and the CMC reach, tab and stylesheet suites pass |
| The card | (new component; its tests were written with it) | `cmcSpecReference.test.tsx`, 9 of 9 |

`ci:launch-scope-api` after: 667 paths named by launch screens, none refused.

## In the running app

Signed in as the demo organisation's author with the production access gate on and row-level security on
(`walk.cjs`). C2C-201 (small molecule) and LMN-201 (biologic), at 1440 and 390. No refused read, no page error.

| File in `screenshots/` | What it shows |
|---|---|
| `1440-1-opened-by-link-none-chosen.png` | Opened by a link: neither guideline is chosen, and the card says to choose |
| `1440-3-solid-oral.png`, `390-3-solid-oral.png` | ICH Q6A with the solid oral tests, under C2C-201's specification table |
| `1440-4-biologic-q6b.png`, `390-4-biologic-q6b.png` | ICH Q6B on LMN-201, with the two forms it has a set for |

## What to know

- **Found in the walk and fixed before commit.** The first version read an unknown product type as a small
  molecule, so the biologic project, opened by a link, was shown ICH Q6A. The component test had passed, because
  it set the product type itself. A project opened by a link carries its id alone until its page has loaded
  (`v2/shellProject.ts`); Biostatistics' preset has the same dependence.
- **The reference is the engine's and is short.** It lists the test set, not limits, and three dosage forms. It
  does not cover inhalation, topical or transdermal products, which ICH Q6A also discusses.
- **Not done:** the universal-tests route (`/cmc/universal-tests/:productType`) is not called, because the
  specifications route returns the same universal set; the Q1A stability zones and the process-validation
  framework of the same inventory row are still unreached from CMC.
