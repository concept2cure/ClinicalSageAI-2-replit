# Bounded qualification — QA script format strings

Canonical branch: `concept2cure-v2`.
Qualification baseline: `b015e409c268ca69965686710a18093b73e404b5`.
Reported remote Semgrep comparison ancestor:
`ca051e95053a2ef160183d6456e3ca82b8ebafa3`.

## Repair

All seven reported logging calls in
`docs/evidence/QA-2026-10-08/roles/repro-scripts/send-for-review.mjs`
now pass a literal format string such as `'[%s] role message:'` as the first
argument, followed by `TAG || EMAIL` and the unchanged payload expression.
This prevents percent tokens in the tag or email from becoming format directives.

Inspection found exactly seven console calls in the script, at lines 60, 61,
64, 65, 79, 82, and 83. Every call was repaired. No other dynamic console
format strings remain. Browser operations, confirmation behavior, output files,
labels, and payload expressions are unchanged. No suppressions, rule changes,
baseline changes, dependencies, or AnA features were added.

## Actual local validation

All checks used Node `v22.23.3` where Node was involved.

| Check | Actual result | Evidence |
| --- | --- | --- |
| Fail-first AST qualification before repair | Exit 1; seven nonliteral first arguments at the reported lines | `format-log-red.json`, original combined output `format-log-red.txt` |
| AST qualification after repair | Exit 0; all seven first arguments literal; labels and payload expressions match the pre-repair source | `format-log-green.json`, original combined output `format-log-green.txt` |
| Output meaning | 28 cases pass, including TAG fallback to EMAIL and `%s`, `%j`, `%d`, `%%` in tags | `format-log-green.json` |
| `node --check` on repaired QA script | Exit 0 | `node-check.txt` (empty successful output) |
| ESLint on qualification checker with `--max-warnings=0` | Exit 0 | `format-log-check-eslint.txt` (empty successful output) |
| Scoped `git diff --check` | Exit 0 | `diff-check.txt` (empty successful output) |

The checker uses the existing TypeScript parser to inspect console call syntax,
compares every repaired label and payload expression against the original
source, and uses Node's real `util.format` to verify output meaning. It does
not run the QA browser script, sign in, or send a document for review.

Reproduce from the repository root:

```sh
node docs/evidence/D4/2026-10-08-ana-speed-experience/semgrep-qualification/format-log-check.mjs
node --check docs/evidence/QA-2026-10-08/roles/repro-scripts/send-for-review.mjs
```

## Remaining qualification limitation

A focused local Semgrep scan could not run because this environment has neither
the Semgrep executable nor its Python module. Availability evidence is in
`semgrep-availability.json`. No installation or uncontrolled full scan was
attempted. The AST/output checks are local repair evidence; they do not replace
the remote Semgrep gate. Its next canonical-branch run must confirm the seven
reported findings are gone.
