# D2 Projects: canonical PM integration

This record qualifies the PM-01 atomic schedule repair and PM-02 execution-history preservation after integration with the current `concept2cure-v2` branch. The user explicitly requested direct landing, conflict resolution and no pull request.

The latest publishing candidate is in [publish-sync](publish-sync/README.md), following [final-sync](final-sync/README.md). The first publish attempt passed every hook but was rejected because another session advanced the canonical branch; subsequent incoming work was merged with PM files preserved. Records below remain the earlier integration phase.

## Integrated behavior

Schedule generation uses one tenant-scoped transaction for the plan, milestones, optional goals, revision and returned view. Regeneration retains existing milestone IDs, linked tasks, actuals, progress, notes and other execution metadata. Completed rows receive no UPDATE and keep their historical planned dates. New work starts uncompleted.

Unique keys, canonical pathway/framework and unchanged requirement definitions govern matching. Semantic changes, removals and ambiguous identity produce a review-required conflict and leave the schedule intact. Revisions retain prior rows, the generated proposal, version transition and optional normalized caller reason. A reason is not approval.

HTTP and AnA use their existing ownership, role and confirmation checks. No new dependency, schema migration or project screen is introduced. The preservation contract remains in [PM-02](../../D2-PM-SCHEDULE-PRESERVATION/2026-10-17/CONTRACT.md).

## Integration and publishing checks

- The prepared code was committed as `03759e816`, then integrated with upstream `87824205c` in `64832d9c5` on the canonical branch. Git resolved the AnA edit automatically; no unresolved conflict remained.
- [integration-review.json](integration-review.json) verifies that 245 of 246 incoming changed paths are byte-identical to upstream. The remaining file, `AnaToolExecutor.ts`, contains only the intended additional reason-forwarding line; removing it reproduces upstream bytes exactly.
- The preliminary SQL gate refused the fixed conditional lock suffix. Two complete literal queries now express the locked/unlocked alternatives. The guard and its baseline were unchanged. The [preliminary failure](preliminary-sql-gate-red.txt) is retained.
- New complexity/length warnings were removed through small milestone-write and revision/status helpers and coherent native-test groups. The existing service's warning count remains five.
- The complete pre-push dry run then caught the legacy lint configuration's undefined `structuredClone` test global. Commit `57117233b` uses `globalThis.structuredClone`. The [failure](pre-push-warning-red.txt) and [green warning ratchet](warning-ratchet.txt) show the correction. No changed file gained warnings; no lint rule or baseline was relaxed.

## Qualification records

| Evidence | Scope |
| --- | --- |
| [focused.txt](focused.txt), [focused-exit.json](focused-exit.json) | Final candidate's 130 focused tests in eight files: service lifecycle, matching, schedule/read behavior, routes and AnA authorization/transport. |
| [native.txt](native.txt), [native-exit.json](native-exit.json) | 29 native PostgreSQL tests after canonical integration: physical completed-row identity, task FK preservation, partial progress, semantic refusals, revision snapshots, rollback and actual concurrent clients. |
| [build.txt](build.txt), [build-exit.json](build-exit.json) | Production client/server build after integration. The subsequent test-only global qualification did not change production code or the native test. |
| [typecheck.txt](typecheck.txt), [typecheck-exit.json](typecheck-exit.json) | The repository's authoritative `ci:pushed-typecheck`, invoking whole-repository TypeScript with a zero-error baseline and compiler-failure guards. |
| [warning-ratchet.txt](warning-ratchet.txt), [warning-ratchet-exit.json](warning-ratchet-exit.json) | The actual pushed-file warning check compares both versions against upstream and records no warning growth. |
| [companions.txt](companions.txt), [db-isolation.txt](db-isolation.txt) | Companion presence scoped explicitly to the canonical base; actual database-test/mock isolation. Filename warnings are qualified by the executed focused and native tests. |
| [source-bindings.json](source-bindings.json), [verification.json](verification.json) | Final file hashes, check outcomes, production-bundle hash and TypeScript cache bindings. |

The final focused run and typecheck bind to `source-bindings.json`. Earlier integrated native/build records bind to `source-bindings-before-test-global.json`, which differs only in the focused test's `globalThis` spelling. Their production source and native-test hashes match the final candidate. PM-01 and PM-02 folders retain historical qualification records for their earlier candidate hashes.

Run commands are retained in the `*-exit.json` records. Use Node 22.x and lockfile dependencies. Native tests require a disposable owner/admin PostgreSQL URL in `TEST_DATABASE_URL`; the harness creates a restricted runtime role and removes its scratch objects afterward. No live customer data or provider API is used.

## Publication and limits

The destination is `refs/heads/concept2cure-v2`, using a normal fast-forward Git push and the complete pre-push hook. No PR, alternate branch, force push or hook bypass is used. Publication receipts distinguish the qualified source commit, published commit and any later repository-health documentation commit.

Branch pushes start GitHub checks. AWS production deployment is a separate workflow triggered by manual dispatch or a `v*` tag; this branch integration does not establish a production deployment. Hosted-check observations must identify the exact published SHA.

The native fixture executes the actual June schedule-table migration and uses narrow parent/stage/task/index fixtures. It qualifies the exercised transaction/preservation behavior, with FORCE RLS and a non-superuser/NOBYPASSRLS runtime. It does not qualify the full deployed schema or the public-qualified July uniqueness migration. General serialization with amendment, goal reset and background review remains separate, as does a guided approval/retirement workflow.
