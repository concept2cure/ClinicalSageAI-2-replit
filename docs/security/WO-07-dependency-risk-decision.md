# WO-07 dependency-risk decision

## Reproduction

The authoritative input is the committed `package-lock.json`. Run `npm ci`,
`npm --version`, `npm audit --audit-level=high --json`, and
`npm ls pptxgenjs image-size --all`. The machine-readable result and evidence
contract are in `dependency-risk-ledger.json`; `check-dependency-risk.mjs` is the
fail-closed CI consumer used by CI and deployment callers.

The task-time workstation used Node 20.20.2 and npm 11.4.2. Its npm advisory
bulk endpoint returned HTTP 403, which is recorded as a failed scan rather than
a clean result. CI must rerun the same lockfile scan where registry audit access
is available.

## Decision summary

| Advisory | Path | Reachability | Decision |
|---|---|---|---|
| GHSA-w3rx-r6r6-pgpr | `pptxgenjs@4.0.1 > image-size@1.2.1` | Installed, but absent from resolved runtime bundle | Unreachable |
| GHSA-5p2g-fcmc-qvqq | `pptxgenjs@4.0.1 > image-size@1.2.1` | Installed, but absent from resolved runtime bundle | Unreachable |

This is not based on absence from a repository search. The live server route
dynamically imports `generatePptxBuffer`; that production function constructs a
real PPTX with text and shapes only. More importantly, the installed package's
resolved Node entry (`pptxgen.cjs.js`) does not import `image-size` at all. The
optional image-generation chain does not embed its returned cover image.
Consequently `pptxgenjs` is runtime reachable, while `image-size` is absent from
that runtime module graph. A dedicated CI guard checks the resolved dependency
bundle and application call sites; the regression test executes the production
generator, validates the resulting ZIP/PPTX signature, and verifies that
`image-size` was not loaded into Node's module cache.

There are no exceptions in the ledger. If one becomes necessary, the gate
requires a named owner, named approver, approval timestamp, and future expiry;
a placeholder or baseline alone cannot make a scanner result pass.

## Ownership

The ledger's `owner` field must name the accountable human, not a team. A team
string satisfies the gate's field-presence check but leaves nobody accountable
when the decision needs re-review. That matters concretely here: both ledger
rows expire `2026-11-25T00:00:00.000Z`, and on that day the gate fails closed
in the three workflows that run it (`ci.yml`, `deploy-aws.yml`,
`cerv2-staging-deploy.yml`). An unowned expiry is a calendar trip-wire — the
re-review either happens because a named person owns it, or the deadline is
discovered by a red deploy.

The current value is a team string. This document does not invent a person;
the repository owner must fill in the accountable human:

| Ledger field | Current value | Required | Action |
|---|---|---|---|
| `findings[*].owner` | `Security Engineering (…)` — a team string | The named, accountable human who owns the 2026-11-25 re-review | TODO(repository owner): replace with a person's name and re-commit the ledger, well before 2026-11-25 |

## Resealing the ledger after a lockfile change

The ledger is sealed to the exact `package-lock.json` via `lockfileSha256`
(plus `lockfileVersion` and `rootPackageVersion`), so any lockfile change — a
Dependabot bump, an engines edit, npm formatting churn — makes the seal stale
and the gate fails closed in the three workflows above. Never hand-edit the
hash. Instead:

1. **When the lockfile changes**, run `npm run ci:dependency-risk:reseal`
   (`scripts/ci/reseal-dependency-risk-ledger.mjs`). It re-runs
   `npm audit --audit-level=high --json` against the current lockfile and
   verifies the observed set of High/Critical advisory occurrences
   (advisory id + package) is exactly the set the ledger's active findings
   cover, and that each finding's `installedVersion` and direct/transitive
   classification still hold. Only then does it rewrite `lockfileSha256`,
   `lockfileVersion`, `rootPackageVersion`, `generatedAt`, and
   `scanner.npmVersion` in place. Commit the rewritten ledger together with
   the lockfile change and verify with `npm run ci:dependency-risk`.
2. **When the reseal refuses**, it names the diff — a new uncovered advisory,
   a covered finding that vanished, or a covered finding whose installed
   version changed — and writes nothing. A reseal never silently absorbs a
   change to the finding set. A human reviews each named finding and first
   updates the ledger: an evidence-backed row (with disposition, reachability
   proof, owner, review date, and expiry) for a new finding, or an updated /
   removed row for a resolved one. Then re-run the reseal.

## CI behavior

Every observed Critical/High advisory must map to a ledger row. New findings,
malformed evidence, unreviewed exceptions, expired exceptions, unavailable
scanner responses, and unexpected scanner schemas fail closed. The self-test
(`npm run test:dependency-risk`) demonstrates the new-finding, stale-seal,
expired-exception, and reseal-refusal failure cases against fully synthetic
ledger/lockfile/manifest fixtures, so it proves script logic without going red
on repo churn; exactly one clearly labeled integration test additionally
verifies that the committed ledger still seals the committed lockfile.

The ledger is bound to the SHA-256 of `package-lock.json`, validates installed
versions and direct/transitive classification from the lockfile, and expires
even unreachable decisions after 90 days so reachability evidence cannot become
a permanent suppression. CI persists the exact JSON scanner response as the
`npm-audit-lockfile-evidence` artifact, including the runtime scanner and Node
versions, command, lockfile digest, and unmodified scanner response.
