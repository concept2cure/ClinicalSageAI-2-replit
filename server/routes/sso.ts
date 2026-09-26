import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

import { config } from '../config/environment';
import { db } from '../db';
import { and, eq } from 'drizzle-orm';
import { users, organizationUsers, organizations } from '../../shared/schema';
import { createScopedLogger } from '../utils/logger';
import { verifyJwtWithRotation } from '../utils/jwtVerify';
import {
  getSamlProvider,
  SAMLValidationError,
  type SAMLConfig,
  type SAMLUser,
} from '../services/saml-provider';
import { runWithTenantScope } from '../db/tenantStore';
import { isDevAuthAllowed } from '../auth/dev-auth-policy';
import { recordAuthEvent } from '../services/audit/auth-event-audit';
import { newSessionClaims } from '../services/session-inactivity';
import { ACCOUNT_INACTIVE_MESSAGE, isActiveAccountStatus } from '../services/account-standing';

const logger = createScopedLogger('sso');
const router = Router();
// SSO resolves the tenant from a signed SAML response before a JWT tenant scope
// exists. Use the explicit system identity only for this pre-tenant router;
// individual callbacks still validate the IdP signature and organization.
router.use((req, _res, next) =>
  runWithTenantScope(
    {
      tenantId: '0',
      role: 'app_super_admin',
      source: 'request',
      caller: `sso-pretenant:${req.path}`,
    },
    next
  )
);
/**
 * Dev-only SSO stub gate.
 *
 * This was `process.env.NODE_ENV === 'development'` — ONE environment variable
 * standing between an unauthenticated request and a genuine, production-signed
 * JWT. The `/:provider/callback` handler below mints a 24-hour token for
 * userId 1 / organizationId 2 WITHOUT verifying the `code` at all, so any
 * deployment where NODE_ENV is not explicitly 'production' — a preview box, a
 * Replit container, a staging service whose env drifted — turned
 * `GET /api/auth/sso/anything/callback` into a credential-minting endpoint
 * requiring no credentials.
 *
 * That single-factor form is exactly what server/auth/dev-auth-policy.ts exists
 * to forbid: dev-auth shortcuts require BOTH NODE_ENV=development AND an
 * explicit ALLOW_DEV_AUTH=1, "so staging, beta, e2e, and production ... cannot
 * enable these paths by accident". The policy's own header says any new
 * dev-auth shortcut MUST gate behind isDevAuthAllowed().
 *
 * It slipped the CI guard because check-no-dev-auth-in-prod.mjs matched only
 * the NEGATIVE spelling (`NODE_ENV !== 'production'`); this file used the
 * positive one and read as clean. The guard now matches both — see that file.
 *
 * Consulted PER REQUEST rather than captured once at module load: a constant
 * frozen at import time cannot be exercised by a test that sets the env after
 * importing the router, and it silently ignores any later change to the
 * process environment. The policy is cheap to evaluate.
 *
 * @compliance 21 CFR Part 11 §11.10(d) — limit system access to authorized individuals
 */

// ═══════════════════════════════════════════════════════════════════════════════
// SAML CONFIG STORE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * In-memory SAML config store keyed by organization slug/identifier.
 * In production, this would be loaded from the database (enterprise_integrations table).
 * For now, configs can be registered via environment variables or API.
 */
const samlConfigs: Map<string, SAMLConfig> = new Map();

/**
 * The org slug the single-org env configuration (SAML_IDP_*) is registered
 * under. That configuration belongs to ONE organisation, `organizations.slug =
 * 'default'`, and serves no other slug. Until 2026-09-25 it was the fallback
 * for every slug absent from SAML_TENANTS, so a user of the default IdP could
 * name any organisation in `?org=` / RelayState and be provisioned into it
 * (audit IAM-03).
 */
const DEFAULT_SAML_ORG_SLUG = 'default';

/**
 * RelayState carries the org slug (and optional same-origin return path) through
 * the IdP round-trip. It is UNTRUSTED on return — it only selects which org's IdP
 * certificate validates the response. A forged response cannot validate against
 * any org's trust anchor, so RelayState cannot be used to forge a login.
 * InResponseTo/replay validation is handled inside node-saml (see saml-provider).
 */
function encodeRelayState(state: { org: string; returnTo?: string }): string {
  return Buffer.from(JSON.stringify(state), 'utf-8').toString('base64url');
}

/**
 * The sign-in page's SSO hand-off. The session travels in the URL fragment,
 * which the browser never sends to a server and no access log, proxy or
 * referrer records; the page reads it once and drops it from the address bar
 * (security audit 2026-09-24, IAM-18 item 6). A query string was the carrier
 * before, and no page read it.
 */
function loginHandoffUrl(token: string, extra: { provider: string; returnTo?: string }): string {
  const params = new URLSearchParams({ sso: token, provider: extra.provider });
  if (extra.returnTo) params.set('returnTo', extra.returnTo);
  return `/concept2cure/login#${params.toString()}`;
}

function decodeRelayState(relayState: unknown): { org: string; returnTo?: string } {
  if (typeof relayState !== 'string' || relayState.length === 0) {
    return { org: DEFAULT_SAML_ORG_SLUG };
  }
  try {
    const parsed = JSON.parse(Buffer.from(relayState, 'base64url').toString('utf-8'));
    return {
      org: typeof parsed?.org === 'string' ? parsed.org : DEFAULT_SAML_ORG_SLUG,
      returnTo: typeof parsed?.returnTo === 'string' ? parsed.returnTo : undefined,
    };
  } catch {
    return { org: DEFAULT_SAML_ORG_SLUG };
  }
}

/**
 * Raised when the org that owns the SAML config (identified by the callback's
 * orgSlug) cannot be mapped to a real organization row. We fail closed rather
 * than silently provisioning the user into a hardcoded default org (org 1),
 * which would cross tenant boundaries.
 */
class SamlOrgResolutionError extends Error {
  constructor(orgSlug: string) {
    super(`No organization found for SAML org slug "${orgSlug}"`);
    this.name = 'SamlOrgResolutionError';
  }
}

/**
 * Raised when the account the assertion names exists but holds no membership
 * in the organisation that owns the matched IdP configuration. A signed
 * assertion from org A's IdP is proof of identity in org A only: it does not
 * attach the account to A, and it never signs the account in to some other
 * organisation it happens to belong to. The ids ride on the error for the audit
 * row, never in the message.
 */
class SamlUserNotInOrganisationError extends Error {
  constructor(
    readonly userId: number,
    readonly email: string,
    readonly organizationId: number
  ) {
    super('The account is not a member of the organisation that owns this SSO configuration');
    this.name = 'SamlUserNotInOrganisationError';
  }
}

/** Raised when the account the assertion names is not active (VSR-001 F-29). */
class SamlAccountInactiveError extends Error {
  constructor(
    readonly userId: number,
    readonly email: string
  ) {
    super(ACCOUNT_INACTIVE_MESSAGE);
    this.name = 'SamlAccountInactiveError';
  }
}

/**
 * Resolve the org slug used for the SAML callback (from RelayState / SAML_TENANTS)
 * to the owning organization's numeric id. The slug maps 1:1 to
 * `organizations.slug`. Throws {@link SamlOrgResolutionError} when no matching
 * organization exists so JIT provisioning never falls back to a hardcoded org.
 */
async function resolveOrgIdForSlug(orgSlug: string): Promise<number> {
  const rows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, orgSlug))
    .limit(1);
  if (rows.length === 0) {
    throw new SamlOrgResolutionError(orgSlug);
  }
  return rows[0].id;
}

/**
 * Retrieve the SAML config for an organization slug: its SAML_TENANTS entry, or,
 * for the slug `default` ONLY, the single-org env configuration (SAML_IDP_*).
 * Any other slug without an entry is not configured for SSO and gets null,
 * which the routes answer with 404. The env configuration is never used as a
 * stand-in for another organisation's IdP.
 */
function getSamlConfig(orgSlug: string): SAMLConfig | null {
  // Check in-memory store first
  const stored = samlConfigs.get(orgSlug);
  if (stored) return stored;

  // The env configuration belongs to the default org and to no other slug.
  if (orgSlug !== DEFAULT_SAML_ORG_SLUG) return null;

  const idpSsoUrl = process.env.SAML_IDP_SSO_URL;
  const idpEntityId = process.env.SAML_IDP_ENTITY_ID;
  const idpCertificate = process.env.SAML_IDP_CERTIFICATE;
  const spEntityId = process.env.SAML_SP_ENTITY_ID;

  if (idpSsoUrl && idpEntityId && idpCertificate) {
    const baseUrl = process.env.APP_BASE_URL || 'https://app.concept2cure.ai';
    return {
      entityId: spEntityId || `${baseUrl}/saml/metadata`,
      assertionConsumerServiceUrl: `${baseUrl}/api/auth/sso/saml/callback`,
      idpSsoUrl,
      idpEntityId,
      idpCertificate,
      signRequests: process.env.SAML_SIGN_REQUESTS === 'true',
      spPrivateKey: process.env.SAML_SP_PRIVATE_KEY,
      spCertificate: process.env.SAML_SP_CERTIFICATE,
      nameIdFormat: process.env.SAML_NAME_ID_FORMAT,
      idpSloUrl: process.env.SAML_IDP_SLO_URL,
    };
  }

  return null;
}

/**
 * Populate the per-org SAML config store from the SAML_TENANTS env var, so one
 * deployment can serve several client orgs' IdPs. SAML_TENANTS is a JSON object
 * keyed by org slug: `{ "<slug>": { "idpSsoUrl", "idpEntityId", "idpCertificate",
 * ...optional entityId/assertionConsumerServiceUrl/signRequests/sp keys } }`.
 * The single-org env vars (SAML_IDP_*) serve the slug `default` only (see
 * getSamlConfig); they are not a fallback for slugs missing from this map.
 */
function loadSamlTenants(): void {
  const raw = process.env.SAML_TENANTS;
  if (!raw) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    logger.warn('SAML_TENANTS is not valid JSON — ignoring');
    return;
  }
  if (!parsed || typeof parsed !== 'object') return;

  const baseUrl = process.env.APP_BASE_URL || 'https://app.concept2cure.ai';
  for (const [slug, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const cfg = value as Record<string, unknown>;
    const idpSsoUrl = cfg.idpSsoUrl;
    const idpEntityId = cfg.idpEntityId;
    const idpCertificate = cfg.idpCertificate;
    if (
      typeof idpSsoUrl !== 'string' ||
      typeof idpEntityId !== 'string' ||
      typeof idpCertificate !== 'string'
    ) {
      continue;
    }
    samlConfigs.set(slug, {
      entityId:
        typeof cfg.entityId === 'string' ? cfg.entityId : `${baseUrl}/saml/${slug}/metadata`,
      assertionConsumerServiceUrl:
        typeof cfg.assertionConsumerServiceUrl === 'string'
          ? cfg.assertionConsumerServiceUrl
          : `${baseUrl}/api/auth/sso/saml/callback`,
      idpSsoUrl,
      idpEntityId,
      idpCertificate,
      signRequests: cfg.signRequests === true,
      spPrivateKey: typeof cfg.spPrivateKey === 'string' ? cfg.spPrivateKey : undefined,
      spCertificate: typeof cfg.spCertificate === 'string' ? cfg.spCertificate : undefined,
      nameIdFormat: typeof cfg.nameIdFormat === 'string' ? cfg.nameIdFormat : undefined,
      idpSloUrl: typeof cfg.idpSloUrl === 'string' ? cfg.idpSloUrl : undefined,
    });
  }
  logger.info(`Loaded ${samlConfigs.size} SAML tenant config(s) from SAML_TENANTS`);
}

loadSamlTenants();

// ═══════════════════════════════════════════════════════════════════════════════
// SAML 2.0 ROUTES (registered BEFORE generic :provider routes to avoid capture)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/auth/sso/saml/initiate
 *
 * SP-Initiated SAML SSO flow. Builds an AuthnRequest and redirects the user
 * to the IdP's SSO URL.
 *
 * Query params:
 *   - org: organization slug (required in multi-tenant mode)
 */
router.get('/saml/initiate', async (req: Request, res: Response) => {
  try {
    const orgSlug = (req.query.org as string) || DEFAULT_SAML_ORG_SLUG;
    const samlConfig = getSamlConfig(orgSlug);

    if (!samlConfig) {
      logger.warn(`SAML config not found for org="${orgSlug}"`);
      return res.status(404).json({
        success: false,
        error: 'SAML_NOT_CONFIGURED',
        message: 'SAML SSO is not configured for this organization.',
      });
    }

    // Only honor a same-origin return path (prevents open-redirect / token leak).
    const returnTo = sanitizeReturnTo(req.query.returnTo);
    const relayState = encodeRelayState({ org: orgSlug, returnTo });

    const provider = getSamlProvider(orgSlug, samlConfig);
    const redirectUrl = await provider.getAuthorizeUrl(relayState);

    logger.info(`SAML SSO initiated for org="${orgSlug}"`);

    return res.redirect(302, redirectUrl);
  } catch (err) {
    logger.error('Failed to initiate SAML SSO', err as Record<string, unknown>);
    return res.status(500).json({
      success: false,
      error: 'SAML_INITIATE_FAILED',
      message: 'Failed to initiate SAML SSO. Please contact your administrator.',
    });
  }
});

/**
 * Accept only a strictly internal, same-origin path as a post-login return
 * target. The 24h access JWT is placed in this redirect URL, so anything that a
 * browser could resolve to a foreign origin exfiltrates the token.
 *
 * Rejections (return undefined; callers already treat that as "no return path"):
 *   - non-strings / empty
 *   - any ASCII control char (tab, newline, …) or backslash — a browser
 *     resolves "/\evil.com" (or "/\t/evil.com") as "//evil.com" →
 *     https://evil.com, defeating a naive startsWith("/") check
 *   - protocol-relative "//host" and absolute "scheme://host" URLs
 *   - anything that, parsed against a fixed origin, does not stay on that
 *     origin (path-only, same-origin) — the definitive host/scheme check
 */
export function sanitizeReturnTo(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  // Reject ASCII control chars (incl. tab/newline) and backslashes outright.
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c < 0x20 || c === 0x7f || c === 0x5c /* backslash */) return undefined;
  }
  // Must be a single-slash root-relative path (reject protocol-relative "//").
  if (!value.startsWith('/') || value.startsWith('//')) return undefined;
  // Definitive check: parsed against a fixed origin, the result must remain on
  // that same origin — no host or scheme may have been smuggled in. Return the
  // value RECONSTRUCTED from the parsed URL's path + query rather than the raw
  // input: the redirect target is then derived solely from URL-object
  // properties (never the remote string directly), which both strips any
  // fragment/userinfo residue and removes the raw-tainted-input → redirect data
  // flow. A path-only same-origin string round-trips unchanged.
  try {
    const base = 'http://localhost';
    const parsed = new URL(value, base);
    if (parsed.origin !== base) return undefined;
    const rebuilt = `${parsed.pathname}${parsed.search}`;
    // After reconstruction it must still be a single-slash root-relative path.
    if (!rebuilt.startsWith('/') || rebuilt.startsWith('//')) return undefined;
    return rebuilt;
  } catch {
    return undefined;
  }
}

/**
 * POST /api/auth/sso/saml/callback
 *
 * SAML Assertion Consumer Service (ACS). Receives the SAML Response from the IdP,
 * parses and validates the assertion, creates or finds the user, and issues a JWT.
 *
 * Body (application/x-www-form-urlencoded):
 *   - SAMLResponse: base64-encoded SAML Response XML
 *   - RelayState: (optional) original URL to redirect back to
 */
router.post('/saml/callback', async (req: Request, res: Response) => {
  // Every sign-in attempt, admitted or refused, is an auth event in the
  // tenant it concerns (21 CFR Part 11 §11.10(e)), as the password path's are.
  // What is known when a refusal is raised is kept here for the catch below.
  const requestContext = { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
  let configOrgId: number | undefined;
  try {
    const samlResponseB64 = req.body?.SAMLResponse;
    const relayState = req.body?.RelayState;

    if (!samlResponseB64) {
      logger.warn('SAML callback received without SAMLResponse');
      return res.status(400).json({
        success: false,
        error: 'MISSING_SAML_RESPONSE',
        message: 'No SAMLResponse found in the callback.',
      });
    }

    // The org is selected from (untrusted) RelayState. This only picks which
    // org's IdP certificate validates the response; a forged response cannot
    // validate against any org's trust anchor, so this cannot forge a login.
    const { org: orgSlug, returnTo } = decodeRelayState(relayState);

    const samlConfig = getSamlConfig(orgSlug);
    if (!samlConfig) {
      logger.warn(`SAML config not found for org="${orgSlug}" during callback`);
      return res.status(404).json({
        success: false,
        error: 'SAML_NOT_CONFIGURED',
        message: 'SAML SSO is not configured for this organization.',
      });
    }

    // Resolve the organisation that owns this configuration BEFORE the response
    // is validated, so a refused response is recorded in that tenant's audit
    // trail too. The user signs in to THIS organisation and no other (see
    // findOrCreateSamlUser). Fails closed when the slug names no organisation
    // (SamlOrgResolutionError → 403 below).
    configOrgId = await resolveOrgIdForSlug(orgSlug);

    // FAIL CLOSED: real XML-DSig verification (signed assertion required),
    // audience + InResponseTo enforced. Throws SAMLValidationError on any
    // missing/invalid signature or forged/expired assertion — there is no
    // "proceed with caution" path.
    const provider = getSamlProvider(orgSlug, samlConfig);
    const samlUser = await provider.validateResponse({
      SAMLResponse: samlResponseB64,
      ...(typeof relayState === 'string' ? { RelayState: relayState } : {}),
    });

    if (!samlUser.email) {
      logger.error('SAML assertion did not contain an email address');
      await recordAuthEvent({
        action: 'user_login',
        tenantId: configOrgId,
        outcome: 'failure',
        reason: 'saml_no_email',
        ...requestContext,
      });
      return res.status(400).json({
        success: false,
        error: 'SAML_NO_EMAIL',
        message: 'The SAML assertion did not contain a valid email address.',
      });
    }

    // Find the account, or provision one, in the config's organisation. Throws
    // SamlUserNotInOrganisationError / SamlAccountInactiveError (handled below).
    const { user: dbUser, organizationId } = await findOrCreateSamlUser(samlUser, configOrgId);

    // Issue JWT
    // SECURITY: JWT must include organizationId so downstream tenant middleware
    // derives the org context from the token, not from user-supplied headers.
    const token = jwt.sign(
      {
        userId: String(dbUser.id),
        email: dbUser.email,
        organizationId: String(organizationId),
        role: dbUser.orgRole || 'member',
        provider: 'saml',
        sessionIndex: samlUser.sessionIndex,
        type: 'access',
        // The session's id, start and idle window (P1-1; the default window,
        // the organisation's setting is not read on this path).
        ...newSessionClaims(),
      },
      config.jwt.secret,
      { expiresIn: '24h' }
    );

    await recordAuthEvent({
      action: 'user_login',
      userId: dbUser.id,
      tenantId: organizationId,
      email: dbUser.email,
      outcome: 'success',
      reason: 'saml_sso',
      ...requestContext,
    });

    logger.info(`SAML SSO login successful for user=${dbUser.email}, org=${organizationId}`);

    // Hand the session to the sign-in page in the URL fragment, with the
    // SAME-ORIGIN return path when one was requested. RelayState round-trips
    // through the IdP unauthenticated, so the return path is re-validated here
    // as same-origin; an attacker-supplied absolute URL is rejected (would
    // otherwise send the person, and the token, cross-origin).
    const safeReturnTo = sanitizeReturnTo(returnTo);
    if (safeReturnTo) {
      return res.redirect(302, loginHandoffUrl(token, { provider: 'saml', returnTo: safeReturnTo }));
    }

    // Otherwise return JSON response
    return res.json({
      success: true,
      provider: 'saml',
      accessToken: token,
      user: {
        id: String(dbUser.id),
        email: dbUser.email,
        name: dbUser.name,
        firstName: samlUser.firstName,
        lastName: samlUser.lastName,
        organizationId: String(organizationId),
        roles: [dbUser.orgRole || 'member'],
      },
    });
  } catch (err) {
    if (err instanceof SAMLValidationError) {
      logger.warn(`SAML validation failed: ${err.message}`);
      await recordAuthEvent({
        action: 'user_login',
        tenantId: configOrgId,
        outcome: 'failure',
        reason: 'saml_validation_failed',
        ...requestContext,
      });
      return res.status(401).json({
        success: false,
        error: 'SAML_VALIDATION_FAILED',
        message: err.message,
      });
    }

    if (err instanceof SamlOrgResolutionError) {
      // Fail closed: do not provision into a default org we can't verify.
      logger.error(`SAML org resolution failed: ${err.message}`);
      await recordAuthEvent({
        action: 'user_login',
        outcome: 'failure',
        reason: 'saml_org_not_resolved',
        ...requestContext,
      });
      return res.status(403).json({
        success: false,
        error: 'SAML_ORG_NOT_RESOLVED',
        message:
          'Could not resolve the organization for this SAML login. Please contact your administrator.',
      });
    }

    if (err instanceof SamlUserNotInOrganisationError) {
      logger.warn(`SAML sign-in refused: user ${err.userId} is not a member of org ${err.organizationId}`);
      await recordAuthEvent({
        action: 'user_login',
        userId: err.userId,
        tenantId: err.organizationId,
        email: err.email,
        outcome: 'failure',
        reason: 'saml_user_not_in_organisation',
        ...requestContext,
      });
      return res.status(403).json({
        success: false,
        error: 'SSO_USER_NOT_IN_ORGANISATION',
        message:
          'This account is not a member of the organization that owns this SSO configuration. Please contact your administrator.',
      });
    }

    if (err instanceof SamlAccountInactiveError) {
      logger.warn(`SAML sign-in refused: account ${err.userId} is not active`);
      await recordAuthEvent({
        action: 'user_login',
        userId: err.userId,
        tenantId: configOrgId,
        email: err.email,
        outcome: 'failure',
        reason: 'account_inactive',
        ...requestContext,
      });
      return res.status(403).json({
        success: false,
        error: 'SSO_ACCOUNT_INACTIVE',
        message: ACCOUNT_INACTIVE_MESSAGE,
      });
    }

    logger.error('SAML callback error', err as Record<string, unknown>);
    return res.status(500).json({
      success: false,
      error: 'SAML_CALLBACK_FAILED',
      message: 'Failed to process SAML response. Please contact your administrator.',
    });
  }
});

/**
 * GET /api/auth/sso/saml/metadata
 *
 * Returns SP metadata XML for IdP federation setup.
 */
router.get('/saml/metadata', (req: Request, res: Response) => {
  try {
    const orgSlug = (req.query.org as string) || DEFAULT_SAML_ORG_SLUG;
    const samlConfig = getSamlConfig(orgSlug);

    if (!samlConfig) {
      return res.status(404).json({
        success: false,
        error: 'SAML_NOT_CONFIGURED',
        message: 'SAML SSO is not configured for this organization.',
      });
    }

    const metadata = getSamlProvider(orgSlug, samlConfig).metadata();
    res.set('Content-Type', 'application/xml');
    return res.send(metadata);
  } catch (err) {
    logger.error('Failed to generate SP metadata', err as Record<string, unknown>);
    return res.status(500).json({ success: false, error: 'METADATA_GENERATION_FAILED' });
  }
});

/**
 * GET|POST /api/auth/sso/saml/logout
 *
 * SP-initiated Single Logout (SLO). Verifies the caller's session JWT, builds a
 * SAML LogoutRequest for the user's IdP session (nameID + sessionIndex taken
 * from the VERIFIED token, not from request input), and redirects to the IdP's
 * SLO endpoint so the federated session is terminated. Falls back to the local
 * login page when SLO is not configured or the session is not federated.
 *
 * The session token is a bearer credential: it is read from the Authorization
 * header or, on a POST, the `token` form/body field. It is NOT read from the
 * query string, where it lands in access logs, proxies and the Referer sent to
 * the IdP page this route redirects to (audit IAM-03).
 *
 * Query: ?org=<slug> selects the IdP (default 'default'). The IdP validates the
 * LogoutRequest, so org selection cannot be abused to forge a logout elsewhere.
 */
async function handleSpInitiatedLogout(req: Request, res: Response): Promise<void | Response> {
  const loginUrl = '/concept2cure/login';
  try {
    const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '');
    const bodyToken =
      req.method === 'POST' && typeof req.body?.token === 'string' ? req.body.token : '';
    const token = bearer?.[1] || bodyToken;
    if (!token) return res.status(401).json({ success: false, error: 'AUTH_REQUIRED' });

    let claims: Record<string, unknown>;
    try {
      // Use the rotation-aware verifier (HS256-pinned, prev-secret fallback).
      claims = verifyJwtWithRotation<Record<string, unknown>>(token);
    } catch {
      return res.status(401).json({ success: false, error: 'INVALID_TOKEN' });
    }

    const sessionIndex = claims.sessionIndex;
    const email = claims.email;
    // Only federated (SAML) sessions have an IdP session to terminate.
    if (
      claims.provider !== 'saml' ||
      typeof sessionIndex !== 'string' ||
      typeof email !== 'string'
    ) {
      return res.redirect(302, loginUrl);
    }

    const orgSlug = (req.query.org as string) || DEFAULT_SAML_ORG_SLUG;
    const samlConfig = getSamlConfig(orgSlug);
    if (!samlConfig) return res.redirect(302, loginUrl);

    const provider = getSamlProvider(orgSlug, samlConfig);
    if (!provider.supportsLogout) return res.redirect(302, loginUrl);

    const logoutUrl = await provider.getLogoutUrl(
      { nameID: email, sessionIndex },
      encodeRelayState({ org: orgSlug })
    );
    return res.redirect(302, logoutUrl);
  } catch (err) {
    logger.error('SAML logout error', err as Record<string, unknown>);
    return res.redirect(302, loginUrl);
  }
}

router.get('/saml/logout', handleSpInitiatedLogout);
router.post('/saml/logout', handleSpInitiatedLogout);

/**
 * GET/POST /api/auth/sso/saml/logout/callback
 *
 * Lands the user back after IdP Single Logout. Before honoring the logout, the
 * inbound IdP LogoutResponse signature is validated against the org's IdP trust
 * anchor (same library/cert used for the ACS assertion path) and the flow FAILS
 * CLOSED on any missing/invalid signature — a forged LogoutResponse is rejected.
 *
 *   - GET  → HTTP-Redirect binding: detached query signature (SAMLResponse +
 *            optional RelayState + SigAlg), verified via validateRedirectAsync.
 *            A LogoutResponse with no `Signature` query param is rejected.
 *   - POST → HTTP-POST binding: XML-DSig-signed SAMLResponse, verified via
 *            validatePostResponseAsync.
 *
 * The org (and thus which IdP cert validates the response) is selected from the
 * RelayState that round-tripped through the IdP; as with the ACS path this is
 * untrusted and only picks the trust anchor — a forged response validates
 * against no org's certificate.
 */
async function handleLogoutCallback(req: Request, res: Response): Promise<void> {
  const loggedOutUrl = '/concept2cure/login?logged_out=1';
  try {
    const isPost = req.method === 'POST';
    // RelayState selects the org's IdP cert (untrusted; only picks trust anchor).
    const relayState = isPost ? req.body?.RelayState : req.query?.RelayState;
    const { org: orgSlug } = decodeRelayState(relayState);

    const samlConfig = getSamlConfig(orgSlug);
    if (!samlConfig) {
      // No config ⇒ no trust anchor to validate against. Fail closed.
      logger.warn(`SAML logout callback for unconfigured org="${orgSlug}" — rejecting`);
      res.status(401).json({ success: false, error: 'SAML_NOT_CONFIGURED' });
      return;
    }

    const provider = getSamlProvider(orgSlug, samlConfig);
    const container = (isPost ? req.body : req.query) as Record<string, unknown>;

    // FAIL CLOSED: reject the logout on any missing/invalid signature.
    await provider.validateLogoutResponse({
      binding: isPost ? 'post' : 'redirect',
      container: container ?? {},
      // node-saml verifies the redirect signature over the RAW query string.
      originalQuery: isPost ? undefined : extractRawQuery(req.originalUrl),
    });

    res.redirect(302, loggedOutUrl);
  } catch (err) {
    if (err instanceof SAMLValidationError) {
      logger.warn(`SAML LogoutResponse validation failed: ${err.message}`);
      res.status(401).json({ success: false, error: 'SAML_LOGOUT_VALIDATION_FAILED' });
      return;
    }
    logger.error('SAML logout callback error', err as Record<string, unknown>);
    res.status(401).json({ success: false, error: 'SAML_LOGOUT_FAILED' });
  }
}

/** Return the raw (undecoded) query string from a request URL, without the '?'. */
function extractRawQuery(originalUrl: string): string {
  const idx = originalUrl.indexOf('?');
  return idx >= 0 ? originalUrl.slice(idx + 1) : '';
}

router.get('/saml/logout/callback', handleLogoutCallback);
router.post('/saml/logout/callback', handleLogoutCallback);

// ═══════════════════════════════════════════════════════════════════════════════
// GENERIC SSO ROUTES (OAuth/generic provider flow)
// Must be registered AFTER /saml/* routes to avoid :provider capturing "saml"
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/auth/sso/:provider/initiate
router.get('/:provider/initiate', (req: Request, res: Response) => {
  const { provider } = req.params;

  // In dev mode, immediately redirect to our callback with a test code
  if (isDevAuthAllowed()) {
    const code = 'dev-sso-code';
    const callbackUrl = `/api/auth/sso/${provider}/callback?code=${encodeURIComponent(code)}`;
    return res.redirect(302, callbackUrl);
  }

  // Production: Google/Microsoft OAuth not yet integrated.
  // Client hides these buttons in production (import.meta.env.DEV check in ZenLogin).
  // When real OAuth is added, replace this with provider-specific redirect.
  res.status(501).json({ success: false, error: 'SSO_NOT_IMPLEMENTED', provider });
});

// GET /api/auth/sso/:provider/callback
router.get('/:provider/callback', (req: Request, res: Response) => {
  const { provider } = req.params;
  const { code } = req.query;

  // For dev mode, accept the mock code and return a token + user info
  if (isDevAuthAllowed()) {
    // SECURITY: JWT must include organizationId so downstream tenant middleware
    // derives the org context from the token, not from user-supplied headers.
    const token = jwt.sign(
      {
        userId: '1',
        email: 'sso-user@example.com',
        organizationId: '2',
        role: 'client_user',
        provider,
        type: 'access',
        ...newSessionClaims(),
      },
      config.jwt.secret,
      { expiresIn: '24h' }
    );

    // The sign-in page adopts the session from the fragment and reads the
    // account from GET /session; nothing about the person travels in the URL.
    return res.redirect(302, loginHandoffUrl(token, { provider: String(provider) }));
  }

  res.status(501).json({ success: false, error: 'SSO_NOT_IMPLEMENTED' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// USER PROVISIONING
// ═══════════════════════════════════════════════════════════════════════════════

interface DbUserResult {
  user: {
    id: number;
    email: string;
    name: string;
    orgRole: string;
  };
  organizationId: number;
}

/**
 * Finds the account an assertion names, or creates one (Just-In-Time
 * provisioning), IN the organisation that owns the SAML config used for this
 * callback (`configOrgId`, resolved from the orgSlug; the caller fails closed
 * when it cannot be).
 *
 * The organisation is always `configOrgId`. A signed assertion from org A's IdP
 * is proof of identity in org A and nothing else, so:
 *   - an existing account must ALREADY hold a membership in `configOrgId`, or
 *     the sign-in is refused (SamlUserNotInOrganisationError → 403). It is not
 *     attached to A, and it is never signed in to another organisation it
 *     belongs to. Until 2026-09-25 the lookup was `WHERE user_id = ?` and the
 *     first row found decided the tenant (audit IAM-03);
 *   - a new account is created with a membership in `configOrgId` only;
 *   - an account that is not active is refused (SamlAccountInactiveError);
 *   - nothing on an existing account is rewritten from the assertion.
 */
async function findOrCreateSamlUser(samlUser: SAMLUser, configOrgId: number): Promise<DbUserResult> {
  const email = samlUser.email.toLowerCase().trim();

  // `users` is the global identity table: the e-mail match only finds the
  // account. Which organisation it signs in to is decided below.
  const existingUsers = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existingUsers.length > 0) {
    const user = existingUsers[0];

    // An account taken out of use signs in to nothing, whatever the IdP says
    // (VSR-001 F-29; the same reading as the password path, routes/auth.ts).
    if (!isActiveAccountStatus(user.status)) {
      throw new SamlAccountInactiveError(user.id, user.email);
    }

    // The membership lookup is scoped to the config's organisation, so a
    // membership elsewhere is neither found nor adopted.
    const membership = await db
      .select({ role: organizationUsers.role })
      .from(organizationUsers)
      .where(
        and(
          eq(organizationUsers.userId, user.id),
          eq(organizationUsers.organizationId, configOrgId)
        )
      )
      .limit(1);
    if (membership.length === 0) {
      throw new SamlUserNotInOrganisationError(user.id, user.email, configOrgId);
    }

    // `users.name` is what signature manifests print; an IdP attribute is not
    // where it changes from. The previous version overwrote it here.
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        orgRole: membership[0].role,
      },
      organizationId: configOrgId,
    };
  }

  // JIT Provisioning: create new user
  logger.info(`JIT provisioning new SAML user: ${email}`);

  const fullName =
    [samlUser.firstName, samlUser.lastName].filter(Boolean).join(' ') || email.split('@')[0];

  const [newUser] = await db
    .insert(users)
    .values({
      email,
      name: fullName,
      // SAML users don't have a local password — they authenticate via IdP
      // Store a non-usable placeholder hash so the NOT NULL constraint is satisfied
      passwordHash: `saml:${crypto.randomUUID()}`,
    })
    .returning();

  // The membership in the config's organisation is part of the sign-in. If it
  // cannot be written the sign-in fails (500) rather than minting a token for
  // an organisation the account is not a member of; the next attempt finds an
  // account with no membership there and refuses it as above. The previous
  // version swallowed this failure and issued the token anyway.
  await db.insert(organizationUsers).values({
    userId: newUser.id,
    organizationId: configOrgId,
    role: 'member',
  });

  return {
    user: {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      orgRole: 'member',
    },
    organizationId: configOrgId,
  };
}

export default router;
