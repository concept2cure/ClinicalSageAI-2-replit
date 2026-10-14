# Project creation fixture qualification

2026-10-14; W1 / D2, under the
[task handoff contract](../../../design/TASK_DRAWER_HANDOFF_2026-10-14.md).
This is a native-route fixture repair, not a production authorization change or
a deployed human beta result.

## Observed failure

At published source `6ffcb425284d68c159fbfc8c4af78e52b589504a`,
[main CI Test job 116128560595](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38642062236/job/116128560595)
reported 24 failing cases in
`server/routes/c2c/__tests__/projects-create.test.ts`. A focused Node 22 replay
reproduced 24 failures and two passes. Its first failure was the missing-name
validation: expected HTTP 400, received 403 at the original line 144.

The canonical route first calls `requireProjectCreationAccess`, then checks the
body, and rechecks current actor standing with `FOR SHARE OF ou,u,o` inside the
creation transaction and the unique-code retry. This admission was introduced
by platform commit `14362ef006`; the old fixture supplied request IDs but no
active user/organization membership result. Its positional business-SQL queues
were consumed by the new admission query. The 403 was the intended fail-closed
guard, not evidence that the guard should be removed.

## Repair and verification

Only the route test and its approved test-only
`server/routes/c2c/__tests__/projects-create-fixture.ts` helper changed. The exact
normalized canonical actor SELECT and its locked variant dispatch to a separate
membership recorder; unrelated statements retain the original business-SQL
queues. Actor results are keyed by the exact positive integer organization and
user parameters, with only organization 7 / user 3 active by default. Neither
`requireProjectCreationAccess` nor `readCurrentProgramActor` is mocked.

All 121 original assertion lines remain. Added checks cover missing membership,
membership belonging to another organization, an active viewer, and revocation
between preflight and locked admission. They verify refusal before mutation or
transaction rollback, while success verifies both admission reads bind `[7, 3]`.
Existing audit-failure rollback, scaffold, submission-spine, quota, retry,
tenant-scoping and safe diagnostic-response assertions remain intact.

The focused command used Node `v22.23.3`:

```sh
npx vitest run server/routes/c2c/__tests__/projects-create.test.ts \
  --reporter=json --outputFile=/workspace/scratch/6ff-projects-create-final.json
```

Final result: **30 passed / 30 total; zero failed or skipped**, exit 0.
ESLint on both files: zero errors and the same two inherited
`max-lines-per-function` warning occurrences as the baseline; the helper has no
warnings and no new file-length warning remains. `git diff --check` passed.
Independent review confirmed the exact actor/organization parameters, locked
read, original assertions and refusal checks.

[Red excerpt](project-create-fixture-red.txt) and
[green excerpt](project-create-fixture-green.txt) retain selected safe raw JSON
reporter fields and the first numeric-status assertion. Full output stayed in
private scratch (`6ff-projects-create-red.log` / `.json`,
`6ff-projects-create-final.log` / `.json` and
`6ff-projects-create-eslint-final.json`); environment and driver diagnostics were
not copied into this evidence.

This proves the native route's control flow with modeled SQL responses. It does
not prove real PostgreSQL/RLS, data provisioning, authentication/MFA, storage or
named-human acceptance. The hosted job above describes the old fixture at
`6ffcb425`; hosted verification of the repaired source belongs to the eventual
published commit. No production source, guard, baseline or skip was changed.
