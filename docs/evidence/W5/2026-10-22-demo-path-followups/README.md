# W5 / D7: three follow-ups from the IND reference lane (2026-10-22)

**Row:** D7, one real sequence (W5), on the BX-512 demo path. **Branch:** `concept2cure-v2`.
The founder asked for three follow-ups on the demo path, each to be fixed only if still needed. Two are
fixed. The third is blocked outside code.

## What already exists

- **Opening a document in the Vault.** `client/src/concept2cure/v2/vaultTarget.ts`
  (`locateVaultDocument`) and the pending-target effect in `surfaces/Vault.tsx` open a named
  document after File to Vault ("Open in Vault"), and say so when the tree does not hold it.
  Nothing fed an upload into that path.
- **The upload hook.** `client/src/concept2cure/v2/useVaultUpload.ts` is the one upload path,
  `POST /api/vault/ingest`. The ingest response already names the recorded document
  (`document.id`, `server/services/vault/vault-ingest.service.ts`), and the hook discarded it.
- **The placement dialog's button.** `.c2c-v2 .de-btn.primary` in
  `client/src/concept2cure/v2/styles/journey-v2.css`. `design-system/README.md`, "Animation &
  motion", gives the 1px `translateY` lift to cards, not to buttons.
- **The ICH heading tree.** `docs/work-orders/MR-10-ectd-conformance-and-transmission.md`,
  Stage 5 (CAT2-03). It generates the tree from the vendored DTD.

Searches run: `uploadStaged`, `setSel`, `locateVaultDocument`, `takeVaultTarget`, `document.id`
in the ingest service, `.de-btn` across every stylesheet, `translateY(-1px)` (63 rules), and
`git log -S/-G` on `Vault.tsx`. The clone is shallow, so history goes back 50 commits.

## 1. After an upload, the Vault did not open the uploaded document. Fixed.

- **The hook.** It now carries `recorded`: the ids the server returned, in the order sent. It
  never guesses an id.
- **The Vault.** It opens the batch's first recorded document through the existing
  pending-target path, once the re-read holds it (`after` is the payload on screen when the
  upload settled). A check-in, whether from the conflict offer or from the detail pane, opens
  the new version.
- **A document the re-read does not hold** is reported: "The document you just uploaded is not
  in this list."
- **Before the fix:** 3 of 4 tests red (`item2-red.txt`). The fourth test guards against
  guessing and passes either way.
- **After:** 4 of 4 green, and 9 of 9 together with `vaultOpensOnFiledDocument`.
- **Mutations:** all 7 turn the tests red (`item2-mutations.txt`). One survived on the first try,
  so the test was tightened.
- **Regression:** every Vault client suite plus `mdx/`: 111 files, 1,024 tests pass
  (`item2-vault-suites-summary.txt`).

## 2. The placement dialog's submit button jittered by 1px and never settled. Fixed.

- **Cause.** `.de-btn.primary:hover` lifted the button with `translateY(-1px)`. A pointer
  resting on its bottom row unhovered it, the button dropped back, and it was hovered again,
  every frame.
- **Rejected fix.** An `::after` hit-area guard was tried and does not work: a `<button>` clips
  its own content, and `elementFromPoint` returned the footer.
- **Fix.** The lift is removed and the hover shadow kept, per the design system.
- **Browser proof** (`jitter-harness.mjs`, with the product's own `journey-v2.css`):
  - Before (`item3-harness-before.json`): the bottom row gives 2 positions (56 and 57), hover
    flips each frame, and the click fails with "element is not stable".
  - After (`item3-harness-after.json`): 1 position, hover held, and the click lands.
- **Guard.** `dialogButtonHoverSettles.test.ts` requires every `.de-btn` hover rule to change
  paint only. It is red on the lift (`item3-unit-red.txt`) and green on the fix.
- **Not swept.** 62 other `translateY(-1px)` declarations remain in client stylesheets. Those on a
  button's hover carry the same latent defect. Fixing them is a design-system decision.

## 3. The ICH tree for 3.2.S is too shallow (CAT2-03, MR-10 Stage 5). Blocked.

- **Status:** unchanged at this push. `assets/ectd-dtd/checksums.txt` holds 0 DTDs.
- **Why it is blocked:**
  - Stage 5 generates the tree from the vendored ICH DTD.
  - Vendoring needs the per-DTD legal signoffs (`assets/ectd-dtd/README.md`).
  - This sandbox's egress to fda.gov and ich.org is refused (403).
- **Not done:** the element names were not guessed into a hand table.
- **Unblock path:**
  1. Someone with network access and the signoffs vendors `ich-ectd-3-2.dtd` and
     `us-regional-v3-3.dtd`.
  2. Then MR-10 Stage 3 and Stage 5 run.

## Also fixed on the way: trunk's CSS gate

`ci:check-css-selector-shadowing` (CI, `ci.yml:911`) was red on trunk since `e4dfbaba9`. Two
`.c2c-v2 .dr2-find` rules were defined in `coverage-v2.css`. They are folded into one, and the
computed style is unchanged. The gate now reports 0 new.

## Re-walked in the app (2026-10-23, trunk `d019ca3d7`)

The lane database was migrated as a deploy would migrate it (425/425 files). The six clicks were
then walked in headless Chromium with the updated driver
(`../2026-10-21-ind-reference-lane/driver/walk.mjs`), which clicks nothing to open a document and
never force-clicks. The walk exited 0. Its transcript is `rewalk/clicks-1-6-transcript.txt`.

- **Click 3b.** "opened after the upload: BX-512-analytical-procedures", with nothing clicked. The
  submit button under a resting pointer is "settled (top edge over 40 frames: 840.5)", where it
  was 840.5 and 839.5 before. Screenshot: `rewalk/c3b-vault-v1-placed-0000.png`.
- **Click 6c.** The check-in recorded v2.0, and the Vault opened it by itself
  (`rewalk/c6c-vault-v2-checked-in.png`). The submit button settled, and the click was a plain
  click.
- **Click 6d.** Unchanged: `replace` 3.2.S.4.2 and `delete` 3.2.S.4.

## Still open

- **No board row was claimed** for these follow-ups.
- **HawkScan was not run**, because there is no `HAWK_API_KEY`.
