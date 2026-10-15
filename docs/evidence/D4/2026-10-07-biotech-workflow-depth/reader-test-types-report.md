# W2 / D4 — reader regression test's own TypeScript contract

The bounded compiler regression test itself declared a mutable `ts.Diagnostic[]` return, while `ts.getPreEmitDiagnostics` returns `readonly Diagnostic[]`. An isolated strict check of the actual test file reproduced TS4104. The repository application tsconfig does not include `tests/regulatory`, so its normal gate alone would not catch this test-only defect.

The correction changes the helper's declared return to `readonly ts.Diagnostic[]`, matching the API. It adds no cast or suppression and changes no production code or runtime behavior.

- `reader-test-types-red.txt`: isolated strict compilation failed with TS4104 before the correction.
- `reader-test-types-green.txt`: the identical isolated command completed with exit 0 and no diagnostics afterward.
- `reader-test-types-runtime.txt`: both bounded read-contract tests passed.
- `reader-test-types-lint.txt`: ESLint completed with exit 0 and no errors or warnings.

No local application-graph or whole-project typecheck ran. The check targets only the actual test file and its external type dependencies. The source revision containing this correction still needs publishing and the lead session's pushed-source verification.
