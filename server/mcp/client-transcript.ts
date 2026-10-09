/**
 * Evidence client — a separate Node process driving the connector with the
 * official SDK client over Streamable HTTP, exactly as a Claude client would.
 *
 *   MCP_URL=http://localhost:5300/mcp MCP_TOKEN=<bearer> [SEQUENCE_ID=<id>] \
 *     npx tsx server/mcp/client-transcript.ts
 *
 * Without MCP_TOKEN it obtains one from POST /api/auth/dev-login (dev only).
 * Prints a Markdown transcript to stdout: tools/list, then c2c_list_projects,
 * c2c_assess_sequence_readiness and c2c_get_sequence_status.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const MCP_URL = process.env.MCP_URL || 'http://localhost:5300/mcp';
const origin = new URL(MCP_URL).origin;

async function token(): Promise<string> {
  if (process.env.MCP_TOKEN) return process.env.MCP_TOKEN;
  const res = await fetch(`${origin}/api/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.MCP_DEV_EMAIL || 'jonmichaelpsmith@gmail.com' }),
  });
  if (!res.ok) throw new Error(`dev-login failed: ${res.status}`);
  return ((await res.json()) as { accessToken: string }).accessToken;
}

function section(title: string, body: unknown): void {
  process.stdout.write(`\n## ${title}\n\n\`\`\`json\n${JSON.stringify(body, null, 2)}\n\`\`\`\n`);
}

async function main(): Promise<void> {
  const bearer = await token();
  process.stdout.write(`# MCP client transcript — ${new Date().toISOString()}\n\nServer: ${MCP_URL}  \nClient: @modelcontextprotocol/sdk Client over StreamableHTTPClientTransport (separate process, bearer from dev-login)\n`);

  const unauth = await fetch(MCP_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: '{}' });
  section('Unauthenticated POST /mcp', { status: unauth.status, 'www-authenticate': unauth.headers.get('www-authenticate') });
  section('GET /.well-known/oauth-protected-resource/mcp', await (await fetch(`${origin}/.well-known/oauth-protected-resource/mcp`)).json());

  const client = new Client({ name: 'w7-evidence-client', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL), { requestInit: { headers: { Authorization: `Bearer ${bearer}` } } }));
  const sv = client.getServerVersion();
  section('initialize → server', { server: sv, instructions: client.getInstructions() });

  const { tools } = await client.listTools();
  section('tools/list', tools.map((t) => ({ name: t.name, title: t.title, annotations: t.annotations, scope: (t._meta as { scope?: string } | undefined)?.scope, governed: (t._meta as { governed?: boolean } | undefined)?.governed })));

  const projects = await client.callTool({ name: 'c2c_list_projects', arguments: { limit: 5 } });
  section('tools/call c2c_list_projects', projects);

  const sequenceId = Number(process.env.SEQUENCE_ID || 0);
  if (sequenceId > 0) {
    section('tools/call c2c_assess_sequence_readiness', await client.callTool({ name: 'c2c_assess_sequence_readiness', arguments: { sequence_id: sequenceId } }));
    section('tools/call c2c_get_sequence_status', await client.callTool({ name: 'c2c_get_sequence_status', arguments: { sequence_id: sequenceId } }));
  } else {
    section('tools/call c2c_readiness_overview', await client.callTool({ name: 'c2c_readiness_overview', arguments: {} }));
  }
  section('tools/call c2c_draft_agency_response (no provider key — expect verbatim refusal)', await client.callTool({ name: 'c2c_draft_agency_response', arguments: { deficiency: 'Please justify the proposed dissolution acceptance criterion.', facts: ['12-month stability shows no trend.'] } }));
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
