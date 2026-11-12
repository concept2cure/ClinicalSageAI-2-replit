# Quality's root and type are the product's (C18, 2026-11-10)

Package **D7**, sweep item C18. It covers:

- styles-shell-reset and styles-type-ramp;
- the rest of styles-accent;
- the rest of styles-buttons and dialogs-4;
- the header comment of product-target-dialog-own-chrome.

After C1–C17, Quality still carried a page of its own under the product's:

- `.qms-shell` set its own font, colour, 13px size, 1.55 line height, `--bg-050` background and smoothing.
- A scoped reset stripped every Quality button, and D0's `app-v2.css` carried a carve-out (`button:not(:where(.qms-shell
  *))`) so the shell's font reset skipped Quality.
- Its own `.qms-btn` and `.qms-link` (with an orange hover) styled the last four buttons, in the controlled-text
  editor.
- Twelve font sizes were px literals off the ramp: 11, 11.5, 12, 12.5, 13 and 14px.
- `QualityModule.tsx`'s header still said the module "carries its own topbar … so it renders full-bleed".

## What already exists

- **D0's shell**: `client/src/concept2cure/v2/styles/app-v2.css`.
  - `.c2c-v2 *` box-sizing;
  - the button reset `:where(.c2c-v2) button`;
  - the font reset `.c2c-v2 button { font: inherit }`;
  - `.c2c-v2 .mono`;
  - the page's background and body type.
- **D0's buttons**: `.btn ghost small` and `.btn primary small`. Quality's rows and drawers already use them.
- **The type ramp**: `--fs-caption` 12, `--fs-small` 13, `--fs-body` 14, `--fs-section` 15.
- **`shellButtonResetYields.test.ts`** pins the shell's reset, and pinned Quality's carve-out and `.qms-btn`.

Nothing new: no screen, route, table, file or class.

## What changed

| | Before | After |
|---|---|---|
| `.qms-shell` | font, colour, 13px / 1.55, `--bg-050`, smoothing, its own box-sizing, a scoped button reset | layout only (flex column, height, `min-width: 0`). The page's background and type are the product's. |
| D0's font reset | `button:not(:where(.qms-shell *)) { font: inherit }`, skipping Quality | `.c2c-v2 button { font: inherit }` on every button. **This is a D0-owned rule in `app-v2.css`**, changed here because its only carve-out was Quality's. |
| Quality's own buttons | `.qms-btn`, `.qms-btn.ghost`, `.qms-btn.primary`, `.qms-link` (orange hover) | deleted. The controlled-text editor's Save, Reload, Keep editing and Discard are `btn primary small` / `btn ghost small`. |
| The quiet buttons Quality still sizes | `.qms-num`'s weight and `.qcc-linkcount`'s size in one-class rules, which the font reset would now override | in rules that outrank it (`.c2c-v2 .reg-tbl.qms-reg .qms-num`, `.c2c-v2 .qcc-linkcount`) |
| Sizes | 11, 11.5, 12, 12.5, 13 and 14px literals | `--fs-caption`, `--fs-small` and `--fs-body` |
| `.qms-shell .mono` | Quality's mono | deleted; D0's `.c2c-v2 .mono` |
| Unused rules | `.qms-sec-head*` | deleted |
| `quality/app.css` and `QualityModule.tsx` headers | "scoped surface styles … Body 13px"; "carries its own topbar … full-bleed" | say what is true now |
| The ramp sheet | listed `.qms-shell` and `.qms-btn.ghost:hover` | regenerated |

## Tests

`shellButtonResetYields.test.ts`:

- The full font reset outranks one class on every button, and `app-v2.css` has no Quality carve-out.
- `quality/app.css` has no `.qms-btn` or `.qms-link` rule and no scoped button reset.
- `.qms-shell` sets no font-size, font-family, line-height, colour, background or smoothing.
- No size is a px literal.
- The record number's weight and the link count's size are in rules that outrank the shell's reset.

`red.txt`: the two cases fail before the change. `green.txt` covers Quality's suites, the button reset, D0 primitives,
foundations one-definition and retired-ratchet, AnA's wave-4, project home's Quality and the core handoff: 35 files
and 520 tests. The typecheck is clean. These gates pass:

- `ci:undefined-css-classes`;
- `ci:class-vocabulary`;
- `ci:check-css-selector-shadowing`;
- `ci:check-shell-css-collisions`;
- `ci:surface-text-ramp`.

## Walked in the running app

`w25-root-type.cjs` (`shots/w25-root-type.log.json`) ran as the approver at 1440, with no API or page errors.

| | Quality | Biostatistics (another work area) |
|---|---|---|
| Dark: the background behind the work area (`shots/w25-quality-dark-1440.png`) | `rgb(38, 38, 36)` (#262624), from `main`. `.qms-shell` is transparent. | `rgb(38, 38, 36)`, from `main` |
| Light (`shots/w25-quality-light-1440.png`) | `rgb(250, 249, 245)`, from `main` | `rgb(250, 249, 245)`, from `main` |
| The header's line | 14px | 14px |

- A register cell is 13px, D0's table size.
- A record number is 13px at weight 600, in JetBrains Mono.
- The change log's link count is 12px.

Run it from this folder with `NODE_PATH=$(npm root -g) node w25-root-type.cjs`. It needs `WALK_PASSWORD` and a running
server.

## Not done here, and why

- **`SURFACE_VIEWS` still marks Quality `full: true`** (`v2/surfaceViews.ts`). That is outside D7, as the sweep plan
  records. With no background or type of its own, it decides only the page's padding.
- **The controlled-text editor's buttons were not walked.** No document in the walk organisation is unbound and
  editable through the reader (dialogs-3, which waits on a founder decision).
