# Verified publication gates

2026-10-07 · W3 / D4 · `concept2cure-v2` only.

Qualified code commit: [`a5dc3f3d84ba62a06806f8455897fe0554ae654d`](https://github.com/concept2cure/ClinicalSageAI-2-replit/commit/a5dc3f3d84ba62a06806f8455897fe0554ae654d).
Exact tested tree: `4c20c1c7bb1a5df4b0dd5e8fdcddb80030596174`.
GitHub metadata for every job below explicitly names this source.
The eight code blobs and eight protected guard/baseline blobs remain pinned by
[REMOTE-QUALIFIED-SOURCE-BLOBS.json](REMOTE-QUALIFIED-SOURCE-BLOBS.json).
An evidence-only descendant records these results; its documentation is not
represented as a new compiler-tested code source.

## Executed publication gates

| Gate | Actual result on the qualified code source | GitHub job |
|---|---|---|
| Agent full semantic TypeScript | Success; baseline 0, errors 0, compiler exit 0 | [112958988344](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37669994004/job/112958988344) |
| Main lint and independent full TypeScript | Success; baseline 0, errors 0, compiler exit 0 | [112958988772](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37669994264/job/112958988772) |
| Complete Node CI guard controls | 214 passed; zero failed/cancelled/skipped/todo | [112958988772](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37669994264/job/112958988772) |
| Blank database provision and deploy | Success; replay, RLS coverage, readiness and invariants passed | [112964288705](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37669994264/job/112964288705) |
| Provisioned live-schema SQL inventory | 1297 live relations, 758 referenced names, 13 functions; unchanged 39-name absent baseline and zero new missing relations | [112964288705](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37669994264/job/112964288705) |
| Production RLS boot as non-superuser | Success | [112964288435](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37669994264/job/112964288435) |
| Production image on empty database | Success; provision, health/readiness and sign-in including second factor passed | [112964288821](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37669994264/job/112964288821) |
| Authenticated browser and database smoke | Success | [112958987668](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37669994021/job/112958987668) |
| Full-history secret scan | Success | [112958988975](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37669994264/job/112958988975) |
| Security scan and security contracts | Both success | [112958989309](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37669994264/job/112958989309), [112958989811](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37669994264/job/112958989811) |
| Semgrep | Success | [112958987671](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37669994088/job/112958987671) |
| CodeQL JavaScript/TypeScript and Python | Both success | [112958996032](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37669996428/job/112958996032), [112958996458](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37669996428/job/112958996458) |
| AnA readiness and AIOS audit assets | Both success | [112964289068](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37669994264/job/112964289068), [112964289096](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37669994264/job/112964289096) |

Actual diagnostic/count excerpts are preserved in
[REMOTE-TYPECHECK-GREEN.txt](REMOTE-TYPECHECK-GREEN.txt),
[REMOTE-LIVE-SCHEMA-GREEN.txt](REMOTE-LIVE-SCHEMA-GREEN.txt) and
[REMOTE-CI-GUARDS-GREEN.txt](REMOTE-CI-GUARDS-GREEN.txt).
Both full compilers actually executed remotely. No full local TypeScript
compiler was run on the 8-GiB host. Builds and fixture type erasure remain
separate evidence, not semantic compiler proof.

The warning ratchet observed 6258 inherited warnings across 1785 files and
21 rules against the unchanged 6411-warning baseline. No baseline or scanner
policy was relaxed. Proof-tier schema contracts, golden journeys and export
contracts also completed successfully in the main lint job.

## Remaining CI and qualification

At this evidence snapshot, broad integration job
[112964288622](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37669994264/job/112964288622), broad test job
[112964288728](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37669994264/job/112964288728) and coverage job
[112964288873](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/37669994264/job/112964288873) remain in progress, with their test/coverage
steps still executing. None is a pass. Build and release-evidence gates that
depend on these jobs have no final verdict here. The separate local scoped
regression remains 80 physical files / 1470 cases passed, zero
failed/pending/skipped/todo; it does not stand in for these broader CI jobs.

Nightly strict governance and the agent regulatory/compliance/AI-evaluation/
security-audit jobs were skipped by their existing workflow conditions.
Skipped jobs supply no qualification verdict.

D4 and D1–D10 remain open. These successful software gates do not establish
production latency/plans/races, complete historical ancestry or scientific
identity/unit/criteria completeness, full intended-use qualification, live
provider/transport PQ, or accountable signed human/scientific acceptance.
Existing deterministic engines, refusal gates and scientific policies remain
unchanged by this evidence filing.
