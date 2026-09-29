# First attempt, 2026-09-27: the package at head, before anything was changed

IQ-001 and all six OQ protocols executed at `d224ecff`: trunk at `00870fe4`
plus this lane's claim row. This was the first execution since `bfdb0a08`
(2026-09-23c), across the 1,550 commits of the P0/P1 tranches. Installation,
posture, runner and identities are as in `../README.md`.

| Protocol | Pass | Fail | Deviation |
|---|---|---|---|
| IQ-001 | 12 | 0 | 3 |
| OQ-001 Projects | 18 | 2 | 0 |
| OQ-002 Vault | 12 | 0 | 0 |
| OQ-003 Authoring | 23 | 0 | 1 |
| OQ-004 Submission Center | 13 | 2 | 0 |
| OQ-005 Submission Readiness | 10 | 0 | 1 |
| OQ-006 QMS controlled documents | 21 | 0 | 0 |

## The four failures

| Step | What it recorded | Cause | Disposition |
|---|---|---|---|
| OQ-PROJ-18 | The newest ledger entry for the suspended colleague (`user:5`) was its last successful sign-in, not the refusal | **Product defect, F-41.** The colleague was added through user administration, so it has no default organisation, and the refusal was written to the platform's chain (tenant 0), not to its organisation's. | Fixed failing-first, `f339a445` (`../red/F-41/`) |
| OQ-PROJ-19 | Runner error: the step's own sign-in answered 429 `RATE_LIMIT` | The sign-in limiter allows ten per client IP in fifteen minutes. Since OQ-PROJ-19 (2026-09-26) opens a session of its own, OQ-001 makes eleven, and the run signs in from one IP. The control worked. | The harness waits out the window once and says so (OQ-001 v0.9 §1) |
| OQ-SUBC-04 | 409 `CROSS_PROJECT` placing the leaf | Protocol drift. Since LX-22, OQ-SUBC-03 gives the submission its own program, while the step placed OQ-SUBC-00's document, another program's. PF-11 (2026-09-26) refuses that, correctly. | OQ-004 v0.4: the document is ingested into the submission's program, and the refusal becomes an expected result (URS-004 v0.2) |
| OQ-SUBC-08 | 400 `SIGNATURE_MEANING_REQUIRED` where 401 `REAUTH_TOTP_REQUIRED` was expected | Protocol drift. Since P1-21 (2026-09-25), a sign must state its meaning, so the request stopped before the second-factor check it exists to show. | OQ-004 v0.4: the sign states `approval`, as the Submission Center's modal proposes for a freeze |

The deviations are OQ-AUTH-16 (no AI provider) and OQ-SRDY-06b: with launch
scope enforced, the contradiction scan belongs to a board that is not in this
release (VSR-001 §16.5).

## One change made to these records after execution

In `OQ-PROJECTS/OQ-001-execution-record.md` and `OQ-PROJECTS/result.json`,
OQ-PROJ-19's runner-error stack named the checkout's absolute location once.
That prefix was removed, and nothing else in any record was changed. The
harness now records runner errors with repository-relative paths
(`repoRelative`, `tests/validation/lib/harness.mjs`), so a record it writes
reads as this one now does.
