# P11-C-4: a signed review disposition kept offering a signature the server refuses

Periodic review 2026-09-28, editor family, Part 11 lens (medium, confirmed
by its verifier). Disposition half.

The Reviews row disabled "Record disposition" only when the review was
assigned to someone else, so a signed review kept opening the drawer and
the e-signature, spending the signer's password and code on a certain
"already signed" refusal.

- The row reads signed exactly as the server does (a disposition, or a
  completed review) and shows a disabled "Disposition signed" in its place.
- The server's refusal is unchanged.

Failing first: 3 of 5 new tests fail on the old code; 42/42 across 3
suites; 4/4 mutants caught (including the disposition-only check the
report proposed, which misses a completed review with no disposition).

Files: red.txt (before the fix), green.txt (after), mutants.txt.
