# D8 / D6 — the connector honours the tenant's AnA tool policy

Row **D8** (connector for Claude), with **D6** (security posture). AnA local-safe-AI plan
**WS9**, the item "the connector honours the tenant's tool policy". Session `…01SuVLo2`,
2026-10-01.

## The defect

`organizations.settings.anaToolPolicy.deny` is how a tenant turns an AnA tool off. Every
chat door withholds a denied tool through `governedToolsetFor`. The MCP connector's
`callAnaHandler` (`server/mcp/tools/runtime.ts`) ran AnA's registered handlers directly,
so a denied tool still ran for the same organization over the connector. Seven handlers
are reached that way: `lookup_ich_guideline`, `check_regulatory_currency`,
`guidance_change_radar`, `lookup_submission_deficiencies`, `lookup_regulatory_precedents`,
`run_submission_premortem`, `detect_evidence_contradictions`.

## The fix

`callAnaHandler` loads the tenant's policy with the loader the chat doors use
(`loadAnaToolPolicy`) and applies the same filter (`filterToolsByPolicy`): a denied tool
is refused with the reason. `allow` stays scoped to governed mutations, as that filter
documents, so an allowlist for one mutation does not strip these read tools; and an
unreadable policy fails soft for reads, exactly as on the chat doors. One rule, both doors.

## Red and green

| What | Red | Green |
|---|---|---|
| `server/mcp/__tests__/mcp-tenant-tool-policy.test.ts` | `red/connector-tool-policy.txt`: at `48031657`, organization 7 denies `lookup_ich_guideline` and the connector runs it (`ok`) | `green/connector-tool-policy.txt`: refused for 7; runs for 8, which did not deny it; an allowlist for a mutation does not strip it. The MCP suites pass |

Not run: `mcp-connector.dbtest.ts` on a provisioned database (no cluster in this
container). The added read is the one the chat doors already make in the same tenant scope.

## Not done here (the rest of WS9)

- A `c2c:public` scope limited to the public reference engines, for third-party agents.
- A per-organization enable for the connector.
