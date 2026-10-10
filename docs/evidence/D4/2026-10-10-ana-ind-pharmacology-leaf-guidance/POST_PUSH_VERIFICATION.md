# Post-push verification — seven pharmacology summary leaves

Implementation: `88fa1606c5b50daf1cb50686d743fe26e041b441`.
Canonical branch: `concept2cure-v2`.
Published checked tree: `f96f37cb70e1dfbe4ca87938d4b0556d6fd6a845`.

The implementation was pushed directly after the complete canonical pre-push
hook passed. Local verification: 2,039 tests in 82 files, production client/server
build, no new changed-file ESLint warnings, and full-program TypeScript:
12,173 files checked exactly once in 15 workers, zero errors, unchanged snapshot,
aggregate exit 0. The raw completion and exact source pins are committed here.

Seven existing M4S pharmacology leaves now resolve and reach actual AnA drafting
as their own exact advisory records. All 127 original content records and the
other 115 structural records remain unchanged. The combined catalogue still has
249 codes and 203 terminals; exact terminal content rises to 110, with 93
structure-only terminals still open and initial IND applicability undetermined.
The related CMC reference tests now distinguish a structural parent from exact
content and reject unsupported deeper numbering without changing production
classification behavior.

## Remote checks for the exact implementation

Fresh push workflow IDs: CI `38028595001`, Tier 5 `38028595047`, Validate & Audit
`38028595017`, Semgrep `38028595000`, CodeQL `38028594996`, health refresh
`38028594991`. Every result below must be associated with the implementation SHA,
not a prior-head result or later documentation commit.

| Check | Run / job | Observed result |
|---|---|---|
| Security Scan | [38028595001 / 114144600174](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38028595001/job/114144600174) | Completed success: dependency-risk PASS, three existing reviewed High advisory occurrences, no Handlebars occurrence in the complete gate list; 36 regression tests passed. Trivy filesystem/config steps succeeded, with logged coverage limitations including failed Helm rendering for missing chart dependencies. This is not zero vulnerabilities or complete chart coverage. |
| Security Contract Tests | [38028595001 / 114144600266](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38028595001/job/114144600266) | Completed success. |
| Stock TypeScript / Validate & Audit | [38028595017 / 114144600104](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38028595017/job/114144600104) | Completed success: ordinary `tsc --noEmit`, zero errors, baseline zero, compiler exit 0. Optional workflow audits/evaluations were skipped; its ESLint step uses `npm run lint \|\| true` and is not an enforced lint gate. |
| Tier 5 fresh database and browser journey | [38028595047 / 114144600079](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38028595047/job/114144600079) | Completed success: all four named checks passed, including four migration-order regression tests, fresh PostgreSQL provisioning, two authenticated smoke tests including an unauthenticated negative control, and one governed golden journey. |
| Semgrep blocking scan | [38028595000 / 114144600069](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38028595000/job/114144600069) | Completed failure: seven fresh blocking delta findings relative to last-green ancestor `661a2c93`, scanner exit 1. None of this batch's seven changed source/test files appears in that delta list. The full advisory scan completed with 687 findings. The fresh logs independently confirm the same seven paths previously seen on the prior head; historical counts are not substituted for this result. |
| Broader CI | [38028595001](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/38028595001) | At 2026-10-10T05:59:56.450Z, run/Lint were still in progress, but five gates had already completed failure: proof tier (33), error-envelope reads (51), AnA register-entry selftests (58), raw-SQL tenant isolation (74) and requestDb/RLS adoption (84). Security, Security Contract and Secret Scan jobs passed; AnA readiness was not yet listed. Exact current-head failure causes require completed logs; the Lint archive still returned 404. The continuing run is not merely pending: completed failed gates already block release. |

Detailed evidence is recorded in
[REMOTE_SECURITY_AND_TYPECHECK.md](./REMOTE_SECURITY_AND_TYPECHECK.md) and
[REMOTE_TIER5_AND_CI.md](./REMOTE_TIER5_AND_CI.md), with exact job identities,
raw-log pins, and explicit timed limits for broader CI. Tier 5 verifies the existing
development browser/database path using the owner role. It does not qualify
production non-owner RLS boot, scientific source admission, initial-IND
applicability or live model output. The passing compiler, security and browser
checks do not override the failed Semgrep blocking step.

## Publication identity and limitations

GitHub's health bot followed the implementation with documentation-only commit
`96cea301fd1d98d80f40cb76653858137da33a9c`, sole parent `88fa1606`. Its only changes
are the two existing `docs/reports/repo-health-scan-latest` files. Those changes
are preserved. The final verification receipt is documentation only; all
non-documentation files remain byte-identical to the checked implementation.
[receipt-source-identity.json](./receipt-source-identity.json) reproduces this
identity across all 10,847 tracked entries outside `docs/`, including paths,
file modes and Git object identities. The candidate receipt is checked against
the same complete non-documentation listing before publication.
No PR, separate branch, forced update, security suppression, waiver or relaxed
compiler/test/security baseline was created.

Complete IND capability and release clearance remain open. Static primary-source
review and gateway doubles do not qualify scientific evidence, model output,
owned-program applicability or a filing. The 93 open catalogue terminals,
regulatory currency, lifecycle context and qualified model/human/end-to-end
coverage remain under `docs/design/ANA_IND_COVERAGE_PLAN.md`. The source-qualified
review prerequisite is concrete in `NEXT_GOVERNANCE_REPAIR.md`; its refusal tests
are proposed work, not delivered tests. Ten PK summary leaves are the next
bounded content batch.
