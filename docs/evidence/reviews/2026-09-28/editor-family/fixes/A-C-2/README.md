# A-C-2: the protocol outline told no screen reader which section was open

Periodic review 2026-09-28, editor family, accessibility lens (medium,
confirmed by its verifier).

The section outline marked the open section with a class alone
(.pd-tree-row.on), so every row computed the same role, name and state
whether it was open or not (WCAG 1.3.1, 4.1.2). The open row now carries
aria-current.

The lens reported the tab strip for the same reason; another lane fixed
that half the same day as a full tablist (780a0639, GA-2), so it is not
repeated here, and the test reaches tabs by their text.

Failing first: protocolDevTabState.test.tsx.
- Before: the outline cases failed (expected null to be 'true').
- After: green, with the ProtocolDev suites.
- Mutants: the outline aria-current removed, or put on every row; each
  caught.

Files: red.txt (before the fix), green.txt (after), mutants.txt.
