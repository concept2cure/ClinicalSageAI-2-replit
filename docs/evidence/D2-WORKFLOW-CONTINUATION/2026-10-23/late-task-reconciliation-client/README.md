# Existing task UI reconciliation, 23 October 2026

W1 / D2 read-only integration review of late canonical `ee3089b5a`. The preceding normal push passed all local gates including the full TypeScript program, then met a concurrent canonical update. This packet qualifies the late client task overlap; publication remains root-owned.

## What already exists

`surfaces/TaskBoard.tsx` already hosts the task detail and saved-task automatic assignment. Incoming `TaskAssignmentControls.tsx` and `taskAssignmentRequest.ts` compose named reassignment and the existing automatic endpoint using current actor/workspace headers, freshly read optimistic assignment tokens and verified receipts. Definite refusal, unavailable reads and uncertain writes remain distinct; uncertain outcomes require a new assignment read before retrying. Assignment does not confer document or signing authority.

`TaskBoard.tsx` retains `facts.mine` during loading, failed and ready reads, and includes `mine` in the context memo dependencies. `Shell.tsx` consumes that fact to distinguish the Team work and My work active rail item. The assignment form uses the existing task-detail classes and theme variables; its controls constrain width for narrow layouts. No client source, style, assertion, dependency, permission or baseline was changed by this review.

The finite requested run passes **75 tests in five suites**, with zero failures or skips, in 10.32 seconds. It covers assignment controls/transport, the named board handoff, board recovery and the rail filters. `command.json` records the exact scope; all eleven targeted source/test pins were unchanged during execution. `green.txt.gz` retains exact output and React warnings with deterministic gzip; `result.json` pins both encoded and decoded bytes. These are jsdom/mock-HTTP results, separate from backend, full compiler, build, hosted CI and live demo acceptance.
