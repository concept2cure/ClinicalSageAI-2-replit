/**
 * Concept2Cure connector for Claude — remote MCP server over Streamable HTTP.
 *
 * Mounted at the application root (the OAuth metadata and endpoints must live
 * at well-known root paths) by server/index.ts when MCP_ENABLED=true:
 *
 *   /.well-known/oauth-protected-resource/mcp   RFC 9728 (resource metadata)
 *   /.well-known/oauth-authorization-server     RFC 8414
 *   /authorize  /token  /register  /revoke      OAuth 2.1 + PKCE S256, RFC 7591
 *   /oauth/consent                              login-through-platform + consent
 *   /mcp                                        the MCP endpoint (Bearer only)
 *
 * The mount sits AHEAD of the app's core middleware stack on purpose: that
 * stack's CSRF guard (production only) refuses a state-changing request that
 * carries neither Origin nor a Bearer token, and /token and /register are
 * exactly that — server-to-server calls from the MCP client. So this router
 * carries its own body parsing, CORS (SDK handlers for token/register; /mcp
 * below), security headers and rate limits. The /api default-deny auth
 * boundary is not bypassed — nothing here is under /api — and the MCP
 * endpoint requires a Bearer token verified by the platform's own verifier.
 */

import express, { type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  resolveMcpConfig,
  MCP_PATH,
  ALL_MCP_SCOPES,
  MCP_CLIENT_REDIRECT_ALLOWLIST_ENV,
  type McpConfig,
  type McpClientRegistrationPolicy,
} from './config';
import { ConceptToCureOAuthProvider } from './auth/provider';
import { consentHandler } from './auth/consent';
import { buildMcpServer } from './server';
import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('mcp');

function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  next();
}

// ── Dynamic client registration guard (IAM-02 / P0-2 (d)) ───────────────────
//
// The SDK's registration handler accepts any parseable URL as a redirect URI
// and stores the client; the consent page then names that client to the user.
// This guard runs first and decides on the redirect URIs alone — the SDK's
// schema validation and the store are untouched behind it. It reads the body
// and never logs it.

/** RFC 7591 §3.2.2 registration error body. */
export interface ClientRegistrationRefusal {
  error: 'invalid_redirect_uri' | 'invalid_client_metadata';
  error_description: string;
}

/** Hosts admitted over plain http when the policy does not require https (development/test only). */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Why one redirect URI is refused, or null. Names the entry by index, never by value. */
function redirectUriRefusal(entry: unknown, i: number, policy: McpClientRegistrationPolicy): ClientRegistrationRefusal | null {
  const refuse = (why: string): ClientRegistrationRefusal => ({
    error: 'invalid_redirect_uri',
    error_description: `redirect_uris[${i}] ${why}.`,
  });
  if (typeof entry !== 'string') return refuse('must be a string');
  let url: URL;
  try {
    url = new URL(entry);
  } catch {
    return refuse('must be an absolute URL');
  }
  if (url.hash || entry.includes('#')) return refuse('must not contain a fragment');
  const isHttps = url.protocol === 'https:';
  const isLoopbackHttp = url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
  if (!isHttps && !(isLoopbackHttp && !policy.requireHttpsRedirects)) {
    return refuse(policy.requireHttpsRedirects ? 'must use https' : 'must use https, or http on a loopback host');
  }
  if (policy.redirectOriginAllowlist && !policy.redirectOriginAllowlist.includes(url.origin.toLowerCase())) {
    return refuse(`has an origin this server does not accept registrations for (${MCP_CLIENT_REDIRECT_ALLOWLIST_ENV})`);
  }
  return null;
}

/**
 * Pure decision: null when the registration may fall through to the SDK
 * handler, otherwise the refusal to answer with. Nothing the caller sent is
 * echoed or logged.
 */
export function checkClientRegistration(body: unknown, policy: McpClientRegistrationPolicy): ClientRegistrationRefusal | null {
  const metadata: ClientRegistrationRefusal = {
    error: 'invalid_client_metadata',
    error_description: 'Registration metadata must be a JSON object with a non-empty redirect_uris array.',
  };
  if (!body || typeof body !== 'object' || Array.isArray(body)) return metadata;
  const uris = (body as Record<string, unknown>).redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0) return metadata;
  for (let i = 0; i < uris.length; i++) {
    const refusal = redirectUriRefusal(uris[i], i, policy);
    if (refusal) return refusal;
  }
  return null;
}

/** Express form of the decision: next() to reach the SDK handler, else 400 with the RFC 7591 body. */
export function clientRegistrationGuard(config: McpConfig): RequestHandler {
  const policy = config.clientRegistration;
  // Named differently from this factory on purpose: a nested function that
  // shadows its enclosing binding is renamed by the bundler, and the layer name
  // is what the router-order test reads.
  return function mcpClientRegistrationGuard(req: Request, res: Response, next: NextFunction): void {
    const refusal = checkClientRegistration(req.body, policy);
    if (refusal === null) {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(400).json(refusal);
  };
}

/**
 * A body the JSON parser refused (not JSON, not an object or array at the top
 * level, over the size limit, unsupported charset) is invalid client metadata,
 * answered in the RFC 7591 shape rather than by Express's final handler, whose
 * development-mode page prints the error's stack. Anything else passes on.
 */
export function clientRegistrationBodyError(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  const e = err as { type?: unknown; status?: unknown } | null;
  const parserError =
    !!e && typeof e === 'object' && typeof e.type === 'string' && typeof e.status === 'number' && e.status >= 400 && e.status < 500;
  if (!parserError || res.headersSent) {
    next(err);
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(e.status as number).json({
    error: 'invalid_client_metadata',
    error_description: 'Registration metadata must be a JSON object of at most 16 KB with a non-empty redirect_uris array.',
  } satisfies ClientRegistrationRefusal);
}

/** The MCP endpoint: stateless, one server + transport per request. */
function mcpEndpoint(config: McpConfig): RequestHandler {
  return async (req: Request, res: Response) => {
    if (req.method === 'GET' || req.method === 'DELETE') {
      // Stateless server: no standalone SSE stream and no session to delete.
      res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed. POST JSON-RPC to this endpoint.' }, id: null });
      return;
    }
    const server = buildMcpServer(config);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      log.error('MCP request failed', { error: err instanceof Error ? err.message : String(err) });
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
      }
    }
  };
}

export function createMcpRouter(config: McpConfig = resolveMcpConfig()): express.Router {
  const router = express.Router();
  const provider = new ConceptToCureOAuthProvider(config);
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(config.resourceUrl);

  router.use(securityHeaders);

  // RFC 7591 registration is bound to the operator allowlist BEFORE the SDK
  // handler sees it (IAM-02 / P0-2 (d)). The limiter sits outside the guard so
  // refused attempts count too; the SDK applies its own 20/h behind it, which
  // only admitted registrations reach. A body over 16 KB is refused by the
  // parser. Express matches this route case-insensitively and with a trailing
  // slash, the same spellings the SDK's `use('/register')` mount answers, so
  // no spelling reaches the SDK handler around the guard (pinned by test).
  router.post(
    '/register',
    rateLimit({ windowMs: 60 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false }),
    express.json({ limit: '16kb' }),
    clientRegistrationGuard(config),
    clientRegistrationBodyError,
  );
  if (config.clientRegistration.openInProduction) {
    // Once, here — never per request, and nothing about the state is exposed
    // on the wire. Whether production ships an allowlist is the founder's.
    log.warn(
      `Dynamic client registration (POST /register) is open in production: any https origin may register an OAuth client. ` +
        `Set ${MCP_CLIENT_REDIRECT_ALLOWLIST_ENV} to the origins allowed to register (e.g. https://claude.ai,https://claude.com) to bind it.`,
      { control: MCP_CLIENT_REDIRECT_ALLOWLIST_ENV, finding: 'IAM-02', plan: 'P0-2d' },
    );
  }

  // OAuth 2.1 authorization server + RFC 8414/9728 metadata. The SDK router
  // owns /authorize, /token, /register, /revoke and /.well-known/*.
  router.use(
    mcpAuthRouter({
      provider,
      issuerUrl: config.publicUrl,
      baseUrl: config.publicUrl,
      resourceServerUrl: config.resourceUrl,
      serviceDocumentationUrl: config.docsUrl,
      scopesSupported: [...ALL_MCP_SCOPES],
      resourceName: 'Concept2Cure',
      clientRegistrationOptions: { clientSecretExpirySeconds: 0 },
    }),
  );

  // Consent: form POST from the page /authorize rendered (same origin).
  router.post(
    '/oauth/consent',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false }),
    express.urlencoded({ extended: false, limit: '64kb' }),
    consentHandler(config),
  );

  // The MCP endpoint.
  router.use(
    MCP_PATH,
    cors({ origin: true, exposedHeaders: ['Mcp-Session-Id', 'WWW-Authenticate'], allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id', 'Mcp-Protocol-Version', 'Accept'] }),
    rateLimit({ windowMs: 60 * 1000, max: 240, standardHeaders: true, legacyHeaders: false }),
    express.json({ limit: '4mb' }),
    requireBearerAuth({ verifier: provider, resourceMetadataUrl }),
    mcpEndpoint(config),
  );

  log.info('Concept2Cure MCP connector mounted', {
    resource: config.resourceUrl.href,
    issuer: config.publicUrl.href,
    resourceMetadataUrl,
  });
  return router;
}

export { resolveMcpConfig } from './config';
