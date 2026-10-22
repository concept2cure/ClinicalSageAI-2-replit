# ESLint, HEAD → now, every file this change touched

Warnings / errors per file. HEAD is `git show HEAD:<file> | eslint --stdin`; "ignored" means the repo ESLint config excludes the file (`client/src/concept2cure/components/**`), so those files are also shown linted with `--no-ignore` below. CSS is not linted by ESLint.

| File | HEAD | Now |
|---|---|---|
| `shared/ana/turn-timeline.ts` | (new file) | 0 / 0 |
| `shared/ana/plan-diff.ts` | (new file) | 0 / 0 |
| `shared/ana/step-verbs.ts` | 0 / 0 | 0 / 0 |
| `server/services/ana/turn-timeline-emitter.ts` | (new file) | 0 / 0 |
| `server/services/ana/turn-summary.ts` | (new file) | 0 / 0 |
| `server/services/ana/turn-record.ts` | 0 / 0 | 0 / 0 |
| `server/services/ana/turn-record-verify.ts` | 0 / 0 | 0 / 0 |
| `server/services/ana/tool-trace.ts` | 1 / 0 | 1 / 0 |
| `server/services/ana/tool-outcome.ts` | 0 / 0 | 0 / 0 |
| `server/services/ana/step-presentation.ts` | 0 / 0 | 0 / 0 |
| `server/services/ana/run-status.ts` | 0 / 0 | 0 / 0 |
| `server/services/ana/turn-run-policy.ts` | 0 / 0 | 0 / 0 |
| `server/services/ai-gateway/progress-updates.ts` | 0 / 0 | 0 / 0 |
| `server/services/ai-gateway/types.ts` | 0 / 0 | 0 / 0 |
| `server/services/ai-gateway/gateway.ts` | 25 / 0 | 25 / 0 |
| `server/services/chat-thread-helpers.ts` | 1 / 0 | 1 / 0 |
| `server/routes/chat/threads.ts` | 1 / 0 | 1 / 0 |
| `server/routes/ana-ri/stream.ts` | 23 / 0 | 23 / 0 |
| `server/routes/ana-ri/turn-records.ts` | 0 / 0 | 0 / 0 |
| `server/routes/ana-ri/post-processing.ts` | 4 / 0 | 4 / 0 |
| `server/routes/ana-ri/__tests__/support/stream-route-harness.ts` | 0 / 0 | 0 / 0 |
| `server/routes/ana-ri/__tests__/stream-turn-timeline.test.ts` | (new file) | 0 / 0 |
| `server/routes/ana-ri/__tests__/stream-ok-false-refusal.test.ts` | (new file) | 0 / 0 |
| `server/routes/ana-ri/__tests__/turn-summary.pglite.test.ts` | (new file) | 0 / 0 |
| `server/routes/ana-ri/__tests__/turn-records.pglite.test.ts` | 0 / 0 | 0 / 0 |
| `server/routes/ana-ri/__tests__/stream-step-presentation.test.ts` | 0 / 0 | 0 / 0 |
| `server/services/ana/__tests__/tool-refusal-ok-false.test.ts` | (new file) | 0 / 0 |
| `server/services/ana/__tests__/step-presentation.test.ts` | 0 / 0 | 0 / 0 |
| `client/src/concept2cure/components/ana/anaTurnTimeline.ts` | (new file) | ignored |
| `client/src/concept2cure/components/ana/useAnaChat.ts` | ignored | ignored |
| `client/src/concept2cure/components/ana/useAnaChat.types.ts` | ignored | ignored |
| `client/src/concept2cure/components/ana/anaProgress.ts` | ignored | ignored |
| `client/src/concept2cure/components/ana/__tests__/useAnaChat-record-join.test.ts` | (new file) | ignored |
| `client/src/concept2cure/components/ana/__tests__/useAnaChat-plan.test.ts` | ignored | ignored |
| `client/src/concept2cure/components/ana/__tests__/useAnaChat-stale-stream.test.ts` | ignored | ignored |
| `client/src/concept2cure/v2/TurnSummary.tsx` | (new file) | 0 / 0 |
| `client/src/concept2cure/v2/turnSummaryRows.ts` | (new file) | 0 / 0 |
| `client/src/concept2cure/v2/anaSourceGlyphs.tsx` | (new file) | 0 / 0 |
| `client/src/concept2cure/v2/AnaActivity.tsx` | 2 / 0 | 2 / 0 |
| `client/src/concept2cure/v2/AnaWorkPanel.tsx` | 0 / 0 | 0 / 0 |
| `client/src/concept2cure/v2/anaWorkModel.ts` | 0 / 0 | 0 / 0 |
| `client/src/concept2cure/v2/surfaces/ConversationThread.tsx` | 6 / 0 | 6 / 0 |
| `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` | 14 / 0 | 14 / 0 |
| `client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx` | 4 / 0 | 4 / 0 |
| `client/src/concept2cure/v2/__tests__/turnSummary.test.tsx` | (new file) | 0 / 0 |
| `client/src/concept2cure/v2/__tests__/anaActivityStepDetails.test.tsx` | 0 / 0 | 0 / 0 |
| `server/routes/ana-ri/__tests__/stream-stopped-reason.test.ts` | 0 / 0 | 0 / 0 |
| `server/routes/ana-ri/__tests__/post-processing-answer-check.test.ts` | 0 / 0 | 0 / 0 |
| `server/services/ana/__tests__/turn-record-sent.test.ts` | 0 / 0 | 0 / 0 |
| `server/routes/__tests__/chat-threads-read-honesty.test.ts` | 0 / 0 | 0 / 0 |

## components/ana with --no-ignore

| File | HEAD | Now |
|---|---|---|
| `client/src/concept2cure/components/ana/anaTurnTimeline.ts` (--no-ignore) | (new file) | 0 / 0 |
| `client/src/concept2cure/components/ana/useAnaChat.ts` (--no-ignore) | 35 / 0 | 35 / 0 |
| `client/src/concept2cure/components/ana/useAnaChat.types.ts` (--no-ignore) | 0 / 0 | 0 / 0 |
| `client/src/concept2cure/components/ana/anaProgress.ts` (--no-ignore) | 0 / 0 | 0 / 0 |
| `client/src/concept2cure/components/ana/__tests__/useAnaChat-record-join.test.ts` (--no-ignore) | (new file) | 0 / 0 |
| `client/src/concept2cure/components/ana/__tests__/useAnaChat-plan.test.ts` (--no-ignore) | 1 / 0 | 1 / 0 |
| `client/src/concept2cure/components/ana/__tests__/useAnaChat-stale-stream.test.ts` (--no-ignore) | 0 / 0 | 0 / 0 |

`useAnaChat-record-join.test.ts` first read 1 / 0 under `--no-ignore` (`ReadableStreamDefaultController` is not a declared global); the test now keeps the controller's two functions instead, and the row above is the rerun.
