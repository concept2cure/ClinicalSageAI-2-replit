# Existing native model-call provenance — D2 / W2

Baseline: `dd749f3e56f1d9055b19067e90680d70bf9a9fb9` on `concept2cure-v2`.

## What already exists

- `server/services/ana/AnaToolExecutor.ts`: `AgenticOptions.onModelResponse`
  already reports each gateway response after it returns, round 0 first and
  1+ on follow-up tool rounds. `notifyObserver` contains observer faults.
  Sub-agent execution already consumes this hook. No gateway or adapter change
  is needed.
- `server/services/ana/turn-record-loop.ts`: the shared native collector retains
  raw tool calls, and `recordLoopTurn` writes the canonical chained record.
  It keeps only the final response's model. Earlier models disappear on success;
  all returned models disappear from a late failed/stopped turn with no response.
- `server/routes/chat/send-message.ts`, `server/routes/ana-intelligence.ts` and
  `server/services/ana/ana-realtime.ts` all use this collector/writer but wire
  only its tool callback. Classic chat additionally sends its composite display
  `provider/model` string as the final model id to the writer.
- `server/services/ana/turn-record.ts` already provides `addServed(round, who)`
  with chronological call number, provider, model, requestId and null `sent`
  when dispatch parameters were not recorded. No schema change is needed.
- `server/services/ana/turn-record-models.ts` reads each recorded call's author,
  preserving unknown authors and deduplicating models only for the author list.
  The writer and existing authoring governance derive qualified `servedBy`
  through this reader, so using the real call metadata reaches the existing gate.
- The native helper intentionally warns that it cannot report tool-step round
  assignments or later model inputs. This increment retains that limitation.
- Existing suites provide real TurnRecorder/PGlite/chained-audit persistence,
  mounted classic/agent and realtime seams, and real adapter observer chronology
  and containment controls. They are reused, not replaced.

## Searches and history

Searches covered `loopToolCollector`, `recordLoopTurn`, `onModelResponse`,
`servedModelsOf`, `addServed`, `model.calls`, `servedBy`, model inputs, native
loop/record/provenance names, all three hosts and the authoring consumers.
`git log --all --diff-filter=D` covered `*turn-record-loop*`, `*model-input*`,
`*served-model*`, `*provenance*` and loop/trace paths. No removed or alternate
native completion was found. The shared helper remains unchanged since
`f7597c2c9` (2026-09-26); the later model-response observer never reached it.
Read-only independent discovery confirmed these findings.

## Later needs found, outside this increment

The data-room inventory identified UTF-16 boundary splits in chunk/window reads,
stale passage text after re-extraction, and an already-filed capture checksum
cache race as candidates for separate reproduction and contracts. These are
backlog observations, not implemented or newly qualified claims in this slice.
