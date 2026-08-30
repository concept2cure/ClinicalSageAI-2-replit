# Release governance for `concept2cure-v2`

**Inspection date:** 2026-08-25 (UTC)  
**Repository:** `concept2cure/ClinicalSageAI-2-replit`  
**Product branch:** `concept2cure-v2`

## Verification status

GitHub settings are **not verified and were not changed** by WO-02. The
available environment had no configured Git remote, `gh auth status` reported
that it was not logged in, and unauthenticated GitHub API requests were blocked
by the environment's network proxy. Consequently, this document does not claim
that the default branch, a ruleset, branch protection, required checks, merge
settings, bypass actors, or administrator enforcement are configured.

## Verified green release evidence (2026-08-28)

The blocker this document was written under — "no live check contexts could be
read safely" — is closed. Commit `16464f5e6` produced the first fully green
same-commit CI on `concept2cure-v2`: **20 jobs, 0 failures**, with no required
job skipped. The five skipped jobs on that run are conditional by design
(`Nightly Governance Strict` is `if: github.event_name == 'schedule'`; the four
`c2c-agent` jobs are `workflow_dispatch`-gated), not release checks.

Proven on that one commit, each by a job that actually ran:

| Exit criterion | Job |
| --- | --- |
| Fresh install + upgrade migration | `Blank DB Provisioning + Deploy Migration` |
| Production boot under non-superuser RLS | `Production Boot Smoke (RLS on, non-superuser role)` |
| Authenticated browser + live golden journey | `Authenticated app smoke (real browser + DB)` |
| Build, unit and integration suites | `Build`, `Test`, `Integration Tests` |
| Static and dependency security | `Analyze (CodeQL …)` ×2, `Analyze (Semgrep)`, `Security Scan`, `Security Contract Tests` |
| Release-evidence manifest generated and validated | `Assemble Release Evidence`, `Release evidence gate / validate-release-evidence` |

`docs/runbooks/protected-release-setup.md` now carries the exact live check
names from this run instead of placeholders, and its validation gate was
executed against this commit's check-runs in both directions: it passes on the
recorded list, and rejects the workflow-label substitution (`Tier 5 Browser
Smoke` instead of `Authenticated app smoke (real browser + DB)`) that the
runbook exists to prevent. Enabling branch protection is now a configuration
step with verified inputs, not a discovery exercise.

This is release-*readiness* evidence for the engineering gate only. It is not
GxP validation, not a penetration test, and not an approval to process real
regulated data — those remain open and require human authority.

### How this list was originally derived (historical)

At the 2026-08-25 inspection no live check contexts or sample pull request
could be read safely, so the names below were **unverified candidates** read
from workflow files. They are superseded by the verified list above, and are
retained only to show where the recorded names came from. The rule they were
written under still stands: check names must be copied from successful, recent
check runs, never inferred from workflow files.
`config/release-evidence-policy.v1.json` remains the canonical
machine-readable list of required release jobs; derive the protection list from
it plus the per-commit checks it does not carry, rather than maintaining a
second independent list.

- `Lint`, `typecheck`, `Test`, `Integration Tests`, and `Build`;
- `Security Contract Tests`, `Security Scan`, `Analyze (CodeQL …)`, and
  `Analyze (Semgrep)`;
- `Blank DB Provisioning + Deploy Migration`;
- `Production Boot Smoke (RLS on, non-superuser role)`; and
- `Authenticated app smoke (real browser + DB)`.

Those labels were discovery aids only, and were never a read-back of GitHub's
required status-check contexts. The verified section above IS a read-back — of
the check runs, from a commit on which each one succeeded. It is still not a
read-back of GitHub's *configured* protection, which remains unset until an
administrator applies the runbook.

## Enforced release policy

When GitHub's authenticated read-back proves the rules are active,
`concept2cure-v2` must be the default branch and must: require pull requests;
require at least one independent approval; dismiss stale approvals after new
commits; require all conversations to be resolved; require the exact live check
contexts for CI/lint/typecheck/build/tests/integration, security contracts and
scanning, blank-database provisioning and deploy migration, production boot
under non-superuser RLS, and Tier 5 authenticated browser smoke; require the
head to be current unless merge queue provides the equivalent guarantee; block
deletions and force pushes; apply to administrators; and provide no ordinary
development bypass.

The exact inspection, configuration, and read-back procedure is in the
[protected release setup runbook](runbooks/protected-release-setup.md). The
runbook is the administrator handoff until authenticated verification replaces
this document's current unknown status with evidence links and exact live check
names.

## Repository-policy prerequisite

The checked-in `AGENTS.md`, `CLAUDE.md`, and `.github/BRANCH_LOCK.md` prohibit
every branch other than `concept2cure-v2` and require direct commits to it.
GitHub cannot create a pull request whose head and base are the same branch.
The repository owner must therefore approve a written exception for short-lived
review heads before enabling required pull requests; otherwise protection will
correctly fail closed and block ordinary development. No such exception was
invented by WO-02.

## Normal author-review-merge-release separation

Once the policy conflict above is resolved and the settings are verified:

1. **Author:** proposes a bounded change on an approved short-lived review head,
   supplies evidence, and cannot approve their own work.
2. **Independent reviewer:** assesses code, regulated-impact evidence,
   migrations, and security implications; resolves or explicitly tracks every
   conversation; and approves only the reviewed commit set.
3. **Merger:** confirms the approval is current, all required live checks passed,
   the head is current with the protected branch (or is admitted by merge
   queue), and no bypass was used.
4. **Release operator:** promotes the immutable reviewed commit, records the
   deployment and migration evidence, and does not substitute deployment access
   for code-review approval.

One person may hold multiple roles organizationally, but the author must not be
the independent approver, and no role may skip a protected gate.

## Emergency break-glass process

An emergency bypass is exceptional, time-bound, and auditable—not an ordinary
merge path:

1. Declare an incident and record severity, customer/regulatory impact, exact
   commit, reason normal gates cannot complete, and rollback owner.
2. Obtain written authorization from two named people: the incident commander
   and a repository owner/security or quality representative. The change author
   cannot supply both authorizations.
3. Use only the narrowly scoped named emergency actor. Never add an individual
   developer or broad team as a temporary bypass actor.
4. Preserve available checks, signed deployment evidence, logs, and the GitHub
   audit event. Do not force-push or delete the protected branch.
5. Revoke any temporary access immediately after stabilization.
6. Within one business day, open a retrospective review containing the diff,
   approvals, bypass audit event, test results, deployment evidence, rollback
   outcome, and corrective actions. Re-run every skipped required check and
   obtain independent retrospective approval.

Until a GitHub read-back identifies an unavoidable bypass actor, the verified
bypass policy remains **unknown**, not “no bypass.”
