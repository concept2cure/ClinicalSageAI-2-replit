# IAM-22 — production refuses open connector client registration

Found 2026-10-01 by the re-verification of the P0-2 residual. With `MCP_ENABLED=true` in production and no
`MCP_CLIENT_REDIRECT_ALLOWLIST`, dynamic client registration (`POST /register`) accepted any https origin and the
server only logged a warning; the allow-list was left as the founder's choice. Decided (ADR-0014, the connector):
production never runs with open registration. `createMcpRouter` now throws in that state, and `server/index.ts` builds
it at boot when the connector is enabled, so the process does not start. The launch allow-list is the Claude client
origins, `https://claude.ai,https://claude.com`. Development and test are unchanged.

| Check | Red | Green |
|---|---|---|
| `server/mcp/__tests__/mcp-registration-posture.test.ts`, production with no allow-list | built (no throw) (`red/registration-posture.txt`) | refuses; with an allow-list and outside production it builds; MCP suites green (`green/registration-posture.txt`; the tool-policy case timed out under load and passes alone) |
