# D2: Quality's buttons, tabs and library cards had lost their styling inside the shell (2026-10-31)

Found on the same Chromium walk ("The UI doesn't work / design", the founder, 2026-10-31).

**What the person saw** (`quality-before.png`). On Quality:
- each tab's icon sat against the end of the previous tab's label, with no space and no tab shape;
- "New controlled document" was cramped against the right edge, and "Ask AnA for a pre-inspection check" was bare text;
- the nine library cards had no border, padding or background;
- the register's filter chips were plain words.

**Cause.** The shell's button reset, `.c2c-v2 button { font: inherit; background: none; border: 0; padding: 0; … }`, has one class and one element, so it outranks every one-class rule. Quality's stylesheet styles its buttons with one class each (`.qms-tab`, `.qms-btn`, `.qms-chip`, `.qms-tpl-card`, `.qms-tb-btn`), and its own reset is scoped with `:where()` precisely so those classes win. Inside the shell, the host's reset won anyway: padding, border and background went to zero, and `font: inherit` overrode the buttons' size and weight.

## What already exists

- **The reset** (`client/src/concept2cure/v2/styles/app-v2.css`, top of file).
- **The same failure, fixed locally yesterday.** The signing dialog's buttons lost their padding to this reset on every surface that signs. RR5 fixed them by raising those buttons' own selectors and pinned it in `reviewRoutePhoneWidth.test.ts` (`docs/evidence/D2-REVIEW-ROUTING/2026-10-30-RR5/`).
- **Other selectors that work around the reset** by adding the element, such as `.c2c-v2 button.pj-stageband-next`. They keep working; they outrank either form.
- **Quality's scoped reset** (`client/src/concept2cure/quality/app.css:10`).

## Fix

The reset is `:where(.c2c-v2) button`. It still resets every button in the shell, and any class rule now wins as written. That fixes the cause for every guest stylesheet in the shell, rather than one selector at a time.

**What else it changes, measured before the change** (`02-measured-impact.txt`). On 13 launch surfaces in Chromium, every visible button's computed padding, margin, border, background, alignment, font size, weight and colour was recorded twice: with the reset as it was, then with it rewritten to `:where(.c2c-v2) button` in the live stylesheet. Across about 940 buttons, only Quality's 25 changed. Each of those 25 changed to what Quality's own rule specifies.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | `shellButtonResetYields.test.ts` before the change. The reset is outranked by no single class, and Quality's five button classes do not outrank it: 6 of 7 cases fail. |
| `02-measured-impact.txt` | The 13-surface measurement, and Quality's 25 buttons in detail. |
| `03-mutations.txt` | Two mutations, each caught: the old reset restored, and `.c2c-v2 :where(button)`, which only ties with one class. |
| `quality-before.png`, `quality-after.png` | Quality before and after. |

**Also run.**
- `reviewRoutePhoneWidth.test.ts`, updated to the new selector and to count `:where()` as nothing (as CSS does): 15 of 15. Its assertion that the signing buttons outrank the reset still holds.
- Gates: `ci:shell-css-collisions`, `ci:css-selector-shadowing`, `ci:undefined-css-classes` and `ci:frozen-theme-aliases` pass. `ci:component-class-coverage` reads built CSS and was not run (no build here).
