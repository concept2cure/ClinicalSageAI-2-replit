# Supplied CTD module QC report: D2 evidence

Workstream W1 / D2, 2026-10-13, `concept2cure-v2`. Contract:
`docs/design/CTD_SUPPLIED_QC_SCOPE_2026-10-13.md`.

- `baseline-red.txt`: 13 regressions failed against the original production
  implementation; two real authentication/role controls passed. The failure
  evidence includes the extracted PDF printing `READY` for only Module 2.
- `final-green.txt`: **51 tests passed in three files**, with no skipped tests.
  Includes the actual Express JSON/PDF route, extracted actual PDF text,
  partial and claimed full dossiers, unassessed Module 3, caller origin/context
  and qualification forgery, exact subsection QC, invalid/contradictory counts,
  canonical module QC outputs, no-input behavior, feed-forward checks and
  deterministic PDF bytes.
- `scoped-lint.txt`: six production/test files, zero errors and zero warnings.
- `source-digests.json`: SHA-256 of tested source/tests/design contract and
  base HEAD. Changes remain in the shared working tree for root integration.

The focused command was:

```sh
PATH=/home/agent/.npm/_npx/6d82ddbdd7da268b/node_modules/node/bin:$PATH \
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run \
  server/services/authoring/__tests__/ctd-authoring-readiness.test.ts \
  server/services/authoring/__tests__/ctd-readiness-renderer.test.ts \
  server/routes/__tests__/authoring-pdf-ctd-supplied-qc.test.ts
```

This report's fixed authority is caller-supplied, unverified module QC.
`ready` is false and full dossier, scientific approval and dispatch readiness
are not assessed; formal report qualification is not established. Clean partial
supplied QC remains useful and does not impose an invented late-stage CSR rule.

The HTTP harness mounts the real router and role middleware with injected test
principals. The standard test setup mocks PostgreSQL; this deterministic path
does not load authoritative records. These tests do not establish end-to-end
JWT authentication, native RLS, a complete CTD/BLA, agency acceptance,
production deployment or formal qualification. No model or agency call occurred.
