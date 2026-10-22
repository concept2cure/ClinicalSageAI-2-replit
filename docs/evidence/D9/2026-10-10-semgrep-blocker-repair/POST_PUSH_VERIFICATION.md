# W7 / D9: completed post-push verification

The seven-site Semgrep delta repair is verified on published implementation
`de61922a9351080fdcd76a231c5abd8182054831`. Its fresh blocking and full advisory
scanner steps completed successfully. The overall release remains blocked by
separate CI failures, and the broader IND work is unfinished.

Repository: `concept2cure/ClinicalSageAI-2-replit`; sole branch:
`concept2cure-v2`. Implementation tree:
`ae8a1ae9e50b346021b9979a14f7f0ee948f10cd`; sole parent:
`2c9a4a5fefc639d6d5ccf3dda139f3d64d6b2115`. Fresh push runs were created at
`2026-10-10T06:31:45Z`, attempt 1. This receipt is documentation only; it does
not change the verified runtime, UI, test sources, or executable QA helper.

## Fresh completed checks

| Check | Exact fresh run / job | Result |
| --- | --- | --- |
| Semgrep blocking delta | [38031251350](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38031251350) / 114152480400, step 5 | Success; zero delta findings |
| Full advisory scan and uploads | Same run / job, steps 6–8 | Success; 680 advisory findings remain; whole run and job success, run updated at 06:47:19Z |
| AnA migration-order regressions | [Tier 5 38031251300](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38031251300) / 114152480276, step 6 | Four tests passed |
| Fresh application-schema provisioning | Same Tier 5 job, step 8 | Success on PostgreSQL; 808 public tables and 1,004 RLS policies reported |
| Authenticated browser smoke | Same Tier 5 job, step 9 | Two tests passed, including the unauthenticated redirect control |
| Governed document golden journey | Same Tier 5 job, step 10 | One test passed; export refused with 403 before review, then review and export returned 200 |
| Dependency-risk gate | [CI 38031251355](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38031251355) / Security Scan 114152480619 | Job success; gate PASS; 36/36 regression tests |
| Ordinary stock compiler | [Validate & Audit 38031251357](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38031251357) / 114152480600 | `tsc --noEmit`: baseline 0, errors 0, compiler exit 0; job and run success |

The completed scanner log reports 492 rules over 3,039 files in its delta phase
and 647 rules over 21,215 files in its full advisory phase. The blocking phase
also reports three rule-timeout warnings on `shared/schema.ts`. A passing
configured gate is not an exhaustive clean scan. Exact baseline identity,
timeout rules, skipped-file limits, decoded-log digests and the downloaded
SARIF artifact are recorded in [REMOTE_SCANNER_AND_TIER5.md](REMOTE_SCANNER_AND_TIER5.md)
and its pinned metadata. The 680 full-scan findings are separate from the zero
blocking delta; no finding was suppressed or waived by this repair.

The downloaded full-scan SARIF has 721 result entries: 680 unsuppressed findings
and 41 existing `inSource` suppressions. It records 651 warning notifications
(624 syntax errors, 24 other syntax errors and three timeouts). None of the eight
changed source/test/fixture paths appears in a result or warning notification.
The existing suppressions are reported as coverage context; this repair adds none.

The fresh dependency-risk gate lists three existing reviewed High occurrences,
in `braces` and `image-size`, with `unreachable` decisions. Handlebars is absent
from that complete gate occurrence list. This is not a claim that the entire
dependency tree has no vulnerabilities: installation reports 76, including 31
High. Existing development-dependency suppression and Trivy coverage limits
remain explicit, including incomplete Helm rendering. See
[REMOTE_SECURITY_AND_COMPILER.md](REMOTE_SECURITY_AND_COMPILER.md).

Tier 5 uses its recorded PostgreSQL owner role and development signing/auth
configuration. It establishes the exercised provisioning and browser behavior,
not production non-owner RLS qualification, a regulated signing ceremony,
scientific source qualification, reviewer-observed immutable version binding,
live-model PQ, or submission readiness. Its artifact JSON contains only the
final golden invocation; the preceding smoke tests are independently evidenced
by the completed step and original job log.

## Local verification and source identity

The final affected regression run passed 100 tests in five files. The expanded
ten-test public parser suite passed before and after the runtime edit. The
signed-target harness passed 111/111 cases with explicit SQLite/ORM/schema/
identity/audit doubles. Production build succeeded. Focused lint had zero errors
and seven existing warnings; the canonical warning ratchet was unchanged and
passed. These results are bound by [local-validation.json](local-validation.json).

The full unchanged canonical pre-push hook completed at
`2026-10-10T06:30:40.891138+00:00`, exit 0, against local checked commit
`43d8dc57ee15a88983d869b34876dead792a4413`. All 12,173 source files were checked
exactly once in 15 full-program workers, with unchanged snapshot and zero
errors. All other hook gates passed. Node 22.23.3 and the canonical
`TYPECHECK_HEAP_MB=6144 TYPECHECK_FILES_PER_PROCESS=1000` mode were used; no gate
or source was weakened. Original log SHA-256:
`325d374e375e9574e8ab818f6b9ca6abe09882fc0d976a5ce8874eeb5cca62f4`.

The post-gate local candidate `58e451eebd032d20df934e35a92a5c2e4195d587` added
only this D9 batch's documentation. Its entire tree equals published `de61922a`.
All 23,151 tracked entries outside this D9 evidence folder remain identical to
the checked source, including the executable historical QA helper under
`docs/evidence/QA-2026-10-08/`. All eight final scanner-source pins match the
published blobs. See [source-gate-identity.json](source-gate-identity.json) and
[publication-source-identity.json](publication-source-identity.json).

The source repair preserves parser output and matching state, literal fixture
refusal assertions, retired signing-authority controls, fixed migration reads,
per-test packaging isolation, and exact accessible tab selection. It does not
make the narrow XML recognizer a conforming or generally hardened XML parser.
The historical QA helper has syntax and selector-source review; its correction
does not create a new historical browser-run receipt. The UI, dependencies,
workflow, scanner configuration, policy baselines and ignore lists are unchanged.

## Separate release and IND blockers

At `2026-10-10T06:50:23.378Z`, fresh main CI run 38031251355 has completed failures in Lint job 114152480553
at steps 33 (proof tier), 51 (error-envelope readers), 58 (AnA register reads),
74 (raw-SQL tenant isolation) and 84 (request-scoped database adoption).
The Lint job is still running step 124 at that capture; completed fresh cause
logs are unavailable, and later pending steps supply no verdict. The timestamped state is in
[REMOTE_SECURITY_AND_COMPILER.md](REMOTE_SECURITY_AND_COMPILER.md). A successful
scanner, browser, dependency-risk or compiler job does not override these failures.

The earlier five guardrail defects and separate `stats_computation_runs`
tenant-purge coverage failure are documented in [REMAINING_CI.md](REMAINING_CI.md).
Their ten underlying sources are unchanged in this implementation, as pinned in
[remaining-blocker-source-identity.json](remaining-blocker-source-identity.json).
Historical results and source identity are not substituted for fresh job results.
No requestDb adoption, tenant purge repair, guardrail repair, or scientific review
writer repair is included in this scanner batch.

The IND catalogue still has 93 structure-only terminals: 60 in Module 2, two
in Module 3, 17 in Module 4 and 14 in Module 5. Their initial-IND applicability
is undetermined. Scientific review/seal admission, owned applicability facts,
current reviewed source evidence, regional/deeper hierarchy, guidance currency,
qualified model behavior and representative governed end-to-end qualification
remain open. [REMAINING_IND_WORK.md](REMAINING_IND_WORK.md) binds that scope and
the recommended next content batch, `2.6.4.1` through `2.6.4.10`.

This bounded scanner repair is complete. Overall release clearance and complete
IND qualification have not been established. No PR or separate branch was
created, and no security check was suppressed.
