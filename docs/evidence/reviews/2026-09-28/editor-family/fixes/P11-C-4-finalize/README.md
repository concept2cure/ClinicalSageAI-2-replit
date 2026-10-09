# P11-C-4: a finalized protocol still offered Finalize and spent a signature on a refusal

Periodic review 2026-09-28, editor family, Part 11 lens (medium, confirmed
by its verifier). Finalize half; the disposition half is the next commit.

The outline's finalize gate was gated on completeness alone. A finalized
protocol still passes the check it passed to be finalized, so the gate read
"Ready to finalize" with a live button beside a header badge reading
"Finalized". Pressing it spent a password, an authenticator code and a
shared signing attempt before the server refused ("Protocol is already
finalized."). A superseded protocol was the same.

For the two statuses the server refuses, the outline now shows the state
("Finalized — v2.0", "Superseded — v1.0") and why, with the findings, and no
action. Every other status keeps the gate.

Failing first: protocolDevFinalizeTerminal.test.tsx.
- Before: 2 failed; the 2 in-development guards passed.
- After: 38 of 38 across 3 suites.
- Five mutants, each caught, including the disabled-gate shape the
  verifier rejected.

Files: red.txt (before the fix), green.txt (after), mutants.txt.
