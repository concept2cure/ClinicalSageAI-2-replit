# Connector dependencies — justification

Repository rule: no new production dependency without a written justification.

## `@modelcontextprotocol/sdk` 1.30.0 (added 2026-09-20, `npm install --save`)

The official TypeScript SDK for the Model Context Protocol, maintained by the
protocol's authors. It supplies:

* `McpServer` / `registerTool` — tool registration with JSON-schema input,
  annotations and `structuredContent`, kept in step with the protocol version
  Claude clients negotiate;
* `StreamableHTTPServerTransport` — the Streamable HTTP transport (stateless
  JSON mode), including protocol-version and Accept negotiation;
* `mcpAuthRouter`, `requireBearerAuth`, the RFC 7591/8414/9728 handlers and
  PKCE S256 verification — the OAuth 2.1 surface the MCP authorization
  specification requires of a resource server;
* the `Client` + `StreamableHTTPClientTransport` used by the tests and the
  evidence transcript.

Hand-writing the JSON-RPC framing, SSE responses, protocol-version handshake
and OAuth handlers would be a second implementation of a public specification
that changes on the protocol's release cadence — exactly the duplication the
working agreement forbids. The SDK's own transitive additions (`pkce-challenge`,
`@hono/node-server`, `eventsource-parser`, `ajv`, …) are pinned by the
lockfile. Its peer dependency `zod ^3.25 || ^4` is satisfied by the existing
`zod` 3.25.x; no zod change was needed.

Used by: `server/mcp/**` only. Every model call the connector makes still goes
through `getGateway()`; the SDK carries no model client.

## Not added

`cors`, `express-rate-limit`, `jsonwebtoken`, `helmet`-equivalent headers and
`supertest` were already dependencies and are reused. No Anthropic or OpenAI
client was added (CI `ci:gateway-bypass` forbids direct SDK use outside the
gateway).
