# CANVAS-POLISH — accessibility and motion on the document canvas

The worker was killed by an Anthropic API outage (HTTP 529) before it filed
evidence or captured screenshots. Its code and its tests were complete on the
tree. The control tower re-ran them and files this record; the visual proof at
phone width is **owed** and named at the bottom.

## What landed

`client/src/concept2cure/v2/__tests__/documentCanvasPolish.test.tsx` pins the
canvas's accessibility and motion contract as executable assertions rather
than prose, and `DocumentCanvas.tsx`, `DocumentWorkbench.tsx` and
`authoring-v2.css` were changed to satisfy them:

- The expand control **names what it does and what it controls**, and moves
  focus into the region it opens.
- **Escape collapses from anywhere in the expanded region**, including with
  focus left on the body, and returns focus to the header control.
- There is **exactly one way back** while expanded — not two competing ones.
- **No focus trap**: every control in the collapsed card is reachable and the
  card does not hold focus.
- Each dialog is **labelled, modal, focus-trapped while open, and restores
  focus on close**.
- **Every transition and animation is at most 200ms and eases out** — the test
  parses the cubic-bezier control points and rejects a spring, a bounce or an
  overshoot, so the rule is enforced arithmetically rather than by eye.
- **Every animation and transition is removed under prefers-reduced-motion.**
- The canvas **shares no class name with the Design Controls surface**, whose
  stylesheet also owns a `.dc` family — a collision that would have restyled
  one surface from another's sheet.

## Verified by the control tower

| Check | Result |
|---|---|
| canvas, workbench and polish suites (6 files) | 42 passed |
| whole-tree `tsc --noEmit` | 0 errors |
| `ci:canvas-path` | pass — thread → canvas → workbench still wired |
| `ci:undefined-css-classes` | pass |
| `ci:design-system` | pass |
| eslint warning ratchet | no file changed its warning count |

## Owed

Screenshots at 390x844 and 1440x900 of the collapsed canvas, the expanded
editor, the project-files panel and both dialogs. The worker died before
capturing them, so the small-screen layout is asserted by test but not yet
shown. Nothing else in this item is outstanding.
