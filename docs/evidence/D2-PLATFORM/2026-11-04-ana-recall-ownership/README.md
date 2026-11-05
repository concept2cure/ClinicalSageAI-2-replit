# Shared AnA recall: in-flight ownership and scope-safe cache keys

Repository: `concept2cure/ClinicalSageAI-2-replit`  
Branch: `concept2cure-v2`  
Baseline: `b7e854ed33fe5d65ae575f1d19286338d106d8ba`  
Plan: F1; completes `server/services/lumen-context/intelligence-prefix.ts`.

## What already exists

- `server/services/lumen-context/intelligence-prefix.ts`: the shared organization/project/objective/wisdom prefix, a three-second optional-recall budget and a sixty-second, 200-entry process cache. This is the only production file changed.
- `server/services/lumen-context-builder.ts`: re-exports this same prefix; no competing memory/context service.
- `server/services/c2c/project-ref.ts`: existing project-reference authority, retained unchanged.
- `server/services/c2c/charter-objectives.ts`: the objective-of-record reader and edit path. After a changed objective it already invalidates both the supplied project ref and its integer anchor. No new store or write path is needed.
- `server/services/client-intelligence-memory.ts` and `ana-wisdom-engine.ts`: existing source readers, unchanged.
- `server/routes/ana-ri/stream.ts`, `server/services/ana-ri/chat-context-builder.ts`, `server/routes/chat/send-message.ts`, and `server/services/ai/openai-orchestrator.ts`: existing consumers found by connected search. This change is not conditional on CSR or any product/filing label.
- `server/services/lumen-context/__tests__/intelligence-prefix-project.test.ts` and `intelligence-prefix-deadline.test.ts`: existing project-selection and deadline tests, retained unchanged.

The repository rules, one-design-plan and coordination record were reviewed; F1 is the existing repair lane. Searches covered the prefix, its consumers, cache invalidation and objective writes. No hold on this production path appeared in the inspected coordination record. Container DNS prevented a repository clone/deleted-history audit. The complete original source was verified against Git blob `23bb98054680c464e59412d2d7cb5fec6afc51d3` before testing.

## Confirmed defects and repair

Deleting a completed cache entry did not retire a read already underway. An older objective/intelligence read could finish after invalidation, supply old text to AnA and repopulate the sixty-second cache, even after a newer read had succeeded. Concurrent reads of the same key also ran independently and could overwrite one another by completion order.

The existing bounded cache now owns pending reads as well as completed snapshots. Overlapping requests for the same scope share one read. Invalidation or eviction removes that ownership. A retired read cannot start dependent reads after resolution, return its old source text, erase a replacement entry, or refill the cache. It returns an explicit recall-availability notice instead. Source failures remain retryable; failures do not leave a successful or permanently pending entry. No unbounded generation/tombstone map was added.

A separate key collision used the same normalized key for omitted project context and an explicitly supplied whitespace-only project reference. With a warm organization cache, that malformed project selection could receive organization-wide context despite the existing no-portfolio-fallback rule. Project and organization keys now have separate namespaces. Existing empty-string/null/undefined organization sentinels and normalized program/integer keys retain their intended behavior.

The existing three-second source budget, sixty-second TTL, maximum 200 owned entries, source readers, reference resolution, objective formatting and organization/project invalidation scope are preserved. A malformed assembly result produces a fixed availability notice and fixed diagnostic log rather than logging raw exception objects.

This is process-local cache consistency, not a distributed cache/transaction protocol. It does not retroactively withdraw a prefix already returned to its caller, cancel an already running database query, guarantee all source reads represent one database transaction, or prove every metadata writer invalidates this cache. Existing authorization, model PQ, source review and release gates remain unchanged. No new tool, model, service, route, screen, table, dependency, license grant or regulatory rule.

## Executed verification

The same 37-case Node suite ran against the exact complete baseline and repaired production module using TypeScript 5.8.3 on Node 22.16.0:

| Version | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Baseline | 15 | 22 | 0 |
| Repaired | 37 | 0 | 0 |

The actual prefix, cache ownership, formatting and deadline code execute. Database/source readers, canonical project lookup and time are explicit controlled collaborators. Cases cover late objective/client/project/wisdom responses, replacement reads, repeated invalidations, failures, shared pending reads, whitespace-key collisions, organization/project separation, eviction, TTL and the shared deadline. Synthetic text is not client data, a live-model conversation or regulatory qualification.

`case-results.tsv` records each outcome; `execution.json` records source identities and raw-log hashes. `raw-results.tar.xz` contains both raw TAP logs, not CI output. Production and the additional TypeScript test transpile without syntax diagnostics. Whole-repository semantic typechecking was not run.

Eight native Vitest cases are committed in the existing test directory but remain unexecuted; Vitest and full application dependencies are unavailable here. Existing neighboring Vitest suites, database writes, provider calls, authenticated chat/editor behavior, full build/CI and hosted deployment remain unverified.

## Reproduction and publication

```sh
node --test tests/services/ana/intelligence-prefix-ownership.test.cjs
C2C_RECALL_SOURCE_ROOT=/path/to/baseline node --test tests/services/ana/intelligence-prefix-ownership.test.cjs
npx vitest run server/services/lumen-context/__tests__/intelligence-prefix-ownership.test.ts server/services/lumen-context/__tests__/intelligence-prefix-project.test.ts server/services/lumen-context/__tests__/intelligence-prefix-deadline.test.ts
NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p .
npm run ci:one-design-plan
```

The baseline snapshot needs the single original prefix file. `C2C_TS_PATH` may select an existing TypeScript installation. No dependency was installed. Direct GitHub writes do not run local pre-push hooks. Publication must use the current tree and an expected-head fast-forward, followed by remote readback. No PR, alternate branch, force update or reset. This record alone does not prove publication. Rollback is an ordinary revert; no migration or backfill.
