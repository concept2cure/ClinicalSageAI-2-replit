/**
 * McpServer factory. One server instance per request (stateless Streamable
 * HTTP): tools are registered fresh, which is cheap, and no session state
 * lives in the process — a second instance behind a load balancer answers
 * identically.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpConfig } from './config';
import { CONNECTOR_TOOLS } from './tools/index';
import { registerTool } from './tools/runtime';

export const SERVER_INFO = {
  name: 'concept2cure',
  title: 'Concept2Cure',
  version: '1.0.0',
} as const;

export const SERVER_INSTRUCTIONS =
  'Concept2Cure is the regulatory operating system behind these tools. Claude drafts; Concept2Cure governs, ' +
  'validates and submits. Every number, verdict and readiness state returned here is computed by a ' +
  'deterministic platform engine — report it verbatim and never estimate one yourself. An error result is a ' +
  'refusal from the platform (no licence, no credentials, no data, wrong tenant); relay it, do not work ' +
  'around it. The only write, c2c_file_draft_for_review, creates a DRAFT leaf; signing, freezing and ' +
  'transmitting a sequence happen in the Concept2Cure app behind 21 CFR Part 11 electronic signature.';

export function buildMcpServer(config: McpConfig): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS });
  for (const spec of CONNECTOR_TOOLS) registerTool(server, spec, config);
  return server;
}
