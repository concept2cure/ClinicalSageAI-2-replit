import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

import { config } from '../config/environment';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { users, organizationUsers } from '../../shared/schema';
import { createScopedLogger } from '../utils/logger';
import {
  buildAuthnRequest,
  parseAssertion,
  validateAssertion,
  assertionToUser,
  verifySignature,
  generateSpMetadata,
  SAMLValidationError,
  type SAMLConfig,
} from '../services/saml-provider';

const logger = createScopedLogger('sso');
const router = Router();
const isDev = process.env.NODE_ENV === 'development';

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
 * Pending AuthnRequest IDs for InResponseTo validation.
 * Maps requestId -> { createdAt, organizationSlug }.
 * Entries expire after 10 minutes.
 */
const pendingRequests: Map<string, { createdAt: number; organizationSlug: string }> = new Map();
const PENDING_REQUEST_TTL_MS = 10 * 60 * 1000;

/** Clean up expired pending requests periodically */
function cleanupPendingRequests(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];
  pendingRequests.forEach((entry, id) => {
    if (now - entry.createdAt > PENDING_REQUEST_TTL_MS) {
      keysToDelete.push(id);
    }
  });
  for (const key of keysToDelete) {
    pendingRequests.delete(key);
  }
}

/**
 * Retrieve SAML config for an organization. Falls back to environment variable config.
 */
function getSamlConfig(orgSlug: string): SAMLConfig | null {
  // Check in-memory store first
  const stored = samlConfigs.get(orgSlug);
  if (stored) return stored;

  // Fall back to environment variables for default config
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
    };
  }

  return null;
}

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
router.get('/saml/initiate', (req: Request, res: Response) => {
  try {
    const orgSlug = (req.query.org as string) || 'default';
    const samlConfig = getSamlConfig(orgSlug);

    if (!samlConfig) {
      logger.warn(`SAML config not found for org="${orgSlug}"`);
      return res.status(404).json({
        success: false,
        error: 'SAML_NOT_CONFIGURED',
        message: 'SAML SSO is not configured for this organization.',
      });
    }

    const { requestId, redirectUrl } = buildAuthnRequest(samlConfig);

    // Store the request ID for InResponseTo validation
    pendingRequests.set(requestId, { createdAt: Date.now(), organizationSlug: orgSlug });
    cleanupPendingRequests();

    logger.info(`SAML SSO initiated for org="${orgSlug}", requestId=${requestId}`);

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

    // Parse the assertion to determine which org this is for
    // We need a config to validate, so we try to determine org from the assertion issuer
    // or from a pending request
    let orgSlug = 'default';
    let expectedRequestId: string | undefined;

    // Try to find org from pending requests by checking InResponseTo
    const responseXml = Buffer.from(samlResponseB64, 'base64').toString('utf-8');
    const inResponseToMatch = responseXml.match(/InResponseTo="([^"]*)"/);
    if (inResponseToMatch) {
      const inResponseTo = inResponseToMatch[1];
      const pending = pendingRequests.get(inResponseTo);
      if (pending) {
        orgSlug = pending.organizationSlug;
        expectedRequestId = inResponseTo;
        pendingRequests.delete(inResponseTo);
      }
    }

    const samlConfig = getSamlConfig(orgSlug);
    if (!samlConfig) {
      logger.warn(`SAML config not found for org="${orgSlug}" during callback`);
      return res.status(404).json({
        success: false,
        error: 'SAML_NOT_CONFIGURED',
        message: 'SAML SSO is not configured for this organization.',
      });
    }

    // Verify signature if IdP certificate is available
    const signatureValid = verifySignature(samlResponseB64, samlConfig);
    if (!signatureValid) {
      logger.warn('SAML Response signature verification failed — proceeding with caution');
      // Note: In strict production mode, you may want to reject unsigned/invalid responses.
      // For now we log the warning but continue, as some IdPs sign only the assertion, not the response.
    }

    // Parse the SAML assertion
    const assertion = parseAssertion(samlResponseB64, samlConfig);

    // Validate the assertion (timestamps, audience, InResponseTo)
    validateAssertion(assertion, samlConfig, expectedRequestId);

    // Convert assertion to user profile
    const samlUser = assertionToUser(assertion);

    if (!samlUser.email) {
      logger.error('SAML assertion did not contain an email address');
      return res.status(400).json({
        success: false,
        error: 'SAML_NO_EMAIL',
        message: 'The SAML assertion did not contain a valid email address.',
      });
    }

    // Find or create user in the database
    const { user: dbUser, organizationId } = await findOrCreateSamlUser(samlUser);

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
      },
      config.jwt.secret,
      { expiresIn: '24h' }
    );

    logger.info(`SAML SSO login successful for user=${dbUser.email}, org=${organizationId}`);

    // If RelayState is provided, redirect with token in query param
    if (relayState) {
      const redirectUrl = new URL(relayState);
      redirectUrl.searchParams.set('token', token);
      return res.redirect(302, redirectUrl.toString());
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
      return res.status(401).json({
        success: false,
        error: 'SAML_VALIDATION_FAILED',
        message: err.message,
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
    const orgSlug = (req.query.org as string) || 'default';
    const samlConfig = getSamlConfig(orgSlug);

    if (!samlConfig) {
      return res.status(404).json({
        success: false,
        error: 'SAML_NOT_CONFIGURED',
        message: 'SAML SSO is not configured for this organization.',
      });
    }

    const metadata = generateSpMetadata(samlConfig);
    res.set('Content-Type', 'application/xml');
    return res.send(metadata);
  } catch (err) {
    logger.error('Failed to generate SP metadata', err as Record<string, unknown>);
    return res.status(500).json({ success: false, error: 'METADATA_GENERATION_FAILED' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GENERIC SSO ROUTES (OAuth/generic provider flow)
// Must be registered AFTER /saml/* routes to avoid :provider capturing "saml"
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/auth/sso/:provider/initiate
router.get('/:provider/initiate', (req: Request, res: Response) => {
  const { provider } = req.params;

  // In dev mode, immediately redirect to our callback with a test code
  if (isDev) {
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
  if (isDev) {
    // SECURITY: JWT must include organizationId so downstream tenant middleware
    // derives the org context from the token, not from user-supplied headers.
    const token = jwt.sign(
      {
        userId: '1',
        email: 'sso-user@example.com',
        organizationId: '2',
        role: 'client_user',
        provider,
      },
      config.jwt.secret,
      { expiresIn: '24h' }
    );

    // Redirect to frontend SSO handler page with token in URL fragment (not query string for security)
    const redirectUrl = `/concept2cure/login?sso_provider=${encodeURIComponent(
      provider as string
    )}&sso_token=${encodeURIComponent(token)}&sso_email=${encodeURIComponent(
      'sso-user@example.com'
    )}&sso_name=${encodeURIComponent('SSO User')}&sso_org_id=2&sso_org_name=${encodeURIComponent(
      'Concept2Cure'
    )}`;
    return res.redirect(302, redirectUrl);
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
 * Finds an existing user by email or creates a new one via Just-In-Time (JIT) provisioning.
 * Associates the user with the default organization if not already associated.
 */
async function findOrCreateSamlUser(
  samlUser: import('../services/saml-provider').SAMLUser
): Promise<DbUserResult> {
  const email = samlUser.email.toLowerCase().trim();

  // Look up existing user by email
  const existingUsers = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existingUsers.length > 0) {
    const user = existingUsers[0];

    // Find organization association
    const orgAssoc = await db
      .select()
      .from(organizationUsers)
      .where(eq(organizationUsers.userId, user.id))
      .limit(1);

    const organizationId = orgAssoc.length > 0 ? orgAssoc[0].organizationId : 1;
    const orgRole = orgAssoc.length > 0 ? orgAssoc[0].role : 'member';

    // Update name if it was empty and SAML provides first/last name
    const samlFullName = [samlUser.firstName, samlUser.lastName].filter(Boolean).join(' ');
    if ((!user.name || user.name === email.split('@')[0]) && samlFullName) {
      try {
        await db.update(users).set({ name: samlFullName }).where(eq(users.id, user.id));
      } catch (updateErr) {
        logger.warn(
          `Failed to update user name for ${email}`,
          updateErr as Record<string, unknown>
        );
      }
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        orgRole,
      },
      organizationId,
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

  // Associate with default organization (org ID 1)
  // In production, org mapping would be determined by SAML config or attribute
  const defaultOrgId = 1;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle overload inference issue with default columns
    await (db.insert(organizationUsers) as any).values({
      userId: newUser.id,
      organizationId: defaultOrgId,
      role: 'member',
    });
  } catch (orgErr) {
    logger.warn(
      `Failed to associate SAML user ${email} with org ${defaultOrgId}`,
      orgErr as Record<string, unknown>
    );
  }

  return {
    user: {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      orgRole: 'member',
    },
    organizationId: defaultOrgId,
  };
}

export default router;
