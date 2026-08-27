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

## CI behavior

Every observed Critical/High advisory must map to a ledger row. New findings,
malformed evidence, unreviewed exceptions, expired exceptions, unavailable
scanner responses, and unexpected scanner schemas fail closed. The self-test
also demonstrates the new-finding and expired-exception failure cases.

The ledger is bound to the SHA-256 of `package-lock.json`, validates installed
versions and direct/transitive classification from the lockfile, and expires
even unreachable decisions after 90 days so reachability evidence cannot become
a permanent suppression. CI persists the exact JSON scanner response as the
`npm-audit-lockfile-evidence` artifact, including the runtime scanner and Node
versions, command, lockfile digest, and unmodified scanner response.
