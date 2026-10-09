# W7 test output — 2026-09-21T00:13:10Z

## Unit lane (vitest.config.ts, pg mocked)
```
 ✓ server/mcp/__tests__/mcp-auth-contract.test.ts > OAuth 2.1 resource-server contract > serves RFC 9728 protected-resource metadata for /mcp 21ms
 ✓ server/mcp/__tests__/mcp-auth-contract.test.ts > OAuth 2.1 resource-server contract > serves RFC 8414 authorization-server metadata with PKCE S256 and dynamic registration 4ms
 ✓ server/mcp/__tests__/mcp-auth-contract.test.ts > OAuth 2.1 resource-server contract > answers /mcp without a token with 401 and a resource_metadata challenge 17ms
 ✓ server/mcp/__tests__/mcp-auth-contract.test.ts > OAuth 2.1 resource-server contract > answers /mcp with a forged token with 401 (same verifier as the API: HS256 + rotation) 4ms
 ✓ server/mcp/__tests__/mcp-auth-contract.test.ts > OAuth 2.1 resource-server contract > rejects a refresh-class token on the MCP path (token-class allow-list) 8ms
 ✓ server/mcp/__tests__/mcp-auth-contract.test.ts > curated tool catalog > has 19 uniquely named tools, each with all four annotation hints, a scope and exactly one governed write 7ms
 ✓ server/mcp/__tests__/mcp-auth-contract.test.ts > fail-closed model-backed tool > returns the gateway’s own refusal verbatim when no provider key is configured 283ms
 ✓ server/mcp/__tests__/mcp-auth-contract.test.ts > fail-closed model-backed tool > maps an AnA handler error to a verbatim refusal, never an empty success 1ms
 Test Files  1 passed (1)
      Tests  8 passed (8)
   Duration  2.61s (transform 1.16s, setup 78ms, import 139ms, tests 2.24s, environment 0ms)
```

## Real-database lane (vitest.db.config.ts, RLS_ENFORCE=on)
```
 ✓ server/mcp/__tests__/mcp-connector.dbtest.ts > discovery and authentication over HTTP > 401 + resource_metadata without a bearer; metadata documents resolve 49ms
 ✓ server/mcp/__tests__/mcp-connector.dbtest.ts > tools/list > lists the 19 curated tools with annotations through the SDK client 70ms
 ✓ server/mcp/__tests__/mcp-connector.dbtest.ts > tool calls are scoped to the token’s organisation > c2c_list_projects: A sees A’s program; B sees B’s and never A’s 231ms
 ✓ server/mcp/__tests__/mcp-connector.dbtest.ts > tool calls are scoped to the token’s organisation > c2c_list_vault_documents: each organisation sees only its own document 87ms
 ✓ server/mcp/__tests__/mcp-connector.dbtest.ts > tool calls are scoped to the token’s organisation > c2c_assess_sequence_readiness: A gets the engine verdict; B is refused for A’s sequence 1666ms
 ✓ server/mcp/__tests__/mcp-connector.dbtest.ts > the governed write > is denied to a connector token without c2c:file 39ms
 ✓ server/mcp/__tests__/mcp-connector.dbtest.ts > the governed write > files a DRAFT leaf pointing at a vault document, returns the sign-off link, and is audited with tool + org 37ms
 ✓ server/mcp/__tests__/mcp-connector.dbtest.ts > the governed write > refuses a vault document from another organisation verbatim (no cross-tenant pointer) 23ms
 ✓ server/mcp/__tests__/mcp-connector.dbtest.ts > model-backed tool without a provider key > returns the gateway refusal verbatim, never demo-mode text 26ms
 ✓ server/mcp/__tests__/mcp-connector.dbtest.ts > model-backed tool without a provider key > a deterministic reference tool (ICH corpus) answers through the AnA handler 3744ms
 Test Files  1 passed (1)
      Tests  10 passed (10)
   Duration  8.71s (transform 5.24s, setup 84ms, import 303ms, tests 8.01s, environment 0ms)
```
