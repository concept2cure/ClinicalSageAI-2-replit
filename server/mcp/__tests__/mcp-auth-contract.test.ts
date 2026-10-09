/**
 * Connector contract that needs no database: OAuth discovery documents, the
 * 401 + WWW-Authenticate resource_metadata challenge, the curated tool
 * catalog's shape, and the fail-closed behaviour of the one model-backed tool
 * when no provider is configured.
 *
 * The real-database companion (mcp-connector.dbtest.ts) proves tool calls and
 * tenant scoping against PostgreSQL.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PUBLIC_URL = 'http://localhost:5300';

async function buildApp() {
  const { createMcpRouter } = await import('../index');
  const { resolveMcpConfig } = await import('../config');
  const config = resolveMcpConfig({ ...process.env, MCP_ENABLED: 'true', MCP_PUBLIC_URL: PUBLIC_URL });
  const app = express();
  app.use(createMcpRouter(config));
  return app;
}

describe('OAuth 2.1 resource-server contract', () => {
  let app: express.Express;
  beforeAll(async () => {
    app = await buildApp();
  });

  it('serves RFC 9728 protected-resource metadata for /mcp', async () => {
    const res = await request(app).get('/.well-known/oauth-protected-resource/mcp');
    expect(res.status).toBe(200);
    expect(res.body.resource).toBe(`${PUBLIC_URL}/mcp`);
    expect(res.body.authorization_servers).toEqual([`${PUBLIC_URL}/`]);
    expect(res.body.scopes_supported).toEqual(['c2c:read', 'c2c:draft', 'c2c:file']);
  });

  it('serves RFC 8414 authorization-server metadata with PKCE S256 and dynamic registration', async () => {
    const res = await request(app).get('/.well-known/oauth-authorization-server');
    expect(res.status).toBe(200);
    expect(res.body.code_challenge_methods_supported).toEqual(['S256']);
    expect(res.body.grant_types_supported).toEqual(['authorization_code', 'refresh_token']);
    expect(res.body.registration_endpoint).toBe(`${PUBLIC_URL}/register`);
    expect(res.body.token_endpoint).toBe(`${PUBLIC_URL}/token`);
    expect(res.body.authorization_endpoint).toBe(`${PUBLIC_URL}/authorize`);
  });

  it('answers /mcp without a token with 401 and a resource_metadata challenge', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toContain('Bearer error="invalid_token"');
    expect(res.headers['www-authenticate']).toContain(
      `resource_metadata="${PUBLIC_URL}/.well-known/oauth-protected-resource/mcp"`,
    );
  });

  it('answers /mcp with a forged token with 401 (same verifier as the API: HS256 + rotation)', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer not.a.jwt')
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toContain('resource_metadata=');
  });

  it('rejects a refresh-class token on the MCP path (token-class allow-list)', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const { activeJwtSecret } = await import('../../utils/jwtVerify');
    const refresh = jwt.sign({ userId: '1', organizationId: '2', type: 'refresh' }, activeJwtSecret(), { expiresIn: '5m' });
    const res = await request(app)
      .post('/mcp')
      .set('Authorization', `Bearer ${refresh}`)
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    expect(res.status).toBe(401);
  });
});

describe('curated tool catalog', () => {
  it('has 19 uniquely named tools, each with all four annotation hints, a scope and exactly one governed write', async () => {
    const { CONNECTOR_TOOLS } = await import('../tools/index');
    expect(CONNECTOR_TOOLS.length).toBe(19);
    expect(new Set(CONNECTOR_TOOLS.map((t) => t.name)).size).toBe(19);
    for (const t of CONNECTOR_TOOLS) {
      expect(t.name.startsWith('c2c_')).toBe(true);
      expect(t.title.length).toBeGreaterThan(3);
      expect(t.description.length).toBeGreaterThan(40);
      expect(typeof t.annotations.readOnlyHint).toBe('boolean');
      expect(typeof t.annotations.destructiveHint).toBe('boolean');
      expect(typeof t.annotations.idempotentHint).toBe('boolean');
      expect(typeof t.annotations.openWorldHint).toBe('boolean');
      expect(['c2c:read', 'c2c:draft', 'c2c:file']).toContain(t.scope);
    }
    const governed = CONNECTOR_TOOLS.filter((t) => t.governed);
    expect(governed.map((t) => t.name)).toEqual(['c2c_file_draft_for_review']);
    expect(governed[0].annotations.readOnlyHint).toBe(false);
    expect(governed[0].scope).toBe('c2c:file');
    // Every other tool is read-only at the annotation level.
    expect(CONNECTOR_TOOLS.filter((t) => !t.governed).every((t) => t.annotations.readOnlyHint)).toBe(true);
  });
});

describe('fail-closed model-backed tool', () => {
  it('returns the gateway’s own refusal verbatim when no provider key is configured', async () => {
    for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'MOONSHOT_API_KEY', 'AZURE_OPENAI_API_KEY']) delete process.env[k];
    const gatewayModule = await import('../../services/ai-gateway/gateway');
    gatewayModule.resetGateway();
    expect(gatewayModule.getGateway().getModels().some((m) => m.enabled)).toBe(false);

    const { draftAgencyResponse, GATEWAY_NO_PROVIDER_REFUSAL } = await import('../tools/drafting');
    const { resolveMcpConfig } = await import('../config');
    const outcome = await draftAgencyResponse.run(
      { agency: 'FDA', deficiency: 'Provide the justification for the dissolution acceptance criterion.', facts: ['12-month stability shows no trend.'], tone: 'formal' },
      {
        config: resolveMcpConfig({ ...process.env, MCP_PUBLIC_URL: PUBLIC_URL }),
        principal: { userId: 1, organizationId: 2, organizationUuid: null, role: 'admin', email: null, clientId: 'test', scopes: ['c2c:draft'], tokenUse: 'platform' },
        ana: { organizationId: 2, userId: 1, organizationUuid: null },
      },
    );
    expect(outcome.kind).toBe('refused');
    if (outcome.kind !== 'refused') return;
    expect(outcome.reason).toBe(GATEWAY_NO_PROVIDER_REFUSAL);
    // The refusal is the gateway's own production message, not one invented here.
    const gatewaySource = readFileSync(path.resolve(__dirname, '../../services/ai-gateway/gateway.ts'), 'utf8');
    expect(gatewaySource).toContain('No AI provider is configured in production; refusing to serve demo-mode content.');
  });

  it('maps an AnA handler error to a verbatim refusal, never an empty success', async () => {
    const { parseAnaResult } = await import('../tools/runtime');
    const refused = parseAnaResult(JSON.stringify({ error: 'lookup failed: corpus offline' }));
    expect(refused).toEqual({ kind: 'refused', reason: 'lookup failed: corpus offline', data: { error: 'lookup failed: corpus offline' } });
    const needs = parseAnaResult(JSON.stringify({ status: 'needs_parameters', message: 'documentId is required' }));
    expect(needs.kind).toBe('refused');
    const okv = parseAnaResult(JSON.stringify({ count: 0, records: [] }));
    expect(okv.kind).toBe('ok');
  });
});
