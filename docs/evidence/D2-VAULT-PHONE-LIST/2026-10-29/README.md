# D2 — the Vault's uploads lane at a phone's width (2026-10-29)

Launch row **D2** (the Vault is in the launch catalog). Found by the RR3 acceptance
(`../../D2-REVIEW-ROUTING/2026-10-29-RR3/README.md`, "Design issues for the
coordinator"; `acceptance/phone/run.log`): at 390×844 every uploaded file's name in
the Vault's **Uploaded files** lane rendered 0 px wide, so no document could be
opened from the lane. RR3's acceptance opened the version through the Vault's
deep-link target instead.

## What was wrong

The lane (`UploadsLane` in `client/src/concept2cure/v2/surfaces/Vault.tsx`) draws one
flex row per upload: the type, the name (a button), size · date · owner, the folder it
was filed to, and the filing chip. Every part except the name is fixed-width or
`nowrap`, and the filing chip does not shrink (`.vd-dr-row .rd-chip{flex-shrink:0}`).
"Auto-filed · confirm" is 146 px in uppercase. The name's button was the only part
allowed to shrink to nothing (`minWidth: 0; flexShrink: 1`, inline). So in a 286 px
row it absorbed the whole shortfall and rendered **10 px wide: its padding, with a
0 px name**. Playwright treats an element with no width as not visible, and so does a
person.

The cap was an inline style, so no media query could lift it.

Measured before the fix (`before/run.log`), row parts at 390×844:
`vd-dr-kind 38 | vd-crumb 10 | vd-dr-detail 37 | vd-dr-suggest 0 | rd-chip 146`.
Names 0 px on all five rows; clicking the first name timed out.

## No trunk commit regressed it

The brief assumed one, because RR1b's phone run on the same day could click a
document by its title. Bisecting showed otherwise:

1. **The lane is unchanged.** `git log -L` on the lane's markup and on its CSS
   (`misc-surfaces-v2.css` `.vd-dr-*`) shows no change between RR1b (`60881abe6`) and
   RR3 (`18c718e3c`). The last change to either was before 2026-10-27.
2. **The client at RR1b's own commit has the same defect.** The client tree of
   `60881abe6` (`git archive`, served by Vite against the same server and the RR3
   data) gives the identical parts and 0 px names at 390×844.
3. **RR1b clicked a different list.** On a copy of RR1b's acceptance database, at
   390×844, the title RR1b clicked is not in the lane at all (the lane shows the most
   recent rows). It is in the folder list (`.vd-list .vd-row`, 187 px wide). That list
   shows the first folder of the tree. RR1b's organization had no authored document,
   so the first folder was **Source files · filing cabinet**, which lists the uploads.
   RR3's organization had one (a `c2c_documents` row, the project's IND), so the first folder is the IND's section spine
   (`project-vault.ts` emits the spine first, the cabinet last). There, the uploads
   lane is the only place on the page that lists an uploaded file, and it was the
   broken one. `vaultFiledDocumentVisible.test.tsx` already pins that the lane
   exists for exactly this case.

So the defect was latent and data-dependent: any organization with an authored
document, at any width up to about 900 px, got a lane whose names were 0 to 107 px
wide (`before`, measured at 600, 700, 768 and 900 px: 80, 45, 66 and 107 px).

## The fix

- `Vault.tsx`: the name's button takes its cap from a class, `vd-dr-open`, instead of
  an inline style. Same values.
- `misc-surfaces-v2.css`:
  - `.vd-dr-open{ min-width:0; max-width:45%; flex-shrink:1; }`, which is the old
    inline style, so wider screens are unchanged;
  - at `max-width:900px` (the most used narrow breakpoint in the v2 styles), the row
    wraps (`flex-wrap:wrap`) and the name's button is `flex:1 1 60%` with no cap. The
    name shares its line with the type at most, and the size, folder and chip go
    under it.

Above 900 px nothing changes: at 901 px the parts are as before the fix, and at
1440×900 the parts and name widths are identical before and after (`run.log`, the
`desktop-*` screenshots; only the relative times differ).

## What already exists

Searched: `vd-dr-name`, `vd-dr-row`, `vault-uploads-lane`, `UploadsLane`, the lane's
CSS block, and `git log --all --diff-filter=D` on `client/**/Vault*`. Found and used:

| Piece | Path | Today | This change |
|---|---|---|---|
| The uploads lane | `UploadsLane`, `client/src/concept2cure/v2/surfaces/Vault.tsx` | Lists the latest uploads, opens one in the cabinet | Its cap moves into a class; nothing else |
| The lane's styles | `.vd-dr-*`, `client/src/concept2cure/v2/styles/misc-surfaces-v2.css` | Desktop row only | A narrow-width rule in the same block |
| The cabinet's narrow layout | `@media (max-width:1200px)` in the same file | Puts the folder list's name on a line of its own | Not reused: it covers 1080–1200 px desktops, where the lane is fine |
| The lane's test | `client/src/concept2cure/v2/__tests__/vaultFiledDocumentVisible.test.tsx` | The lane lists a filed upload while the spine is the open folder | Extended with the phone cases |

Nothing was rebuilt beside it.

## Tests

| What | File | Red | Green |
|---|---|---|---|
| The name's button carries its cap as a class, with no inline style; the desktop cap is unchanged (45%, may shrink); at ≤ 900 px the row wraps and the name is uncapped | `vaultFiledDocumentVisible.test.tsx`, "the uploads lane at a phone width" | `red/vault-uploads-lane-phone.txt` (3 of 3 new fail; the 3 existing pass) | `green/vault-uploads-lane-phone.txt` (6 of 6) |
| In a real browser: every lane name at least 40 px wide, no horizontal scroll, and clicking the first name opens the document (`vault-versions`) | `vault-phone-list.mjs` | `before/run.log`: exit 1, 390×844 fails (names 0 px, click timed out); 1440×900 passes | `after/run.log`: exit 0, both pass (names 138–148 px at 390) |

jsdom does no layout, so the unit test pins the mechanism and the browser check
measures the outcome.

Also run: every Vault client suite (`client/src/concept2cure/v2/__tests__/vault*`),
recorded in `green/vault-client-suites.txt`.

## The instance

- A private instance of the working tree on `:5231` (`NODE_ENV=development`,
  `RLS_ENFORCE=on`, runtime role `app_service`, `ALLOW_DEV_AUTH=1`).
- Its database is a copy of RR3's acceptance database (`c2c_rr3_instance` →
  `c2c_vault_phone_list`), so the five uploads and the authored IND are the ones RR3
  saw. For the bisection, a second instance on `:5233` ran on a copy of RR1b's
  (`platform_ci_vault_fixture_rr1b` → `c2c_vault_phone_list_rr1b`), and the
  client tree of `60881abe6` was served by Vite on `:5232` against `:5231`.
- Account: the synthetic `rr3-sender@example.test` (and `rr1b-sender@example.test`
  for the bisection), with a password set for this run only in the copies, never in
  the originals. It is not in this folder. jm.smith and sarah.chen were not used.
- Driven by Playwright (chromium from `/opt/pw-browsers`) with `vault-phone-list.mjs`
  at 390×844 and 1440×900. The instances and Vite were stopped afterwards, and both
  database copies dropped.

## Gates

`gates.txt`. Exit 0: `ci:pushed-lint-errors`, `ci:undefined-css-classes`,
`ci:class-vocabulary` (the two CSS gates `.husky/pre-push` runs),
`ci:untracked-imports`, `ci:pushed-typecheck`.

`ci:pushed-lint-warnings` exits 1 in the shared working tree, from five warnings in
another session's uncommitted RR4 files (`server/routes/mdx-qms.ts`,
`tenant-users.ts`, `separation-of-duties.ts`, `controlled-document-service.ts`,
`review-route-member.ts`). The gate lints the working tree, so it cannot be run on
this commit alone without touching those files, which this session did not. Measured
the ratchet's way on this change's own files (both versions through ESLint):
`Vault.tsx` 4 → 4 warnings, the test 0 → 0, no errors.
