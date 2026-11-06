# Human-test readiness (from 2026-11-06)

The founder, 2026-11-06: *"make educated decisions based on the goals of the project and the platform, and essentially
getting it ready for human testing … it's time we need to start showing working software for this industry, and
soon."*

The aim: a person in the industry can sign in and do real work, end to end, in the running app. Every step a tester takes
is verified in the app, not only in tests. Every defect a tester would hit is fixed in the existing product, or written
down with its reason.

## The five journeys

Each runs in its own cloud session, started by `session_011Dpx…`. Each walks its journey in the running app at
1440 and 390 px, as the runtime role with RLS and the launch gate enforced. Each fixes what breaks, and files
`HUMAN-TEST/J<n>/README.md`.

| Journey | What a tester does | Session |
|---|---|---|
| J1 | Sign in, Home, Projects, New project (IND, 510(k), diagnostic), the project page and its steps, the objective, settings | `01QoxbLZhyA6…` |
| J2 | The Vault and data room: upload, versions, review and approval with e-signature, search, holds, export, Evidence | `01QoxbLbCeM6…` |
| J3 | The one editor for non-CSR documents: create, edit, comment, review board, e-sign, freeze, place into filing | `01QoxbLdxa6f…` |
| J4 | Submission Center: submissions, planner, builder, sequences, compile and validate, applicant identity, dispatch readiness, eSTAR | `01QoxbLZbDqi…` |
| J5 | Tasks, Communication, Quality, CMC, risk-based monitoring, Biostatistics, Reporting, settings | `01QoxbLcjX1N…` |

The CSR lifecycle was fixed and re-walked on 2026-11-05: `../DEMO/2026-11-05-csr-lifecycle/README.md`, "Re-walk after the
fixes". Trunk's unit suite is green across all 24 shards: `../F1/2026-11-05-sweep-shards-21-24/`.

## Decisions taken for the founder (2026-11-06)

Each serves the one goal: working software in testers' hands. None changes the plan's packages.

1. **The model key.** Real drafting needs an Anthropic key. The secure route is an environment credential, entered in
   a form the founder approves. It could not be shown in this Claude app version. Testers on the deployed environment
   use the key configured there. Until a key is present, the product refuses model replies, says so plainly, and never
   shows template text as drafted (F2, B7).
2. **The informed-consent record.** Its convergence with the `informed_consent` document type is deferred past this round,
   because it is not on a tester's path. The structured record and the document type both still work.
3. **The global schedule in Reporting** (S11 step 6b) is deferred. Each project's schedule is on the project page and on
   Projects.
4. **Durations.** Device and other non-IND work breakdowns are scheduled from effort hours (8 h a day), and the plan says
   so. Typical durations will be added only with a cited source; none is invented.
5. **Progress records.** Progress is recorded in `.design/claude-convergence/COORDINATION.md` and in these evidence
   folders. The plan's progress log is not edited by this session.

## The testers' guide

When J1–J5 report, the verified steps, the accounts and the known limits become one guide for human testers.
