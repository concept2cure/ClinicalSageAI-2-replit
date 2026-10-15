# ESLint per changed file, HEAD vs now (2026-10-08)

HEAD (6c58f587b) counted with `git show HEAD:<file> | npx eslint --stdin --stdin-filename <file> -f json`; now with `npx eslint -f json <file>`.

| File | HEAD warnings / errors | Now warnings / errors |
|---|---|---|
| `server/services/connectors/connector-interface.ts` | 1 / 0 | 1 / 0 |
| `server/services/connectors/google-drive.ts` | 0 / 0 | 0 / 0 |
| `server/services/integrations/connector-search.ts` | 0 / 0 | 0 / 0 |
| `server/services/integrations/integration-status.ts` | 1 / 0 | 1 / 0 |
| `server/services/ana/evidence-literature-tool-defs.ts` | 1 / 0 | 1 / 0 |
| `server/services/connectors/__tests__/pmda-nmpa-honest.test.ts` | 0 / 0 | 0 / 0 |
| `server/services/integrations/__tests__/integration-status.test.ts` | 0 / 0 | 0 / 0 |
| `server/services/ana/__tests__/search-connected-repositories-tool.test.ts` | (new file) | 0 / 0 |
| `server/services/connectors/__tests__/google-drive-search.test.ts` | (new file) | 0 / 0 |

The three single warnings are the same pre-existing size limits at HEAD and now: `max-lines` on
`evidence-literature-tool-defs.ts` (1,738 lines) and `connector-interface.ts` (634), and `max-lines-per-function` on
`getIntegrationStatuses` (118 lines now; over the 100 limit at HEAD too). No file gained a warning.
