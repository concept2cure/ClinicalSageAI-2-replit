# ESLint per changed file, HEAD vs now (2026-10-08)

HEAD counted with `git show HEAD:<file> | npx eslint --stdin --stdin-filename <file> -f json`; now with `npx eslint -f json <file>`. "ignored" = the file matches an ignore pattern of eslint.config.js in both.

| File | HEAD warnings / errors | Now warnings / errors |
|---|---|---|
| `shared/ana/step-verbs.ts` | (new file) | 0 / 0 |
| `server/services/ana/step-presentation.ts` | (new file) | 0 / 0 |
| `server/services/ana/tool-authorization.ts` | 0 / 0 | 0 / 0 |
| `server/services/ana/agentic-loop.ts` | 0 / 0 | 0 / 0 |
| `server/services/ana/server-tool-steps.ts` | 0 / 0 | 0 / 0 |
| `server/services/ana/tool-trace.ts` | 1 / 0 | 1 / 0 |
| `server/routes/ana-ri/stream.ts` | 23 / 0 | 23 / 0 |
| `client/src/concept2cure/components/ana/useAnaChat.ts` | ignored | ignored |
| `client/src/concept2cure/components/ana/useAnaChat.types.ts` | ignored | ignored |
| `client/src/concept2cure/components/ana/anaProgress.ts` | ignored | ignored |
| `client/src/concept2cure/v2/AnaActivity.tsx` | 2 / 0 | 2 / 0 |
| `client/src/concept2cure/v2/anaWorkModel.ts` | 0 / 0 | 0 / 0 |
| `client/src/concept2cure/v2/AnaWorkSections.tsx` | 0 / 0 | 0 / 0 |
| `scripts/ci/check-step-presentation.mjs` | (new file) | ignored |
| `scripts/ci/check-step-presentation.selftest.mjs` | (new file) | ignored |
| `server/services/ana/__tests__/step-presentation.test.ts` | (new file) | 0 / 0 |
| `server/services/ana/__tests__/step-document-titles.pglite.test.ts` | (new file) | 0 / 0 |
| `server/routes/ana-ri/__tests__/stream-step-presentation.test.ts` | (new file) | 0 / 0 |
| `client/src/concept2cure/components/ana/__tests__/useAnaChat-step-presentation.test.ts` | (new file) | ignored |
| `client/src/concept2cure/v2/__tests__/anaActivityStepDetails.test.tsx` | (new file) | 0 / 0 |
| `client/src/concept2cure/v2/__tests__/anaActivity.test.tsx` | 1 / 0 | 1 / 0 |
| `server/services/ana/__tests__/agentic-loop-rounds.test.ts` | 0 / 0 | 0 / 0 |
| `server/services/ana/__tests__/client-journey.test.ts` | 0 / 0 | 0 / 0 |
| `server/services/ana/__tests__/council-tool.test.ts` | 0 / 0 | 0 / 0 |
| `server/services/ana/__tests__/deep-investigation.test.ts` | 0 / 0 | 0 / 0 |
| `server/services/ana/__tests__/server-tool-steps.test.ts` | 0 / 0 | 0 / 0 |
| `server/services/ana/__tests__/tool-plan-labels.test.ts` | 0 / 0 | 0 / 0 |
| `server/services/ana/__tests__/tool-trace-agent.test.ts` | 0 / 0 | 0 / 0 |
| `server/services/ana/__tests__/turn-plan-and-context.test.ts` | 0 / 0 | 0 / 0 |
| `tests/services/agentic-loop.test.ts` | 0 / 0 | 0 / 0 |

Not linted by ESLint: `tool-authorization.register.json`, `app-v2.css` (ci:undefined-css-classes OK), `package.json`, the two workflows (ci:workflow-targets OK).
