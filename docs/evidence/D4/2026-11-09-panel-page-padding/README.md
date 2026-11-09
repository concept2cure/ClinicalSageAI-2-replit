# D4-6 follow-up: the page inside a narrow panel takes §D4.K's container padding (2026-11-09)

**The spec.** `.design/claude-convergence/D4.md` §D4.K "Page":
```css
@container artifact (max-width: 899px) { .ed-doc-inner { padding: 24px 28px 96px; } }
@container artifact (max-width: 560px) { .ed-doc-inner { padding: 20px 16px 80px; } .ed-mast-t { font-size: 22px; } }
```
The D4-5a walk (`../2026-11-09-one-bar/`) left this for "the D4-6 follow-up". It saw "Track changes" past the edge of a
729 px panel.

## What was measured first

`d46n.cjs` and `d46n-before.json` open the QOS working copy beside the conversation.

| Case | Panel | Toolbar box | Toolbar content | Page sides |
|---|---|---|---|---|
| 1440 | 711–1440 (729 px) | 711–1440 | 789 px in 729 | 48 px |
| 1280 | 684–1280 (596 px) | 684–1280 | 789 px in 596 | 48 px |

- **The toolbar does not overflow the panel.** Its box is the panel's width, and it scrolls inside itself
  (`overflow-x: auto`). "Track changes" sits behind the scroll, not past the panel. §D4.F's acceptance asks for
  exactly this: "the ribbon scrolls inside itself". Nothing is changed there.
- **The page did not follow the panel.** It kept its full-width 48 px sides inside a 729 or 596 px panel. Only the
  phone media rule ever narrowed it, and that rule reads the window, not the panel.

## What already exists (RULE 3)

- **`styles/authoring-v2.css`.**
  - `.dcv-workbench { container: artifact / inline-size; }`, the panel container from D4-4 and D4-5.
  - D4-4's `@container artifact (max-width: 899px)` floats the outline and the rails.
  - `.ed-doc-inner` names its side padding once as `--ed-page-pad-x`.
  - The phone media rule sets 16 px, with a comment that waited for this container.
- **`styles/rich-section-editor.css`.** `.ed .ed-doc-inner .rse-ribbon` spans the padding through
  `--ed-page-pad-x`.

Nothing new is added: two container rules beside D4-4's. The phone media rule stays for the editor outside a panel,
and its comment now says so.

## The change

| Panel | `.ed-doc-inner` |
|---|---|
| under 900 px | `--ed-page-pad-x: 28px; padding: 24px var(--ed-page-pad-x) 96px` |
| under 560 px | `--ed-page-pad-x: 16px; padding: 20px var(--ed-page-pad-x) 80px`; `.ed-mast-t` is 22 px |

The padding is set through the variable, as the spec's raw `28px` is not, so the toolbar keeps spanning the padding
at every width.

## Red, then green

- **Red at HEAD** (`red-at-head.txt`). `editorPageCss` › "the page inside a narrow panel": both cases fail, because no
  `@container artifact` rule sets the page.
- **Green** (`green.txt`). `editorPageCss` and every suite that reads `authoring-v2.css`: 7 files, 124 of 124.
- **Gates.** `ci:check-css-selector-shadowing`, `ci:surface-text-ramp` and `ci:undefined-css-classes` pass.

## In the running app

`d46n-after.json`, `after-pane-1440.png` and `after-pane-1280.png`, against `before-pane-1440.png`:
- the page's sides are 28 px in both panels;
- the toolbar still spans the panel edge to edge;
- the page does not scroll sideways.

**Seen, not changed:**
- **The bar wraps to three rows in the 596 px panel.** Freeze, E-sign, Place into filing and Re-file stay in it until
  D4-3, which the founder holds until the CSR demo.
- **The toolbar's thin scrollbar is the only sign that more controls are to the right.** That is §D4.F's design (one
  scrolling row).
