# Launch-scope self-test qualification

The original self-test failed on the published AnA snapshot: it removed
`ectd-publishing` from the replay keep-list and expected a launch-module finding.
That module had already left the launch catalog by the CPO's 2026-10-08 decision
in `shared/constants/launch-scope.ts`. The real gate correctly judged only the
remaining launch modules, so the seeded violation no longer exercised its rule.

The fixture now removes the still-launch `ectd-compile` and refuses to continue
if the mutation did not occur. It requires the unchanged real gate to return
exit 1 with a `survives-replay` finding naming that module. No catalog, migration,
gate, baseline or allowlist changed.

Node 22.23.3 validation:

- `red.txt`: original `npm run ci:launch-scope:selftest` exits 1.
- `green.txt`: repaired self-test rejects all three seeded violations and passes
  the real tree; `npm run ci:launch-scope` exits 0 with 7 apps, 30 surfaces,
  13 modules and 25 surface files checked.

This repairs qualification evidence and adds no product capability.
