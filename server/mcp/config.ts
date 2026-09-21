/**
 * Connector configuration — resolved once from the environment.
 *
 * MCP_PUBLIC_URL is the externally reachable origin of this deployment
 * (e.g. https://app.concept2cure.com). It is the OAuth issuer, the base of
 * every advertised endpoint, and — with /mcp appended — the RFC 8707 resource
 * identifier that OAuth-issued tokens are bound to. It defaults to
 * http://localhost:<PORT> so a local boot works without configuration; the
 * MCP SDK refuses a non-HTTPS issuer for any other hostname, which is the
 * intended fail-closed posture for staging and production.
 */

export const MCP_PATH = '/mcp';

/** Scopes the connector understands. Every tool declares exactly one. */
export const MCP_SCOPES = {
  read: 'c2c:read',
  draft: 'c2c:draft',
  file: 'c2c:file',
} as const;
export type McpScope = (typeof MCP_SCOPES)[keyof typeof MCP_SCOPES];
export const ALL_MCP_SCOPES: readonly McpScope[] = [MCP_SCOPES.read, MCP_SCOPES.draft, MCP_SCOPES.file];

export const SCOPE_DESCRIPTIONS: Record<McpScope, string> = {
  'c2c:read':
    'Read projects, submissions, sequences, vault document listings and run deterministic ' +
    'readiness, validation and reference lookups in your organisation.',
  'c2c:draft': 'Produce DRAFT text (cover letters, agency-response narratives) for you to review in the app.',
  'c2c:file':
    'File a DRAFT leaf into an eCTD sequence for review. Never signs, freezes or transmits — ' +
    'those stay in the app behind Part 11 sign-off.',
};

export interface McpConfig {
  enabled: boolean;
  /** Origin only, no path, no trailing slash. */
  publicUrl: URL;
  /** publicUrl + /mcp — the protected resource identifier. */
  resourceUrl: URL;
  /** Human documentation for the connector. */
  docsUrl: URL;
  /** Where the sign-off surface lives for deep links. */
  appBaseUrl: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  authorizationCodeTtlSeconds: number;
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

export function resolveMcpConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const port = env.PORT || '5000';
  const origin = stripTrailingSlash(env.MCP_PUBLIC_URL || env.APP_URL || `http://localhost:${port}`);
  const publicUrl = new URL(origin);
  if (publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash) {
    throw new Error(`MCP_PUBLIC_URL must be an origin with no path, query or fragment (got ${origin}).`);
  }
  return {
    enabled: String(env.MCP_ENABLED ?? '').toLowerCase() === 'true',
    publicUrl,
    resourceUrl: new URL(MCP_PATH, publicUrl),
    docsUrl: new URL('/concept2cure/connector', publicUrl),
    appBaseUrl: origin,
    accessTokenTtlSeconds: Number(env.MCP_ACCESS_TOKEN_TTL_SECONDS || 3600),
    refreshTokenTtlSeconds: Number(env.MCP_REFRESH_TOKEN_TTL_SECONDS || 30 * 24 * 3600),
    authorizationCodeTtlSeconds: 600,
  };
}
