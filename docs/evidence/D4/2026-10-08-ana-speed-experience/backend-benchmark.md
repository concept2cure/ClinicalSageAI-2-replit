# AnA memory startup: bounded backend delivery evidence

This W3 / D4 batch moves the existing memory call earlier in the stream route and shared chat builder, overlapping independent optional route context. Calls retain their original organization, project, query, limits and failure fallback. Stream admission, history read and question persistence still finish before memory starts; the builder still resolves private thread access first. Both paths await the same memory result before constructing the model request. No new service, tool, dependency, policy or UI surface is introduced.

## Red before repair

- `backend-stream-red.log`: the real stream-route test observes no memory call while optional prefetch is pending, failing the overlap assertion; 1 failed, 5 passed.
- `backend-chat-red.log`: the real shared builder similarly fails its overlap assertion and the controlled benchmark; 2 failed, 6 passed.
- Red runs used Node 24.19.0, the initial workstation runtime. Qualification uses the repository's supported Node 22.23.3 runtime.

## Controlled latency benchmark

The real `buildChatContext` executes against mocks that supply a 180 ms optional route read and a 120 ms memory read. Vitest's controlled clock records when the complete context returns; all other mocked reads are immediate. The assertion retains the memory block in the final prompt.

| Source behavior | Optional route read | Memory read | Complete context | Delta |
|---|---:|---:|---:|---:|
| Before repair: serial route then memory | 180 ms | 120 ms | 300 ms | — |
| After repair: overlapping independent reads | 180 ms | 120 ms | 180 ms | 120 ms / 40% less |

This demonstrates elimination of one serial wait under controlled conditions. It does not measure production databases, provider latency, first-token performance or a browser session. It does not promise a 40% improvement to total answer time.

## Additional qualification limitation

The existing `tests/schema-contract/chat-thread-access.contract.test.ts` passes 12 access, ownership and program-binding cases but fails its program-list case. `backend-qualification-node22.log` reports 57 passed and this one failure across six files; `backend-ownership-existing-red.log` reproduces 12 passed / 1 failed in isolation.

The failing fixture invokes `listThreads` with an organization and program but no caller identity. The unchanged `server/routes/chat/threads.ts` requires an identified owner (`me !== null`) and returns an empty list for that fixture. The owner rule was introduced in existing commit `96fa4d5da`; the fixture at `tests/schema-contract/chat-thread-access.contract.test.ts:256` does not supply `ALICE`. Neither that test nor its production route/helpers imports the two repaired backend files. Their files are unchanged in this batch. This unrelated fixture is recorded and left outside the fixed delivery scope; no production access check is weakened.

The five applicable backend files are qualified separately in `backend-focused-node22.log`: the two new latency/admission suites, existing stream context-awareness, optional prefetch deadlines and timeout protection. Full compiler, build and publication evidence is recorded by the control-tower session in this directory.
