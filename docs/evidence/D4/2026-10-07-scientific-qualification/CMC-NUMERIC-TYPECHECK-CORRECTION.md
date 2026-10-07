# CMC numeric qualification fixture — TypeScript correction

2026-10-07; W3 / D4. Test-only follow-up to published revision
`3bd8ac52e0d150d01e95c6210621613f1f601c41`. C2C CI run `37603301722`, TypeScript
job `112732651120`, reported ten new errors in the heterogeneous invalid-input
`it.each` table: nine `TS2769` overload errors and one `TS2345` callback error.
The control tower retained the actual GitHub RED output. The zero TypeScript
baseline was not changed.

The table mixed scalar strings with null, undefined, booleans, numbers, arrays,
and objects. Vitest's array/tuple overloads could not infer that collection as
individual unknown values. The correction explicitly types the input collection
as `unknown[]`, maps each value to a named `{ input }` case, and destructures that
case in the callback. No cast or suppression is needed. In particular, `[12]`
and the object cases reach `parseNumeric` intact; they are not spread into test
arguments, stringified, or removed. All runtime cases and assertions remain.

Only `server/services/cmc/__tests__/recorded-numeric-qualification.test.ts` was
edited. No production code, compiler configuration, dependency, baseline,
scientific logic, or approval gate changed. The repository subsequently
fast-forwarded to the report-only child
`c96abba04d2e43932779392dc91fe2a2abe49c57`; this correction was verified on that
revision. Earlier qualification output remains preserved as the run it was.

## Local RED and GREEN

An isolated probe copied the exact invalid-input table and callback from the
test, imported the installed Vitest types, and declared the unchanged
`parseNumeric(value: unknown): number | null` signature. It imported no
production dependency tree. The same command was run before and after the fix:

```sh
./node_modules/.bin/tsc --noEmit --strict --target ES2020 --module esnext \
  --moduleResolution bundler --skipLibCheck --types node \
  --typeRoots ./node_modules/@types /tmp/cmc-numeric-fixture-types.ts
```

| Check | Actual result |
| --- | --- |
| Isolated original table | Exit 2; nine TS2769 and one TS2345 diagnostics |
| Isolated corrected table | Exit 0; zero diagnostics |
| Complete 17-file CMC regression manifest | 17 files, 857 tests passed |
| ESLint on the edited test | Exit 0; zero errors, zero warnings |
| Scoped `git diff --check` | Passed |

The 17-file run used the main and additional manifests in
[CMC-NUMERIC-RESULTS.md](CMC-NUMERIC-RESULTS.md), together in one
`npx vitest run --config vitest.config.ts` invocation. Actual completion output:

```text
 Test Files  17 passed (17)
      Tests  857 passed (857)
   Start at  05:58:44
   Duration  21.18s (transform 8.66s, setup 508ms, import 14.57s, tests 926ms, environment 2ms)
```

Focused lint command:

```sh
npx eslint server/services/cmc/__tests__/recorded-numeric-qualification.test.ts
```

Independent read-only review confirmed the installed Vitest overload selects
`{ input: unknown }` cases and preserves the original values at runtime. That
review also performed an isolated TypeScript check with zero diagnostics.

This scoped probe does not claim whole-repository TypeScript success. Full local
TypeScript was not rerun because of the known memory limit. The control tower
will republish and verify the corrected exact revision in GitHub CI; no worker
commit or push was performed.
