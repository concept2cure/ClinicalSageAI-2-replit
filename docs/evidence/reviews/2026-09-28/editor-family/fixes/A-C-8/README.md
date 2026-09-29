# A-C-8: the visit rename and remove buttons were 22 by 18px, under the 24px floor

Periodic review 2026-09-28, editor family, accessibility lens (medium,
confirmed by its verifier).

Each visit column header's rename and remove buttons, the only controls
that do either, were a 12px icon in 2px 4px padding with a 1px border, 1px
apart. Their 24px circles overlapped, so the spacing exception did not
apply (WCAG 2.2 SC 2.5.8).

The visit header's buttons now take 5px padding: 24 by 24px each, 49px as a
pair, inside the 64px minimum column. The row header's single button keeps
its size; it meets the rule by spacing.

Failing first: protocolSoaTargetSize.test.ts computes the box from the
stylesheet and the component (jsdom has no layout).
- Before: 1 failed (22 < 24); the column-width guard passed.
- After: 12 of 12 across 2 suites.
- Three mutants, each caught.

Files: red.txt (before the fix), green.txt (after), mutants.txt.
