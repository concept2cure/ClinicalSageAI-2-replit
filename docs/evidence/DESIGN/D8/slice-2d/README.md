# D8 slice 2d — no text a person reads on the device screens is in the faintest tier

Package **D8** (founder decision **P-128**, 2026-11-12). Spec: `.design/claude-convergence/D8.md`, §2d. Session
`session_01E8btkB8mcLirW4rNvsMNxK`. The rest of slice 2c: its record listed eight declarations that still drew text
in the faintest tier, in states it had not opened.

## What already exists (RULE 3)

- `client/src/concept2cure/v2/__tests__/faintestTextTier.test.ts` (`a84aa98fa2`, the lead session, 2026-11-12): every
  `color: var(--text-500)` in the v2 stylesheets must be a named ornament, a separator, a placeholder or a disabled
  control. Its author pointed out that it reads one directory and could read the device tree too. **It is extended
  here, not copied:** it now reads `client/src/concept2cure/mdx/` beside `v2/styles/`, with two device ornaments
  named. The count-only case slice 2c had kept in `mdx/__tests__/deviceTextMeetsContrast.test.ts` is removed: the
  shared test is stricter (no readable use at all), and the same rule is not kept twice.
- `scripts/ci/check-token-contrast.mjs` holds `--text-400` at 4.5:1 on the page, and `mdx/surface-text-ramp.css`
  re-bases it on every tinted device ground.

## What was there

The extended test, before any stylesheet change, listed six readable uses:

| Sheet | Selector | Text | Drawn by |
|---|---|---|---|
| `pathway-tabs.css` | `.dd-doc-hint` | "this text is written from the authoring editor" | `pathway/PathwayPanes.tsx`, the dossier drawer's document tab |
| `pathway-tabs.css` | `.dd-att-drop-sub` | "PDF · DOCX · XLSX · CSV · PNG · JSON" | `pathway/DossierAttachments.tsx`, the drop zone |
| `files-tree.css` | `.ftp-trunc` | " · showing first 200" | `pathway/FilesTreePane.tsx`, an audit log over 200 events |
| `app.css` | `.pg-list-blocker.none`, `.pg-list-due .act`, `.ed-prov-lbl` | — | no markup draws them today |

Two more stay in the tier as ornaments, each named in the test with its reason: `.estar-open` (the row-open arrow
beside an eSTAR section's label, shown on hover) and `.pg-list-blocker.none .ico` (a glyph beside the words).

## What changed

The six take `--text-400`, one step up. Nothing else.

## Measured in the running app

The three drawn states open only from an approval or agency-query row, or an audit log of more than 200 events; the
demo project has none. So `probe-injected.cjs` places the markup each component draws (copied from it, and named in
the script) into the live 510(k) page and reads the computed colour against the ground behind it, with the real
stylesheets, in light and dark (`injected-before.json`, `injected-after.json`):

| Text | Before, light | Before, dark | After, light | After, dark |
|---|---|---|---|---|
| The drawer's hint | 2.11:1 | 2.76:1 | 4.50:1 | 4.50:1 |
| The drop zone's file types | 2.11:1 | 2.76:1 | 4.50:1 | 4.50:1 |
| "showing first 200" | 2.02:1 | 2.58:1 | 4.51:1 | 4.55:1 |

Unrounded, the page pair is 4.5002:1 in light and 4.5011:1 in dark: it passes AA, with no room, which is what the
token gate holds `--text-400` to. These are measured on synthetic copies of the markup, not on the states opened by
a person; the colours, grounds and stylesheets are the app's own.

## Red and green

- `faintestTextTier.test.ts`, extended to the device tree: failed before the change, listing the six above; passes
  after (3 of 3).
- `deviceTextMeetsContrast.test.ts`: 4 of 4 (its count case moved into the shared test).
- `ci:surface-text-ramp` passes. The device suites pass.

## Not changed

- `.ed-prov-lbl` is still uppercase and letter-spaced; no markup draws it.
