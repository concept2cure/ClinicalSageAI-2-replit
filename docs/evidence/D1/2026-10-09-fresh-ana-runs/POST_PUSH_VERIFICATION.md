# Fresh-install repair: post-push verification

Recorded: 2026-10-09.
Repository: `concept2cure/ClinicalSageAI-2-replit`.
Branch: `concept2cure-v2`.
Scope: D1, fresh-install AnA run/event dependency ordering.

## Closed scope

The implementation commit is `a17157f33ebc94ba63d9fbf1a39e15d8dbb84970`.
Its parent is the governance integration commit `c91dba52643166621a33ec7eab4ca2fc143a2c02`.
The canonical branch was read again during closeout and still contained the implementation commit.

The repair reuses `db/migrations/20260917_ana_runs.sql` in
`scripts/db/install-fresh.mjs`'s pre-overlay creators. This supplies the
`ana_runs` parent before `migrations/20261008f_ana_run_events.sql` creates its
foreign key. The native regression suite and Tier 5 workflow changes are
included in the same implementation commit. No alternate schema creator,
authentication bypass, UI change, or incomplete-install exception was added.

## Executed remote evidence

Workflow: **Tier 5 Browser Smoke**.
Run: `37983068322`, attempt 1.
Job: `113998150775`, **Authenticated app smoke (real browser + DB)**.
Tested commit: `a17157f33ebc94ba63d9fbf1a39e15d8dbb84970`.
Job conclusion: **completed / success**.

The job was fetched directly from GitHub during closeout. These are actual
completed step conclusions, not expected results or local syntax checks:

| Step | Conclusion |
| --- | --- |
| Check AnA fresh-install migration ordering | success |
| Provision the application schema from scratch | success |
| Run the authenticated browser smoke | success |
| Run the WO-06 governed golden journey | success |
| Upload smoke artifacts (traces, screenshots, results) | success |

Run receipt:
https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37983068322

Job receipt:
https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37983068322/job/113998150775

Regression source:
`tests/schema-contracts/install-fresh-ana-runs.pglite.test.ts`.

The implementation and its targeted remote verification are complete.
No additional runtime modification was needed for this closeout.

## Broader CI is not green

Main CI run `37983068656` was still in progress when inspected, but its
**Security Scan** job `113998152917` had already completed with failure.
The failed step was **Run lockfile audit and dependency-risk ledger gate**.
The decoded job log reported:

```text
Dependency risk gate: unreviewed Critical/High finding(s): handlebars
```

This is a separate dependency-risk finding, not the missing-parent
provisioning error. The finding has **not** been repaired or accepted by
this closeout. Its exact advisory, affected dependency chain, compatibility
impact and tested remediation must be established before changing the
lockfile or making any risk-acceptance decision. Do not add an exception
or suppress the check merely to obtain a green result.

Main CI receipt:
https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37983068656

Security job receipt:
https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37983068656/job/113998152917

An overall workflow still running can contain a failed job. Therefore a
query for completed failed workflow runs is not sufficient to establish
that CI is clean; job-level conclusions must also be checked.

## Qualification boundary

This receipt closes the fresh-database provisioning defect and records the
successful execution of the existing Tier 5 tests on the implementation
commit. It does not establish all CI gates passing, production deployment,
full database concurrency qualification, authenticated scientific-source
qualification, or comprehensive IND coverage.

The earlier delivery record's statements about tests not run **locally**
remain accurate. The successful tests above ran **remotely in GitHub
Actions**. The documentation-only closeout commit is not itself the tested
implementation SHA; this record deliberately pins the executed evidence
to the exact revision that was tested.
