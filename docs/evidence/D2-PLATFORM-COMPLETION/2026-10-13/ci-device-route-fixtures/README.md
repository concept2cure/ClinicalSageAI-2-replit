# Existing device-route test reconciliation

The focused current-tree run reproduced **15 failures and 52 passes** in the
two assigned files. Twelve successful 510(k) profile writes failed because the
old fake Drizzle builder supported neither an awaited pre-write snapshot nor
`UPDATE ... RETURNING`. Three device-project validation assertions expected an
older message without MDR Is/Im/Ir classes or explicit null withdrawal.

Only the existing two test files changed. The fixture now exposes the two real
query shapes and actual database-column snapshot keys. The audit assertion pins
both previous and submitted values. Existing role, tenant, missing actor,
predicate, unavailable-data and invalid-field coverage remains. Added controls
prove that US 510(k) accepts I/II/III and refuses regional classes; general
device-project validation accepts the canonical US/MDR classes and explicit
null withdrawal while refusing IV, malformed and IVDR values in that field.
Two current-state controls prove that a missing pre-write program or zero-row
update yields refusal and no audit claim of a completed change.

The final focused run passed **90 tests in two files, zero skips**. ESLint passed
both files with zero errors and zero warnings. `focused-red.txt` and
`focused-green.txt` retain the runner results; long test parameter displays are
explicitly truncated. `source-digests.json` identifies the reviewed source.

```sh
node node_modules/vitest/vitest.mjs run --config vitest.config.ts \
  tests/routes/510k-device-routes.test.ts \
  tests/routes/device-projects-patch-validation.test.ts
node node_modules/eslint/bin/eslint.js \
  tests/routes/510k-device-routes.test.ts \
  tests/routes/device-projects-patch-validation.test.ts
```

Run with Node 22. This is route-handler and validation regression evidence with
the existing mocked database lane, not native database or production audit-chain
qualification. No production source, native group evidence or browser records
were changed.
