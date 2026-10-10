# W7 / D9: repair the seven fresh Semgrep delta blockers

Baseline: `2c9a4a5fefc639d6d5ccf3dda139f3d64d6b2115`, on the sole
`concept2cure-v2` branch. The preceding implementation's GitHub Semgrep run
`38028595000`, job `114144600069`, failed on seven blocking delta findings.
Its permanent receipt is in
`../../D4/2026-10-10-ana-ind-pharmacology-leaf-guidance/REMOTE_TIER5_AND_CI.md`.
This batch repairs those source patterns; it does not clear the overall release.

| Finding path | Repair and preserved behavior |
| --- | --- |
| `server/services/clinical-regulatory-evidence/dataset-profile.ts` | Select fresh literal patterns for the two closed define.xml element names. Preserve captures, paired/self-closing elements, attributes, output shape, and per-invocation matching state. |
| `server/services/__tests__/artifact-approval-review-integrity.pglite.test.ts` | Assert the fixture's literal refusal message with `toContain`; its six expected phrases contain no regex operators. |
| `server/services/__tests__/fixtures/artifact-signed-target-harness.cjs` | Assert the fixture's literal expected error with `includes`; the fixture phrases remain unchanged. |
| `server/services/part11/__tests__/one-signing-authority-policy.test.ts` | Three explicit declaration patterns preserve the same retired names and matching boundaries. Positive and negative controls exercise the same helper used by the real tree policy gate. |
| `server/services/tasking/__tests__/task-project.pglite.test.ts` | A closed manifest of five literal file URLs reads the same migrations without constructing a path from a caller's arbitrary string. |
| `server/services/ana/__tests__/package-ectd-for-region-recorded-identity.test.ts` | Each fixture allocates its own private scratch directory and closes model input over its cover and output paths. Recorded identity, refusal assertions, and per-test isolation are preserved. |
| `docs/evidence/QA-2026-10-08/walk2-majors/walk-2/h.mjs` | Select an exact accessible tab name. The current Submission Center renders these controls with `role="tab"` and their text label. Historical browser outcomes are not rerun or rewritten by this helper correction. |

The runtime profiler is the only production code change. Its expanded ten-test
public API suite passed both before and after that change. Other changes are
test fixtures, policy test controls, and the executable QA helper. The UI,
dependencies, workflow, policy baseline, and scanner configuration are unchanged.

## Local evidence

`local-scanner-tooling.json` pins Semgrep CLI/core 1.177.0, the unchanged complete
`p/default` and `p/ci` registry responses, and both official blocking rules.
The compressed configs retain the exact original bytes for reproduction.
The local environment uses that CLI/core, rather than the workflow container.

`local-semgrep-red.*` scans byte-identical baseline blobs and proves the
failure branch: seven findings, no errors, exit 1. The first green scan is
explicitly intermediate; its packaging fixture hash predates the final
per-case isolation refinement. Only the final green metadata may bind the
published source. These are target-scoped scans, not whole-repository security
certification. The authoritative post-push workflow remains required.

`regression-final.txt` records 100 passing tests in five affected suites.
`dataset-profile-compatibility-before.txt` and
`dataset-profile-compatibility-after.txt` show the expanded ten-test parser suite
passing before and after the runtime edit. `signed-target-results.json` records
111 passing signed-act cases with zero failures. That harness executes the
production service modules and SQLite transaction/rollback behavior with explicit
ORM, schema, identity, and audit doubles; it does not qualify PostgreSQL RLS,
HTTP authorization, or an electronic signing ceremony.

`build.txt` records a successful production build. The subsequent packaging
refinement affects a test fixture only. `changed-lint.txt` records zero errors
and seven existing harness warnings; the unchanged canonical hook determines
the actual warning ratchet. `local-validation.json` pins the captured raw receipts
and all eight final source files.

The full unchanged canonical pre-push hook completed at
`2026-10-10T06:30:40.891138+00:00`, exit 0, against checked local source commit
`43d8dc57ee15a88983d869b34876dead792a4413`. All 12,173 source files were checked
exactly once in 15 full-program workers, with unchanged source snapshot and zero
errors. All other hook gates passed, including the unchanged warning ratchet.
The memory-bounded canonical mode used Node 22.23.3 and
`TYPECHECK_HEAP_MB=6144 TYPECHECK_FILES_PER_PROCESS=1000`; no source or gate was
modified to make this run pass. Original output and atomic completion metadata
are in `pre-push.txt` and `pre-push-completion.json`.
`source-gate-identity.json` binds the eight source blobs and every tracked entry
outside this new D9 evidence folder. Subsequent documentation additions must
preserve that entire projection, including the executable QA helper.

## Limits and remaining work

Literal pattern selection removes dynamic regular expression construction for
two fixed element names. The existing narrow XML recognizer, XML conformance
limits, and malformed-input backtracking behavior remain; this is not a general
XML parser hardening claim. The QA helper has syntax and selector-source review,
not a new browser journey receipt.

No finding is suppressed or waived. No `nosemgrep`, dependency, scanner rule,
workflow, ignore list, security baseline, or policy caller allowance is changed.
The previous full advisory scan still had 687 findings, and the previous main CI
had already failed other gates. Those results are separate from this seven-site
repair. The IND catalogue still has 93 structure-only terminals; scientific
qualification, applicability decisions, governed approval, and other launch
rows remain open. A permanent post-push receipt must report fresh observations
and their exact source commit before this batch is considered verified remotely.

The completed [post-push verification receipt](POST_PUSH_VERIFICATION.md) records
fresh results on `de61922a`: the whole Semgrep workflow passed with zero blocking
delta, while 680 full-scan advisory findings and explicit coverage limits remain.
Tier 5, the dependency-risk gate and ordinary stock TypeScript also passed. Five
separate main-CI guardrails have fresh failures; the broader release and IND
qualification remain open. The receipt and pinned remote records preserve those
distinctions.
