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

/**
 * Policy for RFC 7591 dynamic client registration (POST /register).
 *
 * 2026-09-24 (D6 audit IAM-02, plan P0-2 (d)): registration used to be open —
 * any caller could register a client with any redirect_uris and the consent
 * page then showed it to the user. Closing the route outright would break the
 * connector's onboarding, so registration is bound to an operator allowlist
 * instead, and the open state is made explicit.
 */
export interface McpClientRegistrationPolicy {
  /**
   * Origins (scheme://host[:port], lower-case) a registered redirect URI may
   * belong to, from MCP_CLIENT_REDIRECT_ALLOWLIST. `null` when the variable is
   * unset or blank: registration is then open to any origin that passes the
   * scheme and fragment rules.
   */
  redirectOriginAllowlist: string[] | null;
  /**
   * Every redirect URI must be https. False only for NODE_ENV development or
   * test, where http://localhost, http://127.0.0.1 and http://[::1] are also
   * admitted (local OAuth clients such as the MCP inspector).
   */
  requireHttpsRedirects: boolean;
  /**
   * True when NODE_ENV is production and no allowlist is set. The router logs
   * one warning naming the control when this is true; nothing else changes.
   */
  openInProduction: boolean;
}

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
  clientRegistration: McpClientRegistrationPolicy;
}

export const MCP_CLIENT_REDIRECT_ALLOWLIST_ENV = 'MCP_CLIENT_REDIRECT_ALLOWLIST';

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

/**
 * Parse MCP_CLIENT_REDIRECT_ALLOWLIST: comma-separated origins, trimmed and
 * lower-cased, each an http(s) URL with no path, query or fragment (a lone
 * trailing slash is tolerated and dropped). Unset or blank → null. Anything
 * else — a path, a missing scheme, a non-web scheme, an empty entry between
 * two others — throws, so a typo can never resolve to an open or partial list.
 */
export function parseRedirectOriginAllowlist(raw: string | undefined): string[] | null {
  if (raw === undefined || raw.trim() === '') return null;
  const origins: string[] = [];
  for (const piece of raw.split(',')) {
    const entry = piece.trim().toLowerCase();
    const fail = (why: string): never => {
      throw new Error(`${MCP_CLIENT_REDIRECT_ALLOWLIST_ENV} entry "${piece.trim()}" ${why}.`);
    };
    if (entry === '') fail('is empty');
    if (!/^https?:\/\//.test(entry)) fail('must be an http(s) origin such as https://claude.ai');
    let url: URL;
    try {
      url = new URL(entry);
    } catch {
      return fail('is not a valid URL');
    }
    if (url.pathname !== '/' || url.search || url.hash || entry.includes('?') || entry.includes('#')) {
      fail('must be an origin with no path, query or fragment');
    }
    if (url.username || url.password) fail('must not carry credentials');
    if (!origins.includes(url.origin)) origins.push(url.origin);
  }
  return origins;
}

export function resolveMcpConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const port = env.PORT || '5000';
  const origin = stripTrailingSlash(env.MCP_PUBLIC_URL || env.APP_URL || `http://localhost:${port}`);
  const publicUrl = new URL(origin);
  if (publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash) {
    throw new Error(`MCP_PUBLIC_URL must be an origin with no path, query or fragment (got ${origin}).`);
  }
  const nodeEnv = String(env.NODE_ENV ?? '').toLowerCase();
  const redirectOriginAllowlist = parseRedirectOriginAllowlist(env[MCP_CLIENT_REDIRECT_ALLOWLIST_ENV]);
  return {
    enabled: String(env.MCP_ENABLED ?? '').toLowerCase() === 'true',
    publicUrl,
    resourceUrl: new URL(MCP_PATH, publicUrl),
    docsUrl: new URL('/concept2cure/connector', publicUrl),
    appBaseUrl: origin,
    accessTokenTtlSeconds: Number(env.MCP_ACCESS_TOKEN_TTL_SECONDS || 3600),
    refreshTokenTtlSeconds: Number(env.MCP_REFRESH_TOKEN_TTL_SECONDS || 30 * 24 * 3600),
    authorizationCodeTtlSeconds: 600,
    clientRegistration: {
      redirectOriginAllowlist,
      requireHttpsRedirects: !(nodeEnv === 'development' || nodeEnv === 'test'),
      openInProduction: nodeEnv === 'production' && redirectOriginAllowlist === null,
    },
  };
}
