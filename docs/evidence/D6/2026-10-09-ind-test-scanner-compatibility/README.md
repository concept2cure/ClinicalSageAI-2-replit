# IND regression assertions and security-scanner compatibility

Published application implementation: `b4badf56fbe9038490bae860dc41f812bd966c27`
on `concept2cure-v2`. This follow-up changes two test files and evidence only.
Application runtime, UI, compiler scripts/configuration, dependency versions,
review decisions and scanner configuration remain unchanged.

An isolated Semgrep OSS 1.177.0 incremental scan against the prior branch head
`b879e9a9e4e92e683ffe48ad26d8eac8a51c23b0` completed and rejected one finding:
`javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp`
in the new CMC drafting regression. The test constructed a regular expression
from each recorded section code to assert the provenance suffix. It now checks
that the provenance value is a string and asserts its literal expected suffix.
No regular expression construction, waiver or rule suppression is needed.

The scanner also reported a parser warning for the product-advisory mock's
inline generic module import. A named, erased TypeScript alias and a separate
typed `actual` import preserve the same mock factory exports and behavior while
allowing the scanner to parse the file. The repaired scan has no parser
notifications. These changes preserve test assertions and mocked behavior;
they add no production capability.

The red and green checks use the existing workflow's command flags:

```sh
semgrep scan --config=p/default --config=p/ci --metrics=off --error \
  --baseline-commit b879e9a9e4e92e683ffe48ad26d8eac8a51c23b0 \
  --sarif-output=/tmp/concept2cure-semgrep-repaired.sarif
```

The local scanner runs from an isolated temporary environment; it is not an
application dependency. Evidence is saved here as `semgrep-red.txt`,
`semgrep-green.txt`, `semgrep-red.sarif` and `semgrep-green.sarif`.
The completed repaired scan reports zero new findings and zero blocking
findings relative to `b879e9a9`: 213 rules run on 58 changed targets, successful
execution, and no parser notifications. Existing defaults still skip two files
over 1 MB and four matching inherited ignore patterns. This incremental check
does not establish full-repository security clearance or waive findings against
the older green baseline used by remote CI.

Both changed test suites passed all 314 tests after the repair. The ordinary
remote TypeScript check, full Security Scan and all four Tier 5 checks already
passed against `b4badf56`. The final canonical pre-push check for these test-only
changes completed success against `6dc5a3122aa6101eb1767d291b0408e229c6feea` in 1017.33
seconds. All 12,171 files were checked exactly once in 15 full-context workers;
zero errors, one unchanged snapshot and exit 0. The snapshot was
`34a6059d11fab9a997437f2aca19e0fb832575ff40d327cab8d01f0d966021cf`. The complete [hook log](./pre-push-green.txt)
and [completion record](./pre-push-completion.json) are retained. Remote results
remain attributed to the actual implementation SHA in the
[post-push receipt](../../D4/2026-10-09-ana-ind-depth-delivery/POST_PUSH_VERIFICATION.md).
The broader remote proof-tier and Semgrep failures remain separate blockers.
