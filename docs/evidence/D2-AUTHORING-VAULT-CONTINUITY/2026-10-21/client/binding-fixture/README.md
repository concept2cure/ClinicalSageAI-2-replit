# Canvas filing-binding fixture continuity

What already exists: `documentCanvasFilingBinding.test.tsx` mounts the actual
canvas and stubs the workbench to inspect its filing binding. Its auth mock
replaced the module with only `useAuth`, hiding actual `authService` exports now
used by the canvas's existing mounted File to vault dialog.

Root retained the meaningful combined RED in
`../../merged-regressions.json` / `.log.gz`: 614 passed, 2 failed, 1 TODO and two
unhandled errors from this incomplete fixture mock. This correction spreads the
actual auth exports and preserves the original `useAuth` stub. No production
code, session guard or assertion was weakened.

`green.json` records the focused actual argv, exit 0, two passing tests and raw
gzip SHA-256. `lint-strict.json` records the same fixture's
`--max-warnings 0` exit 0. Both include identical before/after source pins;
`freeze.json` records the original/final fixture hash. Raw gzip hashes were
independently verified. No compiler, build, global scan, provider or Git command
ran in this fixture correction.
