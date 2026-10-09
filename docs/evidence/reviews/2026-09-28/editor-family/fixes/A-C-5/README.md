# A-C-5: a ticked schedule cell was named by its glyph, and the cell lost its role

Periodic review 2026-09-28, editor family, accessibility lens (medium,
confirmed by its verifier).

Each schedule-of-assessments cell was <td role="checkbox">. A ticked cell's
accessible name was its glyph, "✕", with the assessment and visit demoted
to a description some screen-reader settings never speak. The role also
overrode the only role a table cell may have, so the row and column
headers were no longer tied to it.

The cell is a cell again, and a checkbox sits inside it, named
"<assessment>, <visit>", with the glyph hidden. The click stays on the
whole cell and the checkbox covers it, so the pointer target and the inset
focus ring are unchanged.

Failing first: protocolSoaPersists.test.tsx, where the grid is now reached
by role and name.
- Before: 9 failed; 1 passed.
- After: 49 of 49 across 3 suites.
- Six mutants, each caught.

Files: red.txt (before the fix), green.txt (after), mutants.txt.
