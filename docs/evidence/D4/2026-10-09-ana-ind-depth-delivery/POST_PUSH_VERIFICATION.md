# IND depth and dependency repair: post-push verification

Verified application implementation:
[`b4badf56fbe9038490bae860dc41f812bd966c27`](https://github.com/concept2cure/ClinicalSageAI-2-replit/commit/b4badf56fbe9038490bae860dc41f812bd966c27).
Canonical branch: `concept2cure-v2`. Verification date: 2026-10-09 UTC.
The implementation Git tree is `98f2d9615c44a1ded70c2b4e63e328e3a517b4f3`;
publication reproduced the checked local tree byte for byte.

## Fresh remote results against the implementation

All listed runs are push-triggered attempt 1 for the full implementation SHA.
Older database-repair results are not substituted for these fresh checks.

| Check | Actual observed result | Run / job |
| --- | --- | --- |
| Security Scan, including the live dependency-risk gate | Whole job succeeded. The gate accepted the unchanged three reviewed High advisory occurrences; no Handlebars Critical/High occurrence was listed. All 36 dependency/security regression tests passed. Filesystem/configuration Trivy steps also passed, subject to the scope limit below. | [CI 37996641066 / Security Scan 114044298588](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37996641066/job/114044298588) |
| Ordinary full-project TypeScript CLI | `tsc --noEmit`, baseline 0, completed with exit 0 and zero errors. This remote run used the default CLI path, without the optional diagnostic workers. | [Validate & Audit 37996640994 / 114044298127](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37996640994/job/114044298127) |
| AnA migration-order regression | All 4 tests passed. | [Tier 5 37996641034 / 114044297877, step 6](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37996641034/job/114044297877) |
| Fresh application-schema provisioning | Fresh PostgreSQL installation succeeded. | Same Tier 5 job, step 8 |
| Authenticated browser smoke | Both Chromium tests passed, including the unauthenticated redirect negative control. | Same Tier 5 job, step 9 |
| Governed document golden journey | The persisted review/provenance/export journey passed, including denied export before review and successful export after approval. | Same Tier 5 job, step 10 |

Tier 5 run 37996641034 completed success at 22:02:31 UTC. All four named
steps executed; none was skipped. Its uploaded smoke artifact is
`11647670468` (96,033 bytes). The Security Scan audit artifact is
`11647187813`; its recorded ZIP digest is
`16ceede57cd3209b59c8140caa343659146b9a04109fafd88ba330880a06b584`.
The dependency gate verifies lockfile SHA-256
`529a8e5889cf500959484df70c561d27746437aa3a4c7d043cd70a5c551e3961`.

The dependency repair closes the identified Handlebars blocker. Reviewed
`braces` and `image-size` advisories remain. A passing reviewed-risk gate is
not a zero-vulnerability claim. The Validate & Audit workflow's ESLint step
uses `|| true`; its step status is not counted as an enforced lint gate here.
Trivy's configuration log reports Helm rendering failures for both charts
because PostgreSQL/Redis chart dependencies are absent. Its successful step
does not establish inspection of those rendered chart templates.

## Local verification and test-only scanner follow-up

The implementation passed 1,965 selected tests in 80 files, 36 dependency and
security tests, 27 full-program compiler-gate fixtures, the production build,
and the complete canonical pre-push hook. The hook checked all 12,171 source
files exactly once in 15 full-context workers, found zero TypeScript errors,
verified one unchanged compiler-input snapshot, and exited 0. Raw logs and
explicit completion are linked in [DELIVERY_RECORD.md](./DELIVERY_RECORD.md).
These local test groups overlap; their counts are not added into a new total.

The remote Semgrep gate on the implementation rejected eight findings.
Comparison with the previous branch head `b879e9a9` identified seven already
reported file/rule identities and one additional dynamic regular expression
in the new CMC test. The test now asserts the same provenance string suffix
literally. A second test mock now uses a named erased TypeScript alias so the
scanner parses it without warnings. These two test edits change no application
runtime, UI, dependency, compiler setting, scanner rule or risk decision.

An isolated Semgrep OSS 1.177.0 scan of the repaired follow-up, using the
existing workflow flags and baseline `b879e9a9`, completed with exit 0,
zero new/blocking findings and no parser notifications. All 314 tests in the
two changed suites passed; focused ESLint reported zero errors and warnings.
The test-only red/green receipts and final complete hook result are retained
in [the scanner compatibility evidence](../../D6/2026-10-09-ind-test-scanner-compatibility/README.md).
The final canonical hook against local commit `6dc5a3122aa6101eb1767d291b0408e229c6feea` also
completed success in 1017.33 seconds: all 12,171 source files checked
exactly once, 15 full-context workers, zero errors, unchanged snapshot and exit 0.
Its snapshot was `34a6059d11fab9a997437f2aca19e0fb832575ff40d327cab8d01f0d966021cf`. The complete
[raw output](../../D6/2026-10-09-ind-test-scanner-compatibility/pre-push-green.txt)
and [explicit completion](../../D6/2026-10-09-ind-test-scanner-compatibility/pre-push-completion.json)
are permanent receipts. Only documentation and the bot's generated reports
were integrated after this check; all non-documentation tracked files remain
byte-identical to that checked commit. The exact Git tree-entry digest for all
10,845 tracked paths outside `docs/` is pinned in
[checked-source-identity.json](./checked-source-identity.json) and was checked
again before publication.

GitHub's repository-health automation subsequently added
`912345087bb7b7626ae7557eed61c6c2b38932f4`, changing only its two generated
reports under `docs/reports/`. Publication of the follow-up preserves that
commit and its reports. The post-implementation follow-up contains test and
documentation changes only; remote results above remain attributed to the
implementation SHA actually tested.

## Broader release and complete IND qualification remain open

CI run 37996641066 has a completed failed Lint job, including these failed steps:
proof-tier contracts/golden journeys, hand-rolled error-envelope reads,
AnA register-entry enforcement, raw-SQL tenant isolation, and requestDb/RLS
adoption. Completed logs identify a duplicate-column fixture setup failure and
the specific guard findings in [the timestamped wider CI receipt](./REMOTE_TIER5_VERIFICATION.md).
Main CI's ordinary and beta TypeScript steps also passed; those passes do not
override the failed guards. The dependent AnA Readiness job `114051449968`
subsequently passed 303 tests in four files. That suite does not run the new
IND tests. The wider Test job and full CI run are not reported as passing.
The separate blank-database job also failed its tenant-purge reachability gate
for `stats_computation_runs`. The Production Boot Smoke passed under a
non-owner application role, but reported deterministic AnA responses and
skipped Redis/worker capabilities; it does not qualify live-model drafting.
The real-database integration test step also completed failure; its detailed
causes were not yet available at the recorded observation. Pending wider
test/coverage outcomes do not override these completed failures.

[Semgrep run 37996641125 / job 114044300653](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37996641125/job/114044300653)
completed failure. Its blocking gate compares against the older green commit
`661a2c93aff2f7799e8d55f7ab0f92d5ebfcac19`, not `b879e9a9`.
The repaired local incremental scan proves no additions relative to `b879e9a9`;
it does not clear the seven other reported findings or retroactively turn the
failed remote run green. The full non-gating Security-tab scan reported 688
findings, compared with 687 in the prior `b879e9a9` run. No finding is waived by this
receipt. See [remote security details](./REMOTE_SECURITY_VERIFICATION.md).

The real browser/database pass used development authentication, a PostgreSQL
owner/single-role posture, unavailable AI/Redis services and non-production
audit fallback; it does not qualify live-model drafting, production tenant
isolation, virus scanning or operational deployment. Scenario-specific
scientific, source-version, temporal and human-review qualification remains
required.

The 249-record lifecycle catalogue has 203 terminal nodes: 103 exact-content
and 100 structure-only. These are catalogue counts, not initial-IND required
document counts. Every remaining terminal node and its qualification needs are
enumerated in [ANA_IND_REQUIREMENTS_BACKLOG.md](../../../design/ANA_IND_REQUIREMENTS_BACKLOG.md),
governed by [ANA_IND_COVERAGE_PLAN.md](../../../design/ANA_IND_COVERAGE_PLAN.md).
The 275 area/modality wiring cases prove propagation, not scientific acceptance
of every combination. This bounded implementation and verification batch is
delivered; complete IND qualification and overall release clearance are open.
