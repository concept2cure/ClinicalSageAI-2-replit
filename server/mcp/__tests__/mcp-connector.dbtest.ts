/**
 * The connector against real PostgreSQL (vitest.db.config.ts, RLS_ENFORCE=on).
 *
 * Proves, with the SDK's own client over Streamable HTTP:
 *   1. tools/list returns the curated catalog with annotations;
 *   2. three tool calls read the caller's organisation and ONLY it — a second
 *      organisation's token sees none of the first's projects, documents or
 *      sequences, and a cross-tenant id is refused, not emptied;
 *   3. the governed write files a draft leaf, is scope-gated (a c2c:read-only
 *      connector token is denied), returns the sign-off link, and leaves an
 *      audit row naming the tool and the organisation;
 *   4. the model-backed tool fails closed without a provider key.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { databaseUrl } from '../../../tests/setup.db';

const PREFIX = 'dbtest-w7';

let owner: Pool;
let server: http.Server;
let baseUrl: string;
let resourceUrl: string;

interface Tenant { orgId: number; orgUuid: string; userId: number; membershipId: number; programId: string; docId: string }
let A: Tenant;
let B: Tenant;
let submissionId: number;
let sequenceId: number;
let tokenA: string;
let tokenB: string;
let readOnlyTokenA: string;

async function seedTenant(tag: string): Promise<Tenant> {
  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PREFIX} org ${tag}`, `${PREFIX}-org-${tag}`],
  );
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, 'not-a-real-hash')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [`${PREFIX}-${tag}@example.test`, `${PREFIX} user ${tag}`],
  );
  const orgId = Number(org.rows[0].id);
  const userId = Number(user.rows[0].id);
  const membership = await owner.query(
    `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'admin')
       ON CONFLICT (user_id, organization_id) DO UPDATE SET role = 'admin' RETURNING id`,
    [orgId, userId],
  );
  const program = await owner.query(
    `INSERT INTO regulatory_programs (organization_id, name, code, program_type, product_type, primary_agency, product_name, status)
       VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', $4, 'active') RETURNING id`,
    [orgId, `${PREFIX} program ${tag}`, `W7-${tag}`, `${PREFIX} product ${tag}`],
  );
  const programId = String(program.rows[0].id);
  const doc = await owner.query(
    `INSERT INTO vault.documents (program_id, content_hash, file_name, document_title, document_code, document_type, organization_id)
       VALUES ($1, $2, $3, $4, $5, 'protocol', $6) RETURNING id`,
    [programId, createHash('sha256').update(`${PREFIX}-${tag}`).digest('hex'), `${PREFIX}-${tag}.pdf`, `${PREFIX} protocol ${tag}`, `W7DOC-${tag}`, orgId],
  );
  return { orgId, orgUuid: String(org.rows[0].uuid), userId, membershipId: Number(membership.rows[0].id), programId, docId: String(doc.rows[0].id) };
}

async function cleanup(): Promise<void> {
  const orgIds = await owner.query(`SELECT id FROM organizations WHERE slug LIKE $1`, [`${PREFIX}-org-%`]);
  const ids = orgIds.rows.map((r) => Number(r.id));
  if (ids.length === 0) return;
  await owner.query(`DELETE FROM submission_leaves WHERE organization_id = ANY($1)`, [ids]);
  await owner.query(`DELETE FROM ectd_sequences WHERE organization_id = ANY($1)`, [ids]);
  await owner.query(`DELETE FROM submissions WHERE organization_id = ANY($1)`, [ids]);
  await owner.query(`DELETE FROM vault.documents WHERE program_id IN (SELECT id FROM regulatory_programs WHERE organization_id = ANY($1))`, [ids]);
  await owner.query(`DELETE FROM regulatory_programs WHERE organization_id = ANY($1)`, [ids]);
  await owner.query(`DELETE FROM organization_users WHERE organization_id = ANY($1)`, [ids]);
  await owner.query(`DELETE FROM users WHERE email LIKE $1`, [`${PREFIX}-%@example.test`]);
  await owner.query(`DELETE FROM organizations WHERE id = ANY($1)`, [ids]);
}

async function mcpClient(token: string): Promise<Client> {
  const client = new Client({ name: 'w7-dbtest', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(resourceUrl), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
}

type CallResult = { isError?: boolean; content: Array<{ type: string; text?: string }>; structuredContent?: Record<string, unknown> };
async function call(client: Client, name: string, args: Record<string, unknown>): Promise<CallResult> {
  return (await client.callTool({ name, arguments: args })) as CallResult;
}

beforeAll(async () => {
  for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'MOONSHOT_API_KEY', 'AZURE_OPENAI_API_KEY']) delete process.env[k];
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await cleanup();
  A = await seedTenant('a');
  B = await seedTenant('b');
  const sub = await owner.query(
    `INSERT INTO submissions (title, application_type, client_type, primary_region, organization_id, created_by)
       VALUES ($1, 'ind', 'pharma', 'fda', $2, $3) RETURNING id`,
    [`${PREFIX} submission a`, A.orgId, A.userId],
  );
  submissionId = Number(sub.rows[0].id);
  const seq = await owner.query(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, organization_id, created_by)
       VALUES ($1, 'fda', '0000', $2, $3) RETURNING id`,
    [submissionId, A.orgId, A.userId],
  );
  sequenceId = Number(seq.rows[0].id);

  const app = express();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  baseUrl = `http://localhost:${port}`;
  resourceUrl = `${baseUrl}/mcp`;
  const { createMcpRouter } = await import('../index');
  const { resolveMcpConfig } = await import('../config');
  const config = resolveMcpConfig({ ...process.env, MCP_ENABLED: 'true', MCP_PUBLIC_URL: baseUrl });
  app.use(createMcpRouter(config));

  const { activeJwtSecret } = await import('../../utils/jwtVerify');
  const platformToken = (t: Tenant) =>
    jwt.sign(
      { userId: String(t.userId), email: `${PREFIX}@example.test`, organizationId: String(t.orgId), organizationUuid: t.orgUuid, role: 'admin', type: 'access' },
      activeJwtSecret(),
      { expiresIn: '1h', algorithm: 'HS256' },
    );
  tokenA = platformToken(A);
  tokenB = platformToken(B);
  const { mintAccessToken } = await import('../auth/platform-token');
  readOnlyTokenA = mintAccessToken({
    membership: { membershipId: A.membershipId, organizationId: A.orgId, userId: A.userId, role: 'admin', organizationUuid: A.orgUuid, email: null },
    clientId: 'w7-readonly-client',
    scopes: ['c2c:read'],
    resource: resourceUrl,
    ttlSeconds: 600,
  }).token;
});

afterAll(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  await cleanup().catch(() => {});
  await owner.end().catch(() => {});
});

describe('discovery and authentication over HTTP', () => {
  it('401 + resource_metadata without a bearer; metadata documents resolve', async () => {
    const res = await fetch(resourceUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: '{}' });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain(`resource_metadata="${baseUrl}/.well-known/oauth-protected-resource/mcp"`);
    const prm = await (await fetch(`${baseUrl}/.well-known/oauth-protected-resource/mcp`)).json();
    expect(prm.resource).toBe(resourceUrl);
  });
});

describe('tools/list', () => {
  it('lists the 19 curated tools with annotations through the SDK client', async () => {
    const client = await mcpClient(tokenA);
    const { tools } = await client.listTools();
    expect(tools.length).toBe(19);
    const write = tools.find((t) => t.name === 'c2c_file_draft_for_review');
    expect(write?.annotations?.readOnlyHint).toBe(false);
    expect(tools.filter((t) => t.name !== 'c2c_file_draft_for_review').every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
    await client.close();
  });
});

describe('tool calls are scoped to the token’s organisation', () => {
  it('c2c_list_projects: A sees A’s program; B sees B’s and never A’s', async () => {
    const a = await mcpClient(tokenA);
    const b = await mcpClient(tokenB);
    const ra = await call(a, 'c2c_list_projects', {});
    const rb = await call(b, 'c2c_list_projects', {});
    expect(ra.isError).toBeFalsy();
    expect(rb.isError).toBeFalsy();
    const codesA = (ra.structuredContent!.projects as Array<{ code: string }>).map((p) => p.code);
    const codesB = (rb.structuredContent!.projects as Array<{ code: string }>).map((p) => p.code);
    expect(codesA).toContain('W7-a');
    expect(codesA).not.toContain('W7-b');
    expect(codesB).toContain('W7-b');
    expect(codesB).not.toContain('W7-a');
    expect(ra.structuredContent!.organizationId).toBe(A.orgId);
    await a.close();
    await b.close();
  });

  it('c2c_list_vault_documents: each organisation sees only its own document', async () => {
    const a = await mcpClient(tokenA);
    const b = await mcpClient(tokenB);
    const ra = await call(a, 'c2c_list_vault_documents', { title_contains: PREFIX });
    const rb = await call(b, 'c2c_list_vault_documents', { title_contains: PREFIX });
    const idsA = (ra.structuredContent!.documents as Array<{ id: string }>).map((d) => d.id);
    const idsB = (rb.structuredContent!.documents as Array<{ id: string }>).map((d) => d.id);
    expect(idsA).toContain(A.docId);
    expect(idsA).not.toContain(B.docId);
    expect(idsB).toContain(B.docId);
    expect(idsB).not.toContain(A.docId);
    await a.close();
    await b.close();
  });

  it('c2c_assess_sequence_readiness: A gets the engine verdict; B is refused for A’s sequence', async () => {
    const a = await mcpClient(tokenA);
    const b = await mcpClient(tokenB);
    const ra = await call(a, 'c2c_assess_sequence_readiness', { sequence_id: sequenceId });
    expect(ra.isError).toBeFalsy();
    const sc = ra.structuredContent!;
    expect(sc.sequenceId).toBe(sequenceId);
    expect(typeof (sc.dispatchGate as { cleared: boolean }).cleared).toBe('boolean');
    expect((sc.dispatchGate as { cleared: boolean }).cleared).toBe(false); // an empty draft sequence is not dispatchable
    expect(ra.content[0].text).toContain('dispatch gate BLOCKED');
    const rb = await call(b, 'c2c_assess_sequence_readiness', { sequence_id: sequenceId });
    expect(rb.isError).toBe(true);
    expect(rb.content[0].text).toMatch(/not found/i);
    const rlist = await call(b, 'c2c_list_sequences', { submission_id: submissionId });
    expect(rlist.isError).toBe(true);
    await a.close();
    await b.close();
  });
});

describe('the governed write', () => {
  it('is denied to a connector token without c2c:file', async () => {
    const ro = await mcpClient(readOnlyTokenA);
    const listed = await call(ro, 'c2c_list_projects', {});
    expect(listed.isError).toBeFalsy();
    const denied = await call(ro, 'c2c_file_draft_for_review', { sequence_id: sequenceId, section_code: '2.5', title: 'Clinical Overview', reason: 'scope test' });
    expect(denied.isError).toBe(true);
    expect(denied.content[0].text).toContain('Insufficient scope');
    await ro.close();
  });

  it('files a DRAFT leaf pointing at a vault document, returns the sign-off link, and is audited with tool + org', async () => {
    const a = await mcpClient(tokenA);
    const r = await call(a, 'c2c_file_draft_for_review', {
      sequence_id: sequenceId,
      section_code: '2.5',
      title: 'Clinical Overview (draft)',
      vault_document_id: A.docId,
      reason: 'W7 acceptance: draft filed for review',
    });
    expect(r.isError).toBeFalsy();
    const sc = r.structuredContent!;
    expect(sc.status).toBe('draft');
    expect((sc.signOff as { url: string }).url).toBe(`${baseUrl}/concept2cure/submission-center`);
    const leaf = sc.leaf as { id: number; sectionCode: string; documentTable: string; documentUuid: string | null };
    expect(leaf.sectionCode).toBe('2.5');
    expect(leaf.documentTable).toBe('vault_documents');
    const row = await owner.query('SELECT organization_id, sequence_id, lifecycle_op FROM submission_leaves WHERE id = $1', [leaf.id]);
    expect(row.rows[0]).toMatchObject({ organization_id: A.orgId, sequence_id: sequenceId, lifecycle_op: 'new' });
    // The audit writer commits after the tool result is returned, so the row
    // can land a moment after the response; poll rather than race it. Rows
    // carry UUID ids, so order by time, and pick the 'ok' outcome — the same
    // call is also audited as 'denied' for the read-only client above.
    let audit = { rows: [] as Array<Record<string, any>> };
    for (let i = 0; i < 40 && audit.rows.length === 0; i++) {
      audit = await owner.query(
        `SELECT tenant_id, user_id, new_values FROM audit_logs
          WHERE action = 'mcp_governed_tool_call' AND record_id = 'c2c_file_draft_for_review'
            AND tenant_id = $1 AND new_values->>'outcome' = 'ok'
          ORDER BY created_at DESC LIMIT 1`,
        [A.orgId],
      );
      if (audit.rows.length === 0) await new Promise((r) => setTimeout(r, 100));
    }
    expect(audit.rows.length).toBe(1);
    expect(Number(audit.rows[0].user_id)).toBe(A.userId);
    expect(audit.rows[0].new_values).toMatchObject({ tool: 'c2c_file_draft_for_review', organizationId: A.orgId, outcome: 'ok' });
    await a.close();
  });

  it('refuses a vault document from another organisation verbatim (no cross-tenant pointer)', async () => {
    const a = await mcpClient(tokenA);
    const r = await call(a, 'c2c_file_draft_for_review', { sequence_id: sequenceId, section_code: '2.7.3', title: 'Foreign', vault_document_id: B.docId, reason: 'cross-tenant test' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/not found for this organization|FORBIDDEN/i);
    await a.close();
  });
});

describe('model-backed tool without a provider key', () => {
  it('returns the gateway refusal verbatim, never demo-mode text', async () => {
    const a = await mcpClient(tokenA);
    const r = await call(a, 'c2c_draft_agency_response', { deficiency: 'Justify the dissolution specification limit.', facts: ['No trend at 12 months.'] });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toBe(
      '[AI Gateway] No AI provider is configured in production; refusing to serve demo-mode content. Set ANTHROPIC_API_KEY / OPENAI_API_KEY, or enable deterministicMode explicitly.',
    );
    await a.close();
  });

  it('a deterministic reference tool (ICH corpus) answers through the AnA handler', async () => {
    const a = await mcpClient(tokenA);
    const r = await call(a, 'c2c_lookup_ich_guideline', { guideline: 'E6(R3)' });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent!.source).toBe('ICH Guidelines');
    await a.close();
  });
});
