# F1 collaboration intake continuation — 2026-11-13

Baseline canonical `841c41466`; previous collaboration context fixes remain intact. Repairs only the existing task/message launcher. Tasks and Communication remain on the standard left rail; no module, screen, API, service, model, dependency or provider configuration is added.

## Existing implementation and reproduction

The pre-edit inventory is [.design/claude-convergence/F1-COLLAB-INTAKE-2026-11-13.md](../../../../.design/claude-convergence/F1-COLLAB-INTAKE-2026-11-13.md). Existing APIs are `/api/tasks/tasks` and `/api/tasks/messages`; the route already distinguishes OUTCOME_UNKNOWN from an atomic AUDIT_WRITE_FAILED rollback. Existing session guards and error-code reader are reused.

Genuine RED snapshots retain the unchanged source (SHA-256 d16995eaa97f2d62602017ce651ae31a9ca7ccc6be70d51d4eabf2d5bfd13717), tests, logs and statuses. Initial lifetime reproduction: five failures/four controls. Initial task-outcome reproduction: eight failures/four controls. Extended cases total twenty failures/ten controls before source changes; these overlap the initial runs and are not additive.

## Result

- A retired form cannot close, navigate or reset a newly opened or newly selected intake, including batched close/reopen and tab A→B→A transitions. Dismissing a UI does not cancel submitted work: the same-account optional task chain and confirmed board projection still complete. Account-transition controls remain intact.
- A synchronous submission latch prevents two create actions before acknowledgement. Unknown task outcomes cannot claim Nothing was saved, fabricate a task row, or immediately submit the same intake again. Missing, unreadable, non-string or contradictory receipts count as unknown. Known refusals and explicit audit rollbacks allow correction; a confirmed Create & add another allows a distinct follow-up. Existing board navigation remains usable.
- The static task note describes what happens when creation succeeds; it no longer claims the currently unknown operation was saved. `intake-banner-before-copy.png` retains the contradictory screenshot found during review.

The final focused and adjacent run passes 59/59 across six suites: collabIntakeLifetime, collabTaskOutcome, collabDirectoryContext, collabMessageReceipt, collabTaskOpenProject and collabAutoAssignHonesty. `verification.json` records exact frozen source/test hashes and counts. Lint has zero errors; eight existing launcher warnings are unchanged; new tests and browser runner have zero warnings. Independent read-only review found no functional blocker and checked the actual error/route contracts.

## Running-UI evidence and limits

`intake-browser.cjs` uses Chromium against the actual npm-run-dev app, initialized with a real fictional local account in a disposable PostgreSQL-backed runtime. Directory responses and task POST responses are controlled in the browser. Every message/task mutation is intercepted; unrelated mutations and external network requests are blocked. No real messages, task writes or provider requests are performed.

The RED browser receipt reproduces two create requests after a lost acknowledgement and a late original task acknowledgement closing the new message draft. The GREEN receipt instead records one request with both create actions blocked, plus the new message draft retained while the original task is truthfully projected in the same-account client board. Page errors are empty. Screenshots show the unknown warning and retained new draft, with Tasks and Communication visible in the standard rail.

This proves client admission and UI response ownership. It does not prove server persistence for intercepted responses, backend exactly-once processing, live model operation, a hosted Codespace, regulatory qualification, or recovery across a reload/new intake. The user deferred OpenAI credential setup; no key is created or configured here.

Publication uses the single canonical concept2cure-v2 branch, merges concurrent history, and runs all normal pre-push gates including the full TypeScript compiler. The working app is stopped during those checks and restarted at the accepted checkout for version/health verification. No hooks, baselines or gates are bypassed.
