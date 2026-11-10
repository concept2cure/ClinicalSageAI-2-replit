# Execution restored and workflow project admission repaired

File editing, local builds and tests work again. The current repository was
cloned onto concept2cure-v2 at 21a21849d7cfb8a35794489a87fad2b849c7011c,
Node 22 and locked dependencies were installed, and disposable PostgreSQL 16 is
running. See ENVIRONMENT.md for the checks and recovery commands.

## What already exists

The inventory and pre-implementation contract are in README.md. This is Plan:F1,
completing the existing workflow task writer and task/project boundary. It adds
no screen, editor, route, service, mount or production table and preserves the
project-first roadmap. No D3/D6-owned UI changed.

The existing writer now validates the selected project, admits the current
active actor and canonical project edit policy on its own request transaction,
retains the parent and edit membership through commit, and stamps every task
with the actual project and workspace. Missing/foreign/private/read-only/closed
projects and mismatched workspace claims refuse before workflow writes.

The original single transaction, tasks, dependency edges, paired governance,
stored-template usage, built-in fallback and legacy 200 response are retained.
Review-route columns stay refused in request and stored definitions. A lost
actual COMMIT acknowledgement returns OUTCOME_UNKNOWN and discards its request
lease instead of claiming no tasks were created.

## Verified results

- 316 unit, route, PGlite and adjacent client tests across 26 files.
- 76 native PostgreSQL tests across two files, using restricted roles and FORCE
  tenant RLS, including 57 new workflow cases.
- Complete source typecheck plus the new native test: 15,425 compiler inputs.
- Production client/server build, scoped lint and repository pre-push gates pass.
- SQL/error-leak allowances, the plan, dependencies and protected review writer
  are unchanged. No source drift during final checks.

The two genuine pre-fix counterexamples are retained under native/: private
project outsider creation committed two tasks, an edge, three action/audit pairs
and usage; valid creation omitted its actual workspace. Both now pass. Real lock
barriers prove admission rechecks membership after waiting and retains it through
commit before a concurrent revocation. Rollback failures leave all workflow
counts/usage unchanged. Actual committed lost-ack tests preserve the committed
records and report uncertainty. All fixture pools closed.

## Limits and checkpoint

Native request identities are synthetic; project admission, transactions, audit
pairs, locks, driver, runtime role and tenant RLS are real. This does not qualify
production login, all migrations or a new screen. No UUID/replay API or broader
ordinary-task permission change is included. Commit-range gates see no commits;
explicit working-tree plan evaluation, lint, tests and full typecheck supplement
them. No October archive is claimed to have been restored into this workspace.

The local verified checkpoint is
`/workspace/artifacts/concept2cure-workflow-project-admission-2026-11-06.tar.gz`.
It contains a binary-safe delta against the HEAD above, exact prior/current
files, evidence and manifests. The patch is applied in isolation and every
resulting byte compared, then packed members and current live copies checked.
The actual packed contents receive a recursive credential scan. SHA-256 and
verification sidecars accompany it. No production settings changed.

This document records the pre-landing qualification. The verified repair is
landed directly on the canonical concept2cure-v2 branch with the repository
hooks enabled. The committed history records its publication; no PR or alternate
branch is used.
