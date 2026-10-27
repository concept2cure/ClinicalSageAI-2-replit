# D2: focused CI reference fixes

Verified on 2026-10-27 against base commit `0a07f49d7cf0b3dc179d4dca87b9bf5c767bc56d` on `concept2cure-v2`.
The working tree was clean before this scoped repair.

## Publication boundary

The obsolete Semgrep exemption is removed in the canonical repository. The two
prose repairs below are locally verified and retained in
[`activation-repairs.patch`](activation-repairs.patch), together with the
compatible dependency updates. They are not applied to the canonical source
files by this evidence publication. The complete compiler verdict remains
incomplete, and the dependency lock requires the existing WO-07 review and
reseal process. This publication does not extend the earlier owner decision for
the CSR integration to a new compiler or dependency-risk exception.

## What already exists

- `scripts/ci/review-semgrep-evidence.py` validates exact historical evidence paths, classifications and SHA-256 fingerprints before emitting exclusions for the differential scan. Its existing self-tests are in `scripts/ci/__tests__/semgrep-evidence-review.test.mjs`.
- `.github/workflows/semgrep.yml` uses that validator for its differential scan and separately runs the complete Security-tab scan without these exclusions.
- `scripts/ci/check-migration-reachability.mjs` exports the existing pure `referencedTables`, `sqlishSegments` and `relationsIn` helpers; the live-schema guard shares that reference scanner. This repair uses those helpers without changing the parser or executing the durable-schema compiler.
- History inspection (`git log --all --diff-filter=D` for the affected evidence/helper paths) identified deletion of the obsolete QA helper in `cc1607c3a36d2e4afab96383c96aa5d1702e6821`. No replacement scanner or security exception mechanism was added.

## Reproduction and changes

The 25-entry Semgrep review contained exactly one missing file. The remaining 24 files existed and matched their recorded fingerprints. The current-manifest self-test failed with:

```text
Semgrep evidence review refused: reviewed evidence changed or disappeared: docs/evidence/D2-PLATFORM-COMPLETION/2026-10-14/submission-live-browser/scripts/start_qa.py
```

Removed only that orphaned entry from `scripts/ci/semgrep-reviewed-evidence.json`. Its prior recorded SHA-256 was `aaabdb4134a84a603867733059b37ac567a38f07b103b80fdbb5624757bca61f`. The missing source was not reconstructed, and no fingerprint was replaced. Removing the entry reduces the exemption set: if the path returns, it receives no exemption from this manifest.

Two ordinary prose strings were admitted by the existing SQL heuristic because they contained “select” followed later by “from.” The scanner then emitted the nonexistent relation names `that` and `conversation`. Only these words changed:

| Source | Before | After | Meaning retained |
| --- | --- | --- | --- |
| `server/services/ana/skills/library/diagnostics.ts` | `select or assign trial patients` | `identify or assign trial patients` | The assay must be analytically validated before enrollment; the surrounding biomarker, enrichment, risk/IDE and bridging guidance remains intact. |
| `server/services/labeling/labeling-intelligence-knowledge.ts` | `do not select or apply a template` | `do not choose or apply a template` | Conversation facts still cannot authorize product-specific template use; drafting still requires cited source records in governed authoring. |

## Verification

| Existing check or observation | Before | After |
| --- | --- | --- |
| Semgrep evidence self-tests | 13 passed, 1 failed | 14 passed, 0 failed |
| Direct evidence validator | Exit 1: missing historical file | Exit 0: 24 fixed-byte historical files accepted |
| Manifest entries / missing or mismatched files | 25 / 1 | 24 / 0 |
| Pure reference scanner: distinct repository relations | 762 | 760 |
| Pure reference scanner: relation-file pairs | 2,589 | 2,587 |
| Relations emitted from the two edited source files | `that`; `conversation` | None |

Executed the existing tests directly with `node scripts/ci/__tests__/semgrep-evidence-review.test.mjs` and the validator with `python3 scripts/ci/review-semgrep-evidence.py --write-excludes /tmp/c2c-ci-reference-excludes-after.txt`. The 14 tests include refusal of changed bytes, unrelated rules, application paths, globs, traversal, duplicate paths, absent review metadata and symlinks.

For the focused reference check, an inline Node module imported the three existing helpers from `scripts/ci/check-migration-reachability.mjs`, called `referencedTables()` and applied `sqlishSegments` / `relationsIn` to the two source files. Assertions confirmed a decrease of exactly two distinct relations and two relation-file pairs, with neither phantom name present afterward. This was a direct execution of the existing scanner, not a new test or copied parser. Reports are `/tmp/c2c-ci-reference-scanner-before.json` and `/tmp/c2c-ci-reference-scanner-after.json`; the passing self-test log is `/tmp/c2c-ci-reference-semgrep-after.log`.

`git diff --check` passed. No gate, scanner, baseline, dependency, workflow, SQL statement, original evidence file or validator was changed. No full compiler, full Semgrep security scan, deployment or publication was performed by this scoped repair. These results resolve the named reference failures only; they do not establish broader security clearance or completion of all CI jobs.
