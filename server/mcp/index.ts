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
import { resolveMcpConfig, MCP_PATH, ALL_MCP_SCOPES, type McpConfig } from './config';
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
