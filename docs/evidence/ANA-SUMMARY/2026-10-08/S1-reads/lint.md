# ESLint per changed file, HEAD vs now (2026-10-08)

HEAD counted with `git show HEAD:<file> | npx eslint --stdin --stdin-filename <file> -f json`; now with `npx eslint -f json <file>`.

| File | HEAD warnings/errors | Now warnings/errors |
|---|---|---|
| `server/services/ana/agentic-loop.ts` | 0 / 0 | 0 / 0 |
| `server/services/ana/read-receipts.ts` | (new file) | 0 / 0 |
| `server/services/ana/document-catalog-tools.ts` | 0 / 0 | 0 / 0 |
| `server/services/ana/document-catalog-tool-defs.ts` | 0 / 0 | 0 / 0 |
| `server/services/ana/authoring-read-tools.ts` | 0 / 0 | 0 / 0 |
| `server/services/ana/regulatory-knowledge-tools.ts` | 0 / 0 | 0 / 0 |
| `server/services/ana/cmc-knowledge-tools.ts` | 0 / 0 | 0 / 0 |
| `server/services/ana/AnaToolExecutor.ts` | 100 / 0 | 100 / 0 |
| `server/routes/ana-ri/stream.ts` | 23 / 0 | 23 / 0 |
| `server/services/ana/__tests__/read-receipts.test.ts` | (new file) | 0 / 0 |
| `server/services/ana/__tests__/read-delivery-executor.test.ts` | (new file) | 0 / 0 |
| `server/services/ana/__tests__/support/read-delivery-vault.ts` | (new file) | 0 / 0 |
| `server/services/ana/__tests__/document-catalog-tools-project-scope.test.ts` | 0 / 0 | 0 / 0 |
| `server/routes/ana-ri/__tests__/stream-read-delivery.test.ts` | (new file) | 0 / 0 |
| `tests/db/document-catalog.dbtest.ts` | 0 / 0 | 0 / 0 |
| `tests/db/document-catalog-recall.dbtest.ts` | 0 / 0 | 0 / 0 |
| `tests/db/ana-tool-call.ts` | (new file) | 0 / 0 |
