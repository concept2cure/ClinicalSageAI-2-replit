# Messaging follow-through repair

Plan: F1. Completes: `client/src/concept2cure/v2/surfaces/CollabLauncher.tsx`.
The canonical source inspected is `f6127e72231bd9e9f302f596a672f58b1b40db15`.
Contract was published before test or production edits with RED pending. Final
lane evidence follows below.

## What already exists

- `CollabLauncher.tsx` owns the one universal CollabLayer/CollabDiscuss composer.
  It posts a recipient message first, then an optional assigned task, and already
  reports a task refusal as partial success. It does not retain the confirmed
  message delivery, so a second Send repeats the first persisted operation.
- `server/routes/taskManagement.routes.ts` owns both existing endpoint paths;
  successful POST `/messages` calls the existing notification writer and returns
  HTTP201. There is no server retry identity or receipt-reuse API to invent here.
- `collabTaskOpenProject.test.tsx` and `collabAutoAssignHonesty.test.tsx` mount the
  actual existing layer with mocked HTTP, real roster choices and open-project
  context. Reuse that boundary for deterministic partial-success reproduction.
- Exact-path deleted history found no replacement launcher/message writer.
  Broader collaboration deletion history is legacy UI and services
  (`2895218b8`, `46044c426`, `e5a74a4df`, `7a144fd1e`, `54142cf0b`).
  No retired module is restored. Current S10 agency holds and shared D0/D3
  files are outside this lane; the root exclusively assigned this launcher and
  its tests. Existing root rules and F1 scope remain binding.

## Bounded contract

Retain confirmed message delivery within the same compose instance. If its
optional task fails, preserve the existing partial-success message, prevent
resending the delivered message, freeze its inputs and keep Close available.
Closing/reopening creates fresh intake. Known message refusal remains retryable;
unknown transport outcomes must not be described as definitely unsent or
automatically resubmitted. A task's unknown outcome is reported honestly.
No server/API/schema/navigation feature or new message module is added.

The initial reproduction will use actual rendered controls with mocked transport,
not a live database or recipient. Focused and adjacent launcher tests plus scoped
lint are this lane's checks. The root owns all other checks, commits and pushes.

## Reproduction and final lane checks

Before production edits, `collabMessageReceipt.test.tsx` produced four genuine
failures and two passes. Both returned/thrown optional-task refusals caused a
second actual message POST on repeat Send (two instead of one). A lost message
acknowledgement was incorrectly called definitely undelivered, and the server's
unknown task outcome was incorrectly called not created. `red.txt.gz`, exact
`.red.gz` source snapshots and `red-source-hashes.json` retain that capture.

The composer now retains confirmed delivery in the compose instance and guards
submission synchronously as well as disabling Send and inputs. Partial success
keeps its task-board recovery and Close. Known message refusal remains retryable;
unknown message/task outcomes are stated as unknown and cannot trigger a repeat
message from that instance. A fresh composer starts cleanly.

Final focused/adjacent qualification is **18passed in3files**, including seven
receipt cases and the existing open-project/automatic-assignment launcher suites.
The extra receipt case covers the transport's thrown message refusal as well as
a returned refusal. Command (Node22):

```sh
node node_modules/vitest/vitest.mjs run client/src/concept2cure/v2/__tests__/collabMessageReceipt.test.tsx client/src/concept2cure/v2/__tests__/collabTaskOpenProject.test.tsx client/src/concept2cure/v2/__tests__/collabAutoAssignHonesty.test.tsx --reporter=verbose
```

Scoped ESLint exits0: new test0warnings; launcher8warnings, identical rule counts
to its saved pre-repair source (no allowance change). `green.txt.gz`, lint JSON
and final source hashes retain the actual checks. No live browser, recipient,
provider, DB, broad gate, build or full typecheck was run by this lane. The root
owns aggregate checks and direct canonical commit/push.
